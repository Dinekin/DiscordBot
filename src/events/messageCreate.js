const { Events } = require('discord.js');
const MessageLog = require('../models/MessageLog');
const Guild = require('../models/Guild');
const logger = require('../utils/logger');

// Pomocnicza funkcja do wykrywania linków do GIF-ów
function extractGifInfo(message) {
  if (!message.content) return null;
  
  // Wykrywanie linków Tenor
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
  
  // Wykrywanie linków GIPHY
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
      users: [] // Wypełnione zostanie tylko jeśli jest to potrzebne, aby uniknąć nadmiernego obciążenia API
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
    
    // Dodaj autora, jeśli istnieje
    if (embed.author) {
      processedEmbed.author = {
        name: embed.author.name,
        url: embed.author.url,
        iconURL: embed.author.iconURL
      };
    }
    
    // Dodaj miniaturkę, jeśli istnieje
    if (embed.thumbnail) {
      processedEmbed.thumbnail = {
        url: embed.thumbnail.url,
        height: embed.thumbnail.height,
        width: embed.thumbnail.width
      };
    }
    
    // Dodaj obraz, jeśli istnieje
    if (embed.image) {
      processedEmbed.image = {
        url: embed.image.url,
        height: embed.image.height,
        width: embed.image.width
      };
    }
    
    // Dodaj stopkę, jeśli istnieje
    if (embed.footer) {
      processedEmbed.footer = {
        text: embed.footer.text,
        iconURL: embed.footer.iconURL
      };
    }
    
    // Dodaj pola, jeśli istnieją
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

// Pomocnicza funkcja do przetwarzania referencji (odpowiedzi)
async function processReference(message) {
  if (!message.reference) return null;
  
  try {
    // Pobierz wiadomość, na którą odpowiedziano
    const reference = message.reference;
    
    // Spróbuj pobrać oryginalną wiadomość
    let referencedMessage;
    try {
      const channel = await message.client.channels.fetch(reference.channelId);
      referencedMessage = await channel.messages.fetch(reference.messageId);
    } catch (error) {
      logger.debug(`Nie można pobrać referencyjnej wiadomości: ${error.message}`);
      return {
        messageId: reference.messageId,
        channelId: reference.channelId,
        guildId: reference.guildId || message.guildId
      };
    }
    
    // Jeśli wiadomość została pomyślnie pobrana, zapisz więcej informacji
    if (referencedMessage) {
      const content = referencedMessage.content;
      // Skróć treść, jeśli jest za długa
      const shortContent = content?.length > 200 ? `${content.substring(0, 197)}...` : content;
      
      return {
        messageId: referencedMessage.id,
        channelId: referencedMessage.channel.id,
        guildId: referencedMessage.guild?.id || message.guildId,
        content: shortContent || '[Brak treści]',
        authorId: referencedMessage.author.id,
        authorTag: referencedMessage.author.tag
      };
    }
    
    return null;
  } catch (error) {
    logger.error(`Błąd podczas przetwarzania referencji: ${error.message}`);
    return null;
  }
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    // Ignorowanie wiadomości od botów
    if (message.author.bot) return;
    
    try {
      // Sprawdzenie czy funkcja logowania wiadomości jest włączona na serwerze
      const guildSettings = await Guild.findOne({ guildId: message.guild?.id });
      
      // Jeśli nie ma guildSettings lub funkcja nie jest włączona, lub to nie jest wiadomość serwerowa, zakończ
      if (!message.guild || !guildSettings || !guildSettings.modules?.messageLog) return;
      
      // Przetwarzanie załączników
      const attachments = Array.from(message.attachments.values()).map(attachment => ({
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
      
      // Stworzenie logu wiadomości z rozszerzonymi informacjami
      const messageData = {
        guildId: message.guild.id,
        channelId: message.channel.id,
        messageId: message.id,
        authorId: message.author.id,
        authorTag: message.author.tag,
        content: message.content || '',
        attachments: attachments,
        embeds: processEmbeds(message),
        reactions: processReactions(message),
        stickers: processStickers(message),
        gifAttachment: extractGifInfo(message),
        createdAt: message.createdAt
      };
      
      // Dodaj informacje o referencji (odpowiedzi), jeśli istnieje
      const reference = await processReference(message);
      if (reference) {
        messageData.reference = reference;
      }
      
      // Zapisz log w bazie danych
      await MessageLog.create(messageData);
      
// Opcjonalnie wysyłanie logu na wyznaczony kanał
if (guildSettings.messageLogChannel) {
    const logChannel = await message.guild.channels.fetch(guildSettings.messageLogChannel).catch(() => null);
    
    if (logChannel) {
      // Nie logujemy wiadomości z kanału logów
      if (logChannel.id === message.channel.id) return;
      
      // Sprawdź, czy mamy logować tylko usunięte wiadomości
      if (guildSettings.logDeletedOnly) {
        // Jeśli tak, nie logujemy tworzenia wiadomości
        return;
      }
      
      // Przygotowanie embedu z informacjami o wiadomości
      const logEmbed = {
        color: 0x3498db,
        author: {
          name: message.author.tag,
          icon_url: message.author.displayAvatarURL({ dynamic: true })
        },
        description: `**Wiadomość wysłana w <#${message.channel.id}>**\n${message.content || (messageData.stickers.length > 0 ? '*Naklejka bez tekstu*' : '*Brak treści*')}`,
        fields: [],
        footer: {
          text: `ID: ${message.id}`
        },
        timestamp: new Date()
      };
      
      // Dodanie informacji o załącznikach
      if (attachments.length > 0) {
        logEmbed.fields.push({
          name: `📎 Załączniki (${attachments.length})`,
          value: attachments.map(a => `[${a.name}](${a.url}) ${a.contentType ? `(${a.contentType})` : ''}`).join('\n')
        });
        
        // Dodanie obrazka do embedu jeśli to obrazek
        const imageAttachment = attachments.find(a => 
          a.contentType && a.contentType.startsWith('image/')
        );
        
        if (imageAttachment) {
          logEmbed.image = { url: imageAttachment.url };
        }
      }
      
      // Dodanie informacji o naklejkach
      if (messageData.stickers.length > 0) {
        logEmbed.fields.push({
          name: `🏷️ Naklejki (${messageData.stickers.length})`,
          value: messageData.stickers.map(s => s.url ? `[${s.name}](${s.url})` : s.name).join('\n')
        });
        
        // Dodaj obraz naklejki, jeśli nie dodano już innego obrazu i naklejka ma URL
        if (!logEmbed.image && messageData.stickers[0].url) {
          logEmbed.image = { url: messageData.stickers[0].url };
        }
      }
      
      // Dodanie informacji o gifie
      if (messageData.gifAttachment) {
        logEmbed.fields.push({
          name: '🎬 GIF',
          value: `[${messageData.gifAttachment.platform}](${messageData.gifAttachment.url})`
        });
      }
      
      // Dodanie informacji o referencji
      if (messageData.reference) {
        logEmbed.fields.push({
          name: '↩️ Odpowiedź na',
          value: `Wiadomość od ${messageData.reference.authorTag || 'nieznanego użytkownika'}: ${messageData.reference.content || '[brak treści]'}`
        });
      }
      
      await logChannel.send({ embeds: [logEmbed] });
    }
  }
    } catch (error) {
      logger.error(`Błąd podczas logowania wiadomości: ${error}`);
    }
  },
};