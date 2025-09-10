// src/events/channelUpdate.js - zdarzenie aktualizacji kanału
const { Events, EmbedBuilder, AuditLogEvent, ChannelType } = require('discord.js');
const Guild = require('../models/Guild');
const MessageLog = require('../models/MessageLog');
const logger = require('../utils/logger');

module.exports = {
  name: Events.ChannelUpdate,
  async execute(oldChannel, newChannel) {
    try {
      // Pomijamy kanały DM
      if (!newChannel.guild) return;
      
      // Sprawdź czy funkcja logowania jest włączona na serwerze
      const guildSettings = await Guild.findOne({ guildId: newChannel.guild.id });
      
      // Jeśli nie ma guildSettings lub funkcja nie jest włączona, zakończ
      if (!guildSettings || !guildSettings.modules?.messageLog) return;
      
      // Sprawdź, czy mamy logować tylko usunięte wiadomości
      if (guildSettings.logDeletedOnly) {
        // Jeśli tak, nie logujemy aktualizacji kanałów
        return;
      }
      
      // Sprawdź czy kanał logów istnieje
      if (!guildSettings.messageLogChannel) return;
      
      const logChannel = await newChannel.guild.channels.fetch(guildSettings.messageLogChannel).catch(() => null);
      if (!logChannel || logChannel.id === newChannel.id) return;
      
      // Przygotuj listę zmian, które wystąpiły
      const changes = [];
      let importantChange = false;
      const isForum = newChannel.type === ChannelType.GuildForum;
      
      // Sprawdź czy zmieniła się nazwa
      if (oldChannel.name !== newChannel.name) {
        changes.push({
          name: '📝 Nazwa',
          value: `**Przed:** ${oldChannel.name}\n**Po:** ${newChannel.name}`,
          inline: false
        });
        importantChange = true;
      }
      
      // Sprawdź czy zmienił się temat/opis
      if (oldChannel.topic !== newChannel.topic) {
        const oldTopic = oldChannel.topic || '*Brak*';
        const newTopic = newChannel.topic || '*Brak*';
        
        changes.push({
          name: isForum ? '📋 Opis forum' : '📝 Temat kanału',
          value: `**Przed:** ${oldTopic.length > 100 ? oldTopic.substring(0, 97) + '...' : oldTopic}\n**Po:** ${newTopic.length > 100 ? newTopic.substring(0, 97) + '...' : newTopic}`,
          inline: false
        });
        importantChange = true;
      }
      
      // Sprawdź czy zmieniła się kategoria nadrzędna
      if (oldChannel.parentId !== newChannel.parentId) {
        let oldParentName = 'Brak (kanał główny)';
        let newParentName = 'Brak (kanał główny)';
        
        if (oldChannel.parentId) {
          const oldParent = newChannel.guild.channels.cache.get(oldChannel.parentId);
          if (oldParent) oldParentName = `${oldParent.name} (${oldParent.id})`;
        }
        
        if (newChannel.parentId) {
          const newParent = newChannel.guild.channels.cache.get(newChannel.parentId);
          if (newParent) newParentName = `${newParent.name} (${newParent.id})`;
        }
        
        changes.push({
          name: '📁 Kategoria',
          value: `**Przed:** ${oldParentName}\n**Po:** ${newParentName}`,
          inline: false
        });
        importantChange = true;
      }
      
      // Sprawdź czy zmieniły się uprawnienia (podstawowe sprawdzenie)
      if (oldChannel.permissionOverwrites.cache.size !== newChannel.permissionOverwrites.cache.size) {
        changes.push({
          name: '🔐 Uprawnienia',
          value: `Zmieniono liczbę nadpisań uprawnień: ${oldChannel.permissionOverwrites.cache.size} → ${newChannel.permissionOverwrites.cache.size}`,
          inline: false
        });
      }
      
      // Sprawdzenia specyficzne dla forów
      if (isForum) {
        // Sprawdź zmiany w dostępnych tagach
        const oldTagsCount = oldChannel.availableTags?.length || 0;
        const newTagsCount = newChannel.availableTags?.length || 0;
        
        if (oldTagsCount !== newTagsCount) {
          changes.push({
            name: '🏷️ Tagi forum',
            value: `Zmieniono liczbę dostępnych tagów: ${oldTagsCount} → ${newTagsCount}`,
            inline: true
          });
        } else if (oldChannel.availableTags && newChannel.availableTags) {
          // Sprawdź czy zmieniły się nazwy/emoji tagów
          const oldTagNames = oldChannel.availableTags.map(t => t.name).sort().join(', ');
          const newTagNames = newChannel.availableTags.map(t => t.name).sort().join(', ');
          
          if (oldTagNames !== newTagNames) {
            changes.push({
              name: '🏷️ Nazwy tagów',
              value: 'Zmieniono nazwy lub kolejność tagów forum',
              inline: true
            });
          }
        }
        
        // Sprawdź zmiany w domyślnej reakcji
        const oldReaction = oldChannel.defaultReactionEmoji;
        const newReaction = newChannel.defaultReactionEmoji;
        
        if (oldReaction?.id !== newReaction?.id || oldReaction?.name !== newReaction?.name) {
          let oldEmoji = 'Brak';
          let newEmoji = 'Brak';
          
          if (oldReaction) {
            oldEmoji = oldReaction.id
              ? `<:${oldReaction.name}:${oldReaction.id}>`
              : oldReaction.name;
          }
          
          if (newReaction) {
            newEmoji = newReaction.id
              ? `<:${newReaction.name}:${newReaction.id}>`
              : newReaction.name;
          }
          
          changes.push({
            name: '👍 Domyślna reakcja',
            value: `**Przed:** ${oldEmoji}\n**Po:** ${newEmoji}`,
            inline: true
          });
        }
        
        // Sprawdź zmiany w domyślnej auto-archiwizacji
        if (oldChannel.defaultAutoArchiveDuration !== newChannel.defaultAutoArchiveDuration) {
          const oldDuration = formatArchiveDuration(oldChannel.defaultAutoArchiveDuration);
          const newDuration = formatArchiveDuration(newChannel.defaultAutoArchiveDuration);
          
          changes.push({
            name: '📁 Domyślna auto-archiwizacja',
            value: `**Przed:** ${oldDuration}\n**Po:** ${newDuration}`,
            inline: true
          });
        }
        
        // Sprawdź zmiany w domyślnym slowmode wątków
        if (oldChannel.defaultThreadRateLimitPerUser !== newChannel.defaultThreadRateLimitPerUser) {
          const oldRate = oldChannel.defaultThreadRateLimitPerUser || 0;
          const newRate = newChannel.defaultThreadRateLimitPerUser || 0;
          
          changes.push({
            name: '🐌 Domyślny slowmode wątków',
            value: `**Przed:** ${oldRate === 0 ? 'Wyłączony' : `${oldRate} sekund`}\n**Po:** ${newRate === 0 ? 'Wyłączony' : `${newRate} sekund`}`,
            inline: true
          });
        }
        
        // Sprawdź zmiany w sortowaniu
        if (oldChannel.defaultSortOrder !== newChannel.defaultSortOrder) {
          const sortTexts = {
            0: 'Najnowsza aktywność',
            1: 'Data utworzenia'
          };
          
          const oldSort = sortTexts[oldChannel.defaultSortOrder] || `Nieznane (${oldChannel.defaultSortOrder})`;
          const newSort = sortTexts[newChannel.defaultSortOrder] || `Nieznane (${newChannel.defaultSortOrder})`;
          
          changes.push({
            name: '📊 Domyślne sortowanie',
            value: `**Przed:** ${oldSort}\n**Po:** ${newSort}`,
            inline: true
          });
        }
        
        // Sprawdź zmiany w layoutcie forum
        if (oldChannel.defaultForumLayout !== newChannel.defaultForumLayout) {
          const layoutTexts = {
            0: 'Niespecyfikowany',
            1: 'Widok listy',
            2: 'Widok galerii'
          };
          
          const oldLayout = layoutTexts[oldChannel.defaultForumLayout] || `Nieznany (${oldChannel.defaultForumLayout})`;
          const newLayout = layoutTexts[newChannel.defaultForumLayout] || `Nieznany (${newChannel.defaultForumLayout})`;
          
          changes.push({
            name: '🖼️ Layout forum',
            value: `**Przed:** ${oldLayout}\n**Po:** ${newLayout}`,
            inline: true
          });
        }
      }
      
      // Sprawdzenia dla kanałów tekstowych i ogłoszeń
      if (newChannel.type === ChannelType.GuildText || newChannel.type === ChannelType.GuildAnnouncement) {
        // Sprawdź czy zmieniło się ograniczenie szybkości
        if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
          const oldLimit = oldChannel.rateLimitPerUser ? `${oldChannel.rateLimitPerUser} sekund` : 'Brak';
          const newLimit = newChannel.rateLimitPerUser ? `${newChannel.rateLimitPerUser} sekund` : 'Brak';
          
          changes.push({
            name: '🐌 Slowmode',
            value: `**Przed:** ${oldLimit}\n**Po:** ${newLimit}`,
            inline: true
          });
        }
        
        // Sprawdź czy zmienił się status NSFW
        if (oldChannel.nsfw !== newChannel.nsfw) {
          changes.push({
            name: '🔞 NSFW',
            value: `**Przed:** ${oldChannel.nsfw ? 'Tak' : 'Nie'}\n**Po:** ${newChannel.nsfw ? 'Tak' : 'Nie'}`,
            inline: true
          });
        }
      }
      
      // Sprawdzenia dla kanałów głosowych
      if (newChannel.type === ChannelType.GuildVoice || newChannel.type === ChannelType.GuildStageVoice) {
        // Sprawdź zmiany w limicie użytkowników
        if (oldChannel.userLimit !== newChannel.userLimit) {
          const oldLimit = oldChannel.userLimit === 0 ? 'Brak limitu' : oldChannel.userLimit.toString();
          const newLimit = newChannel.userLimit === 0 ? 'Brak limitu' : newChannel.userLimit.toString();
          
          changes.push({
            name: '👥 Limit użytkowników',
            value: `**Przed:** ${oldLimit}\n**Po:** ${newLimit}`,
            inline: true
          });
        }
        
        // Sprawdź zmiany w bitrate
        if (oldChannel.bitrate !== newChannel.bitrate) {
          changes.push({
            name: '🔊 Bitrate',
            value: `**Przed:** ${oldChannel.bitrate / 1000} kbps\n**Po:** ${newChannel.bitrate / 1000} kbps`,
            inline: true
          });
        }
        
        // Sprawdź zmiany w regionie
        if (oldChannel.rtcRegion !== newChannel.rtcRegion) {
          const oldRegion = oldChannel.rtcRegion || 'Automatyczny';
          const newRegion = newChannel.rtcRegion || 'Automatyczny';
          
          changes.push({
            name: '🌍 Region głosowy',
            value: `**Przed:** ${oldRegion}\n**Po:** ${newRegion}`,
            inline: true
          });
        }
      }
      
      // Sprawdź czy zmieniła się pozycja
      if (oldChannel.position !== newChannel.position) {
        changes.push({
          name: '📍 Pozycja',
          value: `**Przed:** ${oldChannel.position}\n**Po:** ${newChannel.position}`,
          inline: true
        });
      }
      
      // Jeśli nie wykryto zmian, zakończ
      if (changes.length === 0) return;
      
      // Pobierz informacje z dziennika audytu
      let executor = null;
      let reason = "Nie podano powodu";
      
      try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const auditLogs = await newChannel.guild.fetchAuditLogs({
          limit: 1,
          type: AuditLogEvent.ChannelUpdate
        });
        
        const channelLog = auditLogs.entries.first();
        
        if (channelLog && channelLog.target.id === newChannel.id) {
          executor = channelLog.executor;
          if (channelLog.reason) reason = channelLog.reason;
        }
      } catch (error) {
        logger.error(`Błąd podczas pobierania dziennika audytu dla aktualizacji kanału: ${error.message}`);
      }
      
      // Określ typ kanału i kolor
      const channelTypeText = getChannelTypeText(newChannel.type);
      let embedColor = 0xF1C40F; // Żółty dla zwykłych zmian
      if (isForum) embedColor = 0x9B59B6; // Fioletowy dla forów
      else if (importantChange) embedColor = 0x3498DB; // Niebieski dla ważnych zmian
      
      // Przygotuj embed z informacjami o aktualizacji kanału
      const embed = new EmbedBuilder()
        .setTitle(`${isForum ? '🗂️ Zaktualizowano forum' : '📁 Zaktualizowano kanał'}`)
        .setColor(embedColor)
        .setDescription(`**Kanał:** ${newChannel.name} (<#${newChannel.id}>)`)
        .addFields({ 
          name: '📋 Typ', 
          value: channelTypeText,
          inline: true 
        })
        .setTimestamp()
        .setFooter({ text: `ID kanału: ${newChannel.id}` });
      
      // Dodaj wykryte zmiany
      changes.forEach(change => {
        embed.addFields(change);
      });
      
      if (executor) {
        embed.addFields({ 
          name: '👤 Zaktualizowany przez', 
          value: `${executor.tag} (${executor.id})`,
          inline: true 
        });
      }
      
      if (reason !== "Nie podano powodu") {
        embed.addFields({ 
          name: '📝 Powód', 
          value: reason,
          inline: false 
        });
      }
      
      // Dodaj link do kanału
      embed.addFields({ 
        name: '🔗 Link', 
        value: `<#${newChannel.id}>`,
        inline: true 
      });
      
      // Dodaj szczegółowe informacje o tagach forum jeśli się zmieniły
      if (isForum && newChannel.availableTags && newChannel.availableTags.length > 0) {
        const tagsDescription = newChannel.availableTags
          .map(tag => {
            let tagInfo = `• **${tag.name}**`;
            if (tag.emoji) {
              const emojiText = tag.emoji.id 
                ? `<:${tag.emoji.name}:${tag.emoji.id}>` 
                : tag.emoji.name;
              tagInfo = `${emojiText} ${tagInfo}`;
            }
            if (tag.moderated) tagInfo += ' (moderowany)';
            return tagInfo;
          })
          .join('\n');
        
        if (tagsDescription.length <= 1024) {
          embed.addFields({ 
            name: `🏷️ Aktualne tagi (${newChannel.availableTags.length})`, 
            value: tagsDescription,
            inline: false 
          });
        }
      }
      
      await logChannel.send({ embeds: [embed] });

      // Zapisz informacje o aktualizacji kanału do bazy danych
      await logChannelUpdateToDatabase(oldChannel, newChannel, changes, executor, reason);
    } catch (error) {
      logger.error(`Błąd podczas logowania aktualizacji kanału: ${error.stack}`);
    }
  }
};

// Funkcja do zapisywania aktualizacji kanału do bazy danych
async function logChannelUpdateToDatabase(oldChannel, newChannel, changes, executor, reason) {
  try {
    // Znajdź lub utwórz dokument MessageLog dla tego kanału
    let messageLog = await MessageLog.findOne({
      guildId: newChannel.guild.id,
      channelId: newChannel.id
    });

    if (!messageLog) {
      messageLog = new MessageLog({
        guildId: newChannel.guild.id,
        channelId: newChannel.id,
        messageId: `channel-update-${newChannel.id}-${Date.now()}`, // Unikalne ID dla aktualizacji kanału
        authorId: executor?.id || 'system',
        authorTag: executor?.tag || 'System',
        content: '',
        channelLogs: []
      });
    }

    // Dodaj log kanału z informacjami o zmianach
    const changeSummary = changes.map(change => `${change.name}: ${change.value.replace(/\*\*/g, '')}`).join('; ');

    messageLog.channelLogs.push({
      type: 'update',
      channelId: newChannel.id,
      channelName: newChannel.name,
      channelType: getChannelTypeText(newChannel.type),
      moderatorId: executor?.id,
      moderatorTag: executor?.tag,
      reason: reason,
      changes: changes.map(change => ({
        field: change.name,
        oldValue: change.value.split('\n')[0]?.replace(/\*\*Przed:\*\*/g, '').trim() || '',
        newValue: change.value.split('\n')[1]?.replace(/\*\*Po:\*\*/g, '').trim() || ''
      }))
    });

    await messageLog.save();
    logger.info(`Zapisano aktualizację kanału ${newChannel.name} w bazie danych`);
  } catch (error) {
    logger.error(`Błąd podczas zapisywania aktualizacji kanału do bazy danych: ${error.stack}`);
  }
}

// Funkcja pomocnicza do tłumaczenia typu kanału
function getChannelTypeText(type) {
  switch (type) {
    case ChannelType.GuildText: return 'Kanał tekstowy';
    case ChannelType.GuildVoice: return 'Kanał głosowy';
    case ChannelType.GuildCategory: return 'Kategoria';
    case ChannelType.GuildAnnouncement: return 'Kanał ogłoszeń';
    case ChannelType.AnnouncementThread: return 'Wątek ogłoszeń';
    case ChannelType.PublicThread: return 'Publiczna nitka';
    case ChannelType.PrivateThread: return 'Prywatna nitka';
    case ChannelType.GuildStageVoice: return 'Kanał sceniczny';
    case ChannelType.GuildForum: return 'Forum';
    case ChannelType.GuildDirectory: return 'Katalog';
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
