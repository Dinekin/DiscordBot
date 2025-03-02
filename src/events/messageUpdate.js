const { Events } = require('discord.js');
const MessageLog = require('../models/MessageLog');
const Guild = require('../models/Guild');
const logger = require('../utils/logger');

// Pomocnicza funkcja do wykrywania linków do GIF-ów - taka sama jak w messageCreate.js
function extractGifInfo(message) {
  if (!message.content) return null;
  
  const tenorRegex = /https?:\/\/(?:www\.)?tenor\.com\/view\/[a-zA-Z0-9-]+-(?:gif-)?(\d+)/i;
  const tenorMatch = message.content.match(tenorRegex);
  
  if (tenorMatch) {
    return {
      url: tenorMatch[0],
      platform: 'Tenor',
      height: null,
      width: null
    };
  }
  
  const giphyRegex = /https?:\/\/(?:www\.)?giphy\.com\/gifs\/([a-zA-Z0-9-]+)/i;
  const giphyMatch = message.content.match(giphyRegex);
  
  if (giphyMatch) {
    return {
      url: giphyMatch[0],
      platform: 'GIPHY',
      height: null,
      width: null
    };
  }
  
  return null;
}

// Pomocnicza funkcja do przetwarzania reakcji
function processReactions(message) {
  if (!message.reactions || message.reactions.cache.size === 0) {
    return [];
  }
  
  const reactions = [];
  
  message.reactions.cache.forEach(reaction => {
    const emoji = reaction.emoji;
    
    reactions.push({
      name: emoji.name,
      id: emoji.id,
      count: reaction.count,
      isCustom: !!emoji.id,
      animated: emoji.animated || false,
      url: emoji.id ? `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}` : null,
      users: [] // Wypełnione zostanie tylko jeśli jest to potrzebne
    });
  });
  
  return reactions;
}

// Pomocnicza funkcja do przetwarzania naklejek
function processStickers(message) {
  if (!message.stickers || message.stickers.size === 0) {
    return [];
  }
  
  return message.stickers.map(sticker => ({
    id: sticker.id,
    name: sticker.name,
    description: sticker.description || '',
    format: sticker.format || 'Unknown',
    url: sticker.url,
    packId: sticker.packId || null,
    packName: sticker.pack ? sticker.pack.name : null
  }));
}

// Pomocnicza funkcja do przetwarzania embeddów
function processEmbeds(message) {
  if (!message.embeds || message.embeds.length === 0) {
    return [];
  }
  
  return message.embeds.map(embed => {
    const processedEmbed = {
      type: embed.type,
      title: embed.title,
      description: embed.description,
      url: embed.url,
      timestamp: embed.timestamp,
      color: embed.color
    };
    
    if (embed.author) {
      processedEmbed.author = {
        name: embed.author.name,
        url: embed.author.url,
        iconURL: embed.author.iconURL
      };
    }
    
    if (embed.thumbnail) {
      processedEmbed.thumbnail = {
        url: embed.thumbnail.url,
        height: embed.thumbnail.height,
        width: embed.thumbnail.width
      };
    }
    
    if (embed.image) {
      processedEmbed.image = {
        url: embed.image.url,
        height: embed.image.height,
        width: embed.image.width
      };
    }
    
    if (embed.footer) {
      processedEmbed.footer = {
        text: embed.footer.text,
        iconURL: embed.footer.iconURL
      };
    }
    
    if (embed.fields && embed.fields.length > 0) {
      processedEmbed.fields = embed.fields.map(field => ({
        name: field.name,
        value: field.value,
        inline: field.inline
      }));
    }
    
    return processedEmbed;
  });
}

module.exports = {
  name: Events.MessageUpdate,
  async execute(oldMessage, newMessage) {
    // Ignorowanie wiadomości od botów
    if (newMessage.author?.bot) return;
    
    // Jeśli oba obiekty wiadomości nie mają treści lub są identyczne, zignoruj
    if (
      (!oldMessage.content && !newMessage.content) ||
      oldMessage.content === newMessage.content
    ) {
      // Jednak, sprawdź czy inne elementy (jak załączniki, naklejki) mogły ulec zmianie
      const oldAttachmentCount = oldMessage.attachments?.size || 0;
      const newAttachmentCount = newMessage.attachments?.size || 0;
      
      const oldStickerCount = oldMessage.stickers?.size || 0;
      const newStickerCount = newMessage.stickers?.size || 0;
      
      const oldEmbedCount = oldMessage.embeds?.length || 0;
      const newEmbedCount = newMessage.embeds?.length || 0;
      
      // Jeśli żadne elementy nie uległy zmianie, zignoruj
      if (
        oldAttachmentCount === newAttachmentCount &&
        oldStickerCount === newStickerCount &&
        oldEmbedCount === newEmbedCount
      ) {
        return;
      }
    }
    
    try {
      // Sprawdzenie czy funkcja logowania wiadomości jest włączona na serwerze
      const guildSettings = await Guild.findOne({ guildId: newMessage.guild?.id });
      
      // Jeśli nie ma guildSettings lub funkcja nie jest włączona, lub to nie jest wiadomość serwerowa, zakończ
      if (!newMessage.guild || !guildSettings || !guildSettings.modules?.messageLog) return;
      
      // Przetwarzanie załączników z nowej wiadomości
      const attachments = Array.from(newMessage.attachments.values()).map(attachment => ({
        id: attachment.id,
        url: attachment.url,
        name: attachment.name,
        contentType: attachment.contentType,
        size: attachment.size,
        height: attachment.height || null,
        width: attachment.width || null,
        description: attachment.description || null,
        ephemeral: attachment.ephemeral || false
      }));
      
      // Aktualizacja logu wiadomości
      const messageLog = await MessageLog.findOne({ messageId: newMessage.id });
      
      if (messageLog) {
        // Jeśli już jest log, aktualizuj go
        messageLog.originalContent = messageLog.originalContent || messageLog.content;
        messageLog.content = newMessage.content || '';
        messageLog.editedAt = new Date();
        messageLog.attachments = attachments;
        messageLog.embeds = processEmbeds(newMessage);
        messageLog.reactions = processReactions(newMessage);
        messageLog.stickers = processStickers(newMessage);
        messageLog.gifAttachment = extractGifInfo(newMessage);
        
        await messageLog.save();
        logger.debug(`Zaktualizowano log dla edytowanej wiadomości ${newMessage.id}`);
      } else {
        // Jeśli nie ma logu, stwórz nowy
        const messageData = {
          guildId: newMessage.guild.id,
          channelId: newMessage.channel.id,
          messageId: newMessage.id,
          authorId: newMessage.author.id,
          authorTag: newMessage.author.tag,
          content: newMessage.content || '',
          originalContent: oldMessage.content || '',
          editedAt: new Date(),
          attachments: attachments,
          embeds: processEmbeds(newMessage),
          reactions: processReactions(newMessage),
          stickers: processStickers(newMessage),
          gifAttachment: extractGifInfo(newMessage),
          createdAt: newMessage.createdAt
        };
        
        await MessageLog.create(messageData);
        logger.debug(`Utworzono nowy log dla edytowanej wiadomości ${newMessage.id}`);
      }
      
// Opcjonalnie wysyłanie logu na wyznaczony kanał
if (guildSettings.messageLogChannel) {
    const logChannel = await newMessage.guild.channels.fetch(guildSettings.messageLogChannel).catch(() => null);
    
    if (logChannel) {
      // Nie logujemy wiadomości z kanału logów
      if (logChannel.id === newMessage.channel.id) return;
      
      // Sprawdź, czy mamy logować tylko usunięte wiadomości
      if (guildSettings.logDeletedOnly) {
        // Jeśli tak, nie logujemy edycji wiadomości
        return;
      }
      
      //Przygotowanie embedu z informacjami o edycji wiadomości
      const logEmbed = {
          color: 0xf1c40f,
          author: {
          name: newMessage.author.tag,
          icon_url: newMessage.author.displayAvatarURL({ dynamic: true })
          },
          description: `**Wiadomość edytowana w <#${newMessage.channel.id}>**\n[[Link do wiadomości]](${newMessage.url})`,
          fields: [
          {
              name: 'Przed',
              value: oldMessage.content ? oldMessage.content.substring(0, 1024) : 
                  (oldMessage.stickers?.size > 0 ? '*Naklejka bez tekstu*' : '*Brak treści*')
          },
          {
              name: 'Po',
              value: newMessage.content ? newMessage.content.substring(0, 1024) : 
                  (newMessage.stickers?.size > 0 ? '*Naklejka bez tekstu*' : '*Brak treści*')
          }
          ],
          footer: {
            text: `ID: ${newMessage.id}`
          },
          timestamp: new Date()
        };
        
        // Sprawdź, czy załączniki zostały dodane/usunięte
        const oldAttachmentCount = oldMessage.attachments?.size || 0;
        const newAttachmentCount = attachments.length;
        
        if (oldAttachmentCount !== newAttachmentCount) {
          logEmbed.fields.push({
            name: '📎 Załączniki',
            value: `Zmieniono liczbę załączników: ${oldAttachmentCount} → ${newAttachmentCount}`
          });
          
          // Dodanie obrazka do embedu jeśli jest nowy obrazek
          if (newAttachmentCount > 0) {
            const imageAttachment = attachments.find(a => 
              a.contentType && a.contentType.startsWith('image/')
            );
            
            if (imageAttachment && !logEmbed.image) {
              logEmbed.image = { url: imageAttachment.url };
            }
          }
        }
        
        // Sprawdź, czy naklejki zostały dodane/usunięte
        const oldStickerCount = oldMessage.stickers?.size || 0;
        const newStickerCount = newMessage.stickers?.size || 0;
        
        if (oldStickerCount !== newStickerCount) {
          logEmbed.fields.push({
            name: '🏷️ Naklejki',
            value: `Zmieniono liczbę naklejek: ${oldStickerCount} → ${newStickerCount}`
          });
          
          // Dodaj obraz naklejki, jeśli nie dodano już innego obrazu
          if (newStickerCount > 0 && !logEmbed.image) {
            const stickers = processStickers(newMessage);
            if (stickers[0].url) {
              logEmbed.image = { url: stickers[0].url };
            }
          }
        }
        
        await logChannel.send({ embeds: [logEmbed] });
    }
  }
    } catch (error) {
      logger.error(`Błąd podczas logowania edycji wiadomości: ${error.stack}`);
    }
  },
};