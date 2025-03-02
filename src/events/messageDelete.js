const { Events } = require('discord.js');
const MessageLog = require('../models/MessageLog');
const Guild = require('../models/Guild');
const logger = require('../utils/logger');

// Pomocnicza funkcja do wykrywania linków do GIF-ów
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

module.exports = {
  name: Events.MessageDelete,
  async execute(message) {
    // Ignorowanie pustych wiadomości
    if (!message.id) return;
    
    try {
      // Sprawdzenie czy funkcja logowania wiadomości jest włączona na serwerze
      const guildSettings = await Guild.findOne({ guildId: message.guild?.id });
      
      // Jeśli nie ma guildSettings lub funkcja nie jest włączona, lub to nie jest wiadomość serwerowa, zakończ
      if (!message.guild || !guildSettings || !guildSettings.modules?.messageLog) return;
      
      // Aktualizacja logu wiadomości
      const messageLog = await MessageLog.findOne({ messageId: message.id });
      
      if (messageLog) {
        // Jeśli jest log, oznacz jako usunięty
        messageLog.deletedAt = new Date();
        await messageLog.save();
        logger.debug(`Oznaczono wiadomość ${message.id} jako usuniętą`);
      } else if (message.content || message.attachments.size > 0 || message.stickers?.size > 0) {
        // Jeśli nie ma logu, ale mamy treść lub załączniki, stwórz nowy
        // Może się zdarzyć dla starszych wiadomości sprzed włączenia bota
        
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
        
        const messageData = {
          guildId: message.guild.id,
          channelId: message.channel.id,
          messageId: message.id,
          authorId: message.author?.id || 'unknown',
          authorTag: message.author?.tag || 'Unknown User',
          content: message.content || '',
          attachments: attachments,
          embeds: message.embeds || [],
          reactions: processReactions(message),
          stickers: processStickers(message),
          gifAttachment: extractGifInfo(message),
          createdAt: message.createdAt || new Date(),
          deletedAt: new Date()
        };
        
        await MessageLog.create(messageData);
        logger.debug(`Utworzono nowy log dla usuniętej wiadomości ${message.id}`);
      }
      
        // Opcjonalnie wysyłanie logu na wyznaczony kanał
        if (guildSettings.messageLogChannel) {
          const logChannel = await message.guild.channels.fetch(guildSettings.messageLogChannel).catch(() => null);
          
          if (logChannel) {
            // Nie logujemy wiadomości z kanału logów
            if (logChannel.id === message.channel.id) return;
            
            // Uwaga: Intencjonalnie nie sprawdzamy logDeletedOnly, ponieważ
            // ta opcja dotyczy właśnie logowania usuwanych wiadomości,
            // więc w tym przypadku zawsze logujemy, niezależnie od wartości logDeletedOnly
            
            // Przygotowanie embedu z informacjami o usuniętej wiadomości
            const logEmbed = {
              color: 0xe74c3c,
              author: {
                name: message.author?.tag || 'Nieznany użytkownik',
                icon_url: message.author?.displayAvatarURL({ dynamic: true })
              },
              description: `**Wiadomość usunięta w <#${message.channel.id}>**\n${
                message.content || 
                (message.stickers?.size > 0 ? '*Naklejka bez tekstu*' : '*Brak treści*')
              }`,
              fields: [],
              footer: {
                text: `ID: ${message.id}`
              },
              timestamp: new Date()
            };
          
          // Dodanie informacji o załącznikach
          if (message.attachments.size > 0) {
            const attachmentsInfo = Array.from(message.attachments.values())
              .map(a => `${a.name} [${a.contentType || 'unknown'}]\n${a.url}`)
              .join('\n\n');
            
            logEmbed.fields.push({
              name: `📎 Usunięte załączniki (${message.attachments.size})`,
              value: attachmentsInfo || 'Nie można odzyskać załączników'
            });
            
            // Dodanie obrazka do embedu jeśli to obrazek
            const imageAttachment = Array.from(message.attachments.values()).find(a => 
              a.contentType && a.contentType.startsWith('image/')
            );
            
            if (imageAttachment) {
              logEmbed.image = { url: imageAttachment.url };
            }
          }
          
          // Dodanie informacji o naklejkach
          if (message.stickers?.size > 0) {
            const stickersInfo = Array.from(message.stickers.values())
              .map(s => s.url ? `[${s.name}](${s.url})` : s.name)
              .join('\n');
            
            logEmbed.fields.push({
              name: `🏷️ Usunięte naklejki (${message.stickers.size})`,
              value: stickersInfo || 'Nie można odzyskać naklejek'
            });
            
            // Dodaj obraz naklejki, jeśli nie dodano już innego obrazu
            if (!logEmbed.image && message.stickers.first()?.url) {
              logEmbed.image = { url: message.stickers.first().url };
            }
          }
          
          // Dodanie informacji o reakcjach
          if (message.reactions?.cache.size > 0) {
            const reactionsInfo = Array.from(message.reactions.cache.values())
              .map(r => {
                const emoji = r.emoji;
                const emojiText = emoji.id 
                  ? `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`
                  : emoji.name;
                return `${emojiText} (${r.count})`;
              })
              .join(' ');
            
            logEmbed.fields.push({
              name: '👍 Reakcje',
              value: reactionsInfo || 'Nie można odzyskać reakcji'
            });
          }
          
          // Dodanie informacji o gif
          const gifInfo = extractGifInfo(message);
          if (gifInfo) {
            logEmbed.fields.push({
              name: '🎬 GIF',
              value: `[${gifInfo.platform}](${gifInfo.url})`
            });
          }
          
          await logChannel.send({ embeds: [logEmbed] });
        }
      }
    } catch (error) {
      logger.error(`Błąd podczas logowania usunięcia wiadomości: ${error.stack}`);
    }
  },
};