// src/events/threadCreate.js - zdarzenie utworzenia wątku
const { Events, EmbedBuilder } = require('discord.js');
const Guild = require('../models/Guild');
const MessageLog = require('../models/MessageLog');
const logger = require('../utils/logger');

// Funkcja do pobierania treści pierwszej wiadomości z wątku
async function getThreadStarterMessage(thread) {
  try {
    // Sprawdź czy to wątek forum
    if (thread.parent?.type === 15) { // GUILD_FORUM
      // Dla wątków forum, spróbuj pobrać pierwszą wiadomość
      const messages = await thread.messages.fetch({ limit: 1 });
      const starterMessage = messages.first();
      
      if (starterMessage) {
        let content = [];
        
        // Dodaj treść tekstową
        if (starterMessage.content && starterMessage.content.trim()) {
          content.push(starterMessage.content);
        }
        
        // Dodaj informacje o załącznikach
        if (starterMessage.attachments && starterMessage.attachments.size > 0) {
          const attachmentNames = Array.from(starterMessage.attachments.values())
            .map(a => `📎 ${a.name}`)
            .join(', ');
          content.push(`Załączniki: ${attachmentNames}`);
        }
        
        // Dodaj informacje o embeddach
        if (starterMessage.embeds && starterMessage.embeds.length > 0) {
          const embedInfo = starterMessage.embeds.map(embed => {
            let info = [];
            if (embed.title) info.push(`"${embed.title}"`);
            if (embed.description) info.push(embed.description.substring(0, 100) + (embed.description.length > 100 ? '...' : ''));
            return info.join(' - ');
          }).join('; ');
          content.push(`📋 Embeddy: ${embedInfo}`);
        }
        
        // Dodaj informacje o naklejkach
        if (starterMessage.stickers && starterMessage.stickers.size > 0) {
          const stickerNames = Array.from(starterMessage.stickers.values())
            .map(s => `🏷️ ${s.name}`)
            .join(', ');
          content.push(`Naklejki: ${stickerNames}`);
        }
        
        if (content.length > 0) {
          return content.join('\n');
        }
      }
    }
    
    return null;
  } catch (error) {
    logger.error(`Błąd podczas pobierania pierwszej wiadomości wątku: ${error.message}`);
    return null;
  }
}

module.exports = {
  name: Events.ThreadCreate,
  async execute(thread) {
    try {
      // Sprawdź czy funkcja logowania wiadomości jest włączona na serwerze
      const guildSettings = await Guild.findOne({ guildId: thread.guild?.id });
      
      // Jeśli nie ma guildSettings lub funkcja nie jest włączona, zakończ
      if (!thread.guild || !guildSettings || !guildSettings.modules?.messageLog) return;
      
      // Opcjonalnie wysyłanie logu na wyznaczony kanał
      if (guildSettings.messageLogChannel) {
        const logChannel = await thread.guild.channels.fetch(guildSettings.messageLogChannel).catch(() => null);
        
        if (logChannel) {
          // Nie logujemy zdarzeń z kanału logów
          if (logChannel.id === thread.parent?.id) return;
          
          // Pobierz treść pierwszej wiadomości z wątku
          const starterContent = await getThreadStarterMessage(thread);
          
          // Przygotowanie embedu z informacjami o nowej nitce
          const logEmbed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle('Utworzono nową nitkę')
            .setDescription(`**Nazwa:** ${thread.name}`)
            .addFields(
              { name: 'Kanał nadrzędny', value: thread.parent ? `<#${thread.parent.id}>` : 'Nieznany' },
              { name: 'Typ', value: getThreadTypeText(thread.type) }
            )
            .setFooter({ text: `ID nitki: ${thread.id}` })
            .setTimestamp();
          
          // Dodaj informacje o twórcy jeśli dostępne
          if (thread.ownerId) {
            try {
              const owner = await thread.guild.members.fetch(thread.ownerId);
              logEmbed.addFields({ name: 'Utworzono przez', value: `${owner} (${owner.user.tag})` });
            } catch (error) {
              logEmbed.addFields({ name: 'Utworzono przez', value: `<@${thread.ownerId}>` });
            }
          }
          
          // Dodaj treść pierwszej wiadomości jeśli dostępna
          if (starterContent) {
            const truncatedContent = starterContent.length > 1024 
              ? starterContent.substring(0, 1021) + '...' 
              : starterContent;
            logEmbed.addFields({ name: 'Treść pierwszej wiadomości', value: truncatedContent });
          }
          
          // Dodaj informacje o wątku forum jeśli to wątek forum
          if (thread.parent?.type === 15) { // 15 = GUILD_FORUM
            logEmbed.setTitle('Utworzono nowy wątek forum')
              .setColor(0x9b59b6);
            
            // Dodaj tagi jeśli są dostępne
            if (thread.appliedTags && thread.appliedTags.length > 0) {
              const tagsText = thread.appliedTags.map(tagId => {
                const tag = thread.parent.availableTags.find(t => t.id === tagId);
                return tag ? `\`${tag.name}\`` : `\`${tagId}\``;
              }).join(', ');
              
              logEmbed.addFields({ name: 'Tagi', value: tagsText || 'Brak tagów' });
            }
            
            // Dodaj informacje o ustawieniach automatycznej archiwizacji
            if (thread.autoArchiveDuration) {
              logEmbed.addFields({ 
                name: 'Auto-archiwizacja', 
                value: formatArchiveDuration(thread.autoArchiveDuration) 
              });
            }
          }
          
          // Dodaj informacje o slowmode jeśli jest ustawiony
          if (thread.rateLimitPerUser && thread.rateLimitPerUser > 0) {
            logEmbed.addFields({ 
              name: 'Slowmode', 
              value: `${thread.rateLimitPerUser} sekund` 
            });
          }
          
          // Dodaj link do wątku
          logEmbed.addFields({ 
            name: 'Link', 
            value: `[Przejdź do wątku](https://discord.com/channels/${thread.guild.id}/${thread.id})` 
          });
          
          await logChannel.send({ embeds: [logEmbed] });
        }
      }

      // Zapisz informacje o utworzeniu wątku do bazy danych
      await logThreadCreateToDatabase(thread);
    } catch (error) {
      logger.error(`Błąd podczas logowania utworzenia nitki: ${error.stack}`);
    }
  }
};

// Funkcja do zapisywania utworzenia wątku do bazy danych
async function logThreadCreateToDatabase(thread) {
  try {
    // Znajdź lub utwórz dokument MessageLog dla tego wątku
    let messageLog = await MessageLog.findOne({
      guildId: thread.guild.id,
      channelId: thread.id
    });

    if (!messageLog) {
      messageLog = new MessageLog({
        guildId: thread.guild.id,
        channelId: thread.id,
        messageId: `thread-create-${thread.id}-${Date.now()}`, // Unikalne ID dla utworzenia wątku
        authorId: thread.ownerId || 'system',
        authorTag: thread.ownerId ? 'Unknown' : 'System',
        content: '',
        threadLogs: []
      });
    }

    // Dodaj log wątku
    messageLog.threadLogs.push({
      type: 'create',
      threadId: thread.id,
      threadName: thread.name,
      parentId: thread.parent?.id,
      parentName: thread.parent?.name,
      authorId: thread.ownerId,
      authorTag: 'Unknown', // Pobierzemy to później jeśli potrzebne
      isForumPost: thread.parent?.type === 15
    });

    await messageLog.save();
    logger.info(`Zapisano utworzenie wątku ${thread.name} w bazie danych`);
  } catch (error) {
    logger.error(`Błąd podczas zapisywania utworzenia wątku do bazy danych: ${error.stack}`);
  }
}

// Funkcja pomocnicza do tłumaczenia typu nitki
function getThreadTypeText(type) {
  switch (type) {
    case 11: return 'Publiczna nitka (PUBLIC_THREAD)';
    case 12: return 'Prywatna nitka (PRIVATE_THREAD)';
    case 13: return 'Ogłoszenie (ANNOUNCEMENT_THREAD)';
    default: return `Nieznany (${type})`;
  }
}

// Funkcja pomocnicza do formatowania czasu archiwizacji
function formatArchiveDuration(minutes) {
  if (!minutes) return 'Nieznany';
  
  if (minutes === 60) return '1 godzina';
  if (minutes === 1440) return '1 dzień';
  if (minutes === 4320) return '3 dni';
  if (minutes === 10080) return '1 tydzień';
  
  return `${minutes} minut`;
}
