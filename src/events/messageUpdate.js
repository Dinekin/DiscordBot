const { Events } = require('discord.js');
const MessageLog = require('../models/MessageLog');
const Guild = require('../models/Guild');
const logger = require('../utils/logger');

// Funkcja do lepszego formatowania treści wiadomości
function getMessageContentDescription(message) {
  let parts = [];
  
  // Sprawdź treść tekstową
  if (message.content && message.content.trim()) {
    parts.push(message.content);
  }
  
  // Sprawdź embeddy
  if (message.embeds && message.embeds.length > 0) {
    const embedDescriptions = message.embeds.map(embed => {
      let embedInfo = [];
      if (embed.title) embedInfo.push(`Tytuł: "${embed.title}"`);
      if (embed.description) embedInfo.push(`Opis: "${embed.description.substring(0, 100)}${embed.description.length > 100 ? '...' : ''}"`);
      if (embed.url) embedInfo.push(`URL: ${embed.url}`);
      return `[Embed: ${embedInfo.join(', ') || 'Bez treści'}]`;
    });
    parts.push(...embedDescriptions);
  }
  
  // Sprawdź załączniki
  if (message.attachments && message.attachments.size > 0) {
    const attachmentNames = Array.from(message.attachments.values())
      .map(a => `📎 ${a.name}`)
      .join(', ');
    parts.push(`Załączniki: ${attachmentNames}`);
  }
  
  // Sprawdź naklejki
  if (message.stickers && message.stickers.size > 0) {
    const stickerNames = Array.from(message.stickers.values())
      .map(s => `🏷️ ${s.name}`)
      .join(', ');
    parts.push(`Naklejki: ${stickerNames}`);
  }
  
  // Sprawdź typ wiadomości
  if (message.type && message.type !== 0) { // 0 = DEFAULT
    const messageTypes = {
      1: 'Dodano odbiorcę',
      2: 'Usunięto odbiorcę', 
      3: 'Połączenie',
      4: 'Zmiana nazwy kanału',
      5: 'Zmiana ikony kanału',
      6: 'Przypięto wiadomość',
      7: 'Dołączenie do serwera',
      8: 'Server boost',
      9: 'Server boost (poziom 1)',
      10: 'Server boost (poziom 2)',
      11: 'Server boost (poziom 3)',
      12: 'Nowy kanał ogłoszeń',
      14: 'Nowa wiadomość w wątku',
      15: 'Odpowiedź',
      18: 'Slash command',
      19: 'Wiadomość startowa wątku',
      20: 'Zaproszenie do aktywności',
      21: 'Aplikacja'
    };
    
    const typeName = messageTypes[message.type] || `Typ ${message.type}`;
    parts.push(`[${typeName}]`);
  }
  
  // Sprawdź interakcję (slash commands)
  if (message.interaction) {
    parts.push(`[Slash Command: /${message.interaction.commandName}]`);
  }
  
  // Sprawdź referencję (odpowiedź na wiadomość)
  if (message.reference) {
    parts.push('[Odpowiedź na wiadomość]');
  }
  
  // Jeśli nadal nie ma treści, zwróć informację o tym
  if (parts.length === 0) {
    parts.push('*Wiadomość systemowa bez treści*');
  }
  
  return parts.join('\n');
}

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
    
    // Sprawdź czy są jakieś zmiany w treści lub elementach
    const hasContentChange = oldMessage.content !== newMessage.content;
    const hasAttachmentChange = (oldMessage.attachments?.size || 0) !== (newMessage.attachments?.size || 0);
    const hasStickerChange = (oldMessage.stickers?.size || 0) !== (newMessage.stickers?.size || 0);
    const hasEmbedChange = (oldMessage.embeds?.length || 0) !== (newMessage.embeds?.length || 0);
    
    // Jeśli nie ma żadnych zmian, zignoruj
    if (!hasContentChange && !hasAttachmentChange && !hasStickerChange && !hasEmbedChange) {
      return;
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
          
          // Używamy nowej funkcji do lepszego opisu wiadomości
          const oldMessageDescription = getMessageContentDescription(oldMessage);
          const newMessageDescription = getMessageContentDescription(newMessage);
          
          // Przygotowanie embedu z informacjami o edycji wiadomości
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
                value: oldMessageDescription.length > 1024 ? oldMessageDescription.substring(0, 1021) + '...' : oldMessageDescription
              },
              {
                name: 'Po',
                value: newMessageDescription.length > 1024 ? newMessageDescription.substring(0, 1021) + '...' : newMessageDescription
              }
            ],
            footer: {
              text: `ID: ${newMessage.id} | Typ: ${newMessage.type || 0}`
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
          
          // Sprawdź, czy embeddy zostały dodane/usunięte
          const oldEmbedCount = oldMessage.embeds?.length || 0;
          const newEmbedCount = newMessage.embeds?.length || 0;
          
          if (oldEmbedCount !== newEmbedCount) {
            logEmbed.fields.push({
              name: '📋 Embeddy',
              value: `Zmieniono liczbę embeddów: ${oldEmbedCount} → ${newEmbedCount}`
            });
          }
          
          // Dodanie informacji o interakcji (slash commands) jeśli istnieje
          if (newMessage.interaction) {
            logEmbed.fields.push({
              name: '⚡ Interakcja',
              value: `Slash Command: \`/${newMessage.interaction.commandName}\` przez ${newMessage.interaction.user.tag}`
            });
          }
          
          await logChannel.send({ embeds: [logEmbed] });
        }
      }
    } catch (error) {
      logger.error(`Błąd podczas logowania edycji wiadomości: ${error.stack}`);
    }
  },
};