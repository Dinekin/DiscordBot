const { Events } = require('discord.js');
const MessageLog = require('../models/MessageLog');
const Guild = require('../models/Guild');
const logger = require('../utils/logger');

// Funkcja do lepszego formatowania treści usuniętej wiadomości
function getDeletedMessageContentDescription(message) {
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
      .map(a => `📎 ${a.name} (${a.contentType || 'nieznany typ'})`)
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
    parts.push(`[Usunięto: ${typeName}]`);
  }
  
  // Sprawdź interakcję (slash commands)
  if (message.interaction) {
    parts.push(`[Usunięto Slash Command: /${message.interaction.commandName}]`);
  }
  
  // Sprawdź referencję (odpowiedź na wiadomość)
  if (message.reference) {
    parts.push('[Usunięto odpowiedź na wiadomość]');
  }
  
  // Sprawdź reakcje
  if (message.reactions && message.reactions.cache.size > 0) {
    const reactionsInfo = Array.from(message.reactions.cache.values())
      .map(r => {
        const emoji = r.emoji;
        const emojiText = emoji.id 
          ? `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`
          : emoji.name;
        return `${emojiText} (${r.count})`;
      })
      .join(' ');
    parts.push(`Reakcje: ${reactionsInfo}`);
  }
  
  // Jeśli nadal nie ma treści, zwróć informację o tym
  if (parts.length === 0) {
    parts.push('*Usunięto wiadomość systemową bez treści*');
  }
  
  return parts.join('\n');
}

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
      } else if (message.content || message.attachments.size > 0 || message.stickers?.size > 0 || message.embeds?.length > 0 || message.type !== 0) {
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
          
          // Używamy nowej funkcji do lepszego opisu usuniętej wiadomości
          const messageDescription = getDeletedMessageContentDescription(message);
          
          // Przygotowanie embedu z informacjami o usuniętej wiadomości
          const logEmbed = {
            color: 0xe74c3c,
            author: {
              name: message.author?.tag || 'Nieznany użytkownik',
              icon_url: message.author?.displayAvatarURL({ dynamic: true })
            },
            description: `**Wiadomość usunięta w <#${message.channel.id}>**\n${messageDescription}`,
            fields: [],
            footer: {
              text: `ID: ${message.id} | Typ: ${message.type || 0}`
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
          
          // Dodanie informacji o embeddach
          if (message.embeds?.length > 0) {
            const embedsInfo = message.embeds.map((embed, index) => {
              let info = [];
              if (embed.title) info.push(`Tytuł: "${embed.title}"`);
              if (embed.description) info.push(`Opis: "${embed.description.substring(0, 100)}${embed.description.length > 100 ? '...' : ''}"`);
              if (embed.url) info.push(`URL: ${embed.url}`);
              return `${index + 1}. ${info.join(', ')}`;
            }).join('\n');
            
            logEmbed.fields.push({
              name: `📋 Usunięte embeddy (${message.embeds.length})`,
              value: embedsInfo || 'Nie można odzyskać embeddów'
            });
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
          
          // Dodanie informacji o interakcji (slash commands)
          if (message.interaction) {
            logEmbed.fields.push({
              name: '⚡ Usunięta interakcja',
              value: `Slash Command: \`/${message.interaction.commandName}\` przez ${message.interaction.user.tag}`
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