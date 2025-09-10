// src/events/channelDelete.js - zdarzenie usunięcia kanału
const { Events, EmbedBuilder, AuditLogEvent, ChannelType } = require('discord.js');
const Guild = require('../models/Guild');
const MessageLog = require('../models/MessageLog');
const logger = require('../utils/logger');

module.exports = {
  name: Events.ChannelDelete,
  async execute(channel) {
    try {
      // Pomijamy kanały DM
      if (!channel.guild) return;
      
      // Sprawdź czy funkcja logowania jest włączona na serwerze
      const guildSettings = await Guild.findOne({ guildId: channel.guild.id });
      
      // Jeśli nie ma guildSettings lub funkcja nie jest włączona, zakończ
      if (!guildSettings || !guildSettings.modules?.messageLog) return;
      
      // Sprawdź czy kanał logów istnieje
      if (!guildSettings.messageLogChannel) return;
      
      // Jeśli usunięto kanał logów, zaktualizuj ustawienia
      if (channel.id === guildSettings.messageLogChannel) {
        guildSettings.messageLogChannel = null;
        await guildSettings.save();
        logger.warn(`Kanał logów ${channel.id} został usunięty. Zaktualizowano ustawienia serwera.`);
        return;
      }
      
      const logChannel = await channel.guild.channels.fetch(guildSettings.messageLogChannel).catch(() => null);
      if (!logChannel) return;
      
      // Pobierz informacje z dziennika audytu
      let executor = null;
      let reason = "Nie podano powodu";
      
      try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const auditLogs = await channel.guild.fetchAuditLogs({
          limit: 1,
          type: AuditLogEvent.ChannelDelete
        });
        
        const channelLog = auditLogs.entries.first();
        
        if (channelLog && channelLog.target.id === channel.id) {
          executor = channelLog.executor;
          if (channelLog.reason) reason = channelLog.reason;
        }
      } catch (error) {
        logger.error(`Błąd podczas pobierania dziennika audytu dla usunięcia kanału: ${error.message}`);
      }
      
      // Określ typ kanału i kolor
      const channelTypeText = getChannelTypeText(channel.type);
      const isForum = channel.type === ChannelType.GuildForum;
      let embedColor = 0xE74C3C; // Czerwony dla usunięcia
      
      // Przygotuj embed z informacjami o usunięciu kanału
      const embed = new EmbedBuilder()
        .setTitle(`${isForum ? '🗂️ Usunięto forum' : '📁 Usunięto kanał'}`)
        .setColor(embedColor)
        .setDescription(`**Nazwa:** ${channel.name}`)
        .addFields(
          { name: '📋 Typ', value: channelTypeText, inline: true },
          { name: '🆔 ID', value: channel.id, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: `ID kanału: ${channel.id}` });
      
      // Dodaj dodatkowe informacje
      if (channel.parent) {
        embed.addFields({ 
          name: '📁 Kategoria', 
          value: `${channel.parent.name} (${channel.parent.id})`,
          inline: true 
        });
      }
      
      if (executor) {
        embed.addFields({ 
          name: '👤 Usunięty przez', 
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
      
      // Dodaj informacje o czasie utworzenia i istnienia
      if (channel.createdAt) {
        embed.addFields({ 
          name: '📅 Utworzony', 
          value: `<t:${Math.floor(channel.createdAt.getTime() / 1000)}:F>`,
          inline: true 
        });
        
        // Oblicz jak długo istniał kanał
        const existedFor = new Date() - channel.createdAt;
        const days = Math.floor(existedFor / (1000 * 60 * 60 * 24));
        const hours = Math.floor((existedFor % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((existedFor % (1000 * 60 * 60)) / (1000 * 60));
        
        let duration = '';
        if (days > 0) duration += `${days} dni `;
        if (hours > 0) duration += `${hours} godz `;
        if (minutes > 0) duration += `${minutes} min`;
        
        if (duration.trim()) {
          embed.addFields({ 
            name: '⏱️ Czas istnienia', 
            value: duration.trim(),
            inline: true 
          });
        }
      }
      
      // Dodaj pozycję kanału
      if (channel.position !== undefined) {
        embed.addFields({ 
          name: '📍 Pozycja', 
          value: channel.position.toString(),
          inline: true 
        });
      }
      
      // Specjalne informacje dla forum
      if (isForum) {
        // Dodaj opis forum jeśli istniał
        if (channel.topic) {
          const truncatedTopic = channel.topic.length > 1024 
            ? channel.topic.substring(0, 1021) + '...' 
            : channel.topic;
          embed.addFields({ 
            name: '📝 Opis forum', 
            value: truncatedTopic,
            inline: false 
          });
        }
        
        // Dodaj informacje o tagach forum
        if (channel.availableTags && channel.availableTags.length > 0) {
          const tagsDescription = channel.availableTags
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
          
          const truncatedTags = tagsDescription.length > 1024 
            ? tagsDescription.substring(0, 1021) + '...' 
            : tagsDescription;
            
          embed.addFields({ 
            name: `🏷️ Tagi forum (${channel.availableTags.length})`, 
            value: truncatedTags,
            inline: false 
          });
        }
        
        // Dodaj informacje o domyślnej reakcji
        if (channel.defaultReactionEmoji) {
          const emoji = channel.defaultReactionEmoji.id 
            ? `<:${channel.defaultReactionEmoji.name}:${channel.defaultReactionEmoji.id}>` 
            : channel.defaultReactionEmoji.name;
          
          embed.addFields({ 
            name: '👍 Domyślna reakcja', 
            value: emoji,
            inline: true 
          });
        }
        
        // Dodaj ustawienia domyślne dla wątków
        if (channel.defaultAutoArchiveDuration) {
          embed.addFields({ 
            name: '📁 Domyślna auto-archiwizacja', 
            value: formatArchiveDuration(channel.defaultAutoArchiveDuration),
            inline: true 
          });
        }
        
        if (channel.defaultThreadRateLimitPerUser && channel.defaultThreadRateLimitPerUser > 0) {
          embed.addFields({ 
            name: '🐌 Domyślny slowmode wątków', 
            value: `${channel.defaultThreadRateLimitPerUser} sekund`,
            inline: true 
          });
        }
        
        // Dodaj informacje o sortowaniu
        if (channel.defaultSortOrder !== null && channel.defaultSortOrder !== undefined) {
          const sortTexts = {
            0: 'Najnowsza aktywność',
            1: 'Data utworzenia'
          };
          embed.addFields({ 
            name: '📊 Sortowanie', 
            value: sortTexts[channel.defaultSortOrder] || `Nieznane (${channel.defaultSortOrder})`,
            inline: true 
          });
        }
        
        // Dodaj informacje o layoutcie
        if (channel.defaultForumLayout !== null && channel.defaultForumLayout !== undefined) {
          const layoutTexts = {
            0: 'Niespecyfikowany',
            1: 'Widok listy',
            2: 'Widok galerii'
          };
          embed.addFields({ 
            name: '🖼️ Layout', 
            value: layoutTexts[channel.defaultForumLayout] || `Nieznany (${channel.defaultForumLayout})`,
            inline: true 
          });
        }
      }
      
      // Specjalne informacje dla kanałów tekstowych
      if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) {
        if (channel.topic) {
          const truncatedTopic = channel.topic.length > 1024 
            ? channel.topic.substring(0, 1021) + '...' 
            : channel.topic;
          embed.addFields({ 
            name: '📝 Temat kanału', 
            value: truncatedTopic,
            inline: false 
          });
        }
        
        if (channel.rateLimitPerUser && channel.rateLimitPerUser > 0) {
          embed.addFields({ 
            name: '🐌 Slowmode', 
            value: `${channel.rateLimitPerUser} sekund`,
            inline: true 
          });
        }
        
        if (channel.nsfw) {
          embed.addFields({ 
            name: '🔞 NSFW', 
            value: 'Tak',
            inline: true 
          });
        }
      }
      
      // Specjalne informacje dla kanałów głosowych
      if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) {
        if (channel.userLimit && channel.userLimit > 0) {
          embed.addFields({ 
            name: '👥 Limit użytkowników', 
            value: channel.userLimit.toString(),
            inline: true 
          });
        }
        
        if (channel.bitrate) {
          embed.addFields({ 
            name: '🔊 Bitrate', 
            value: `${channel.bitrate / 1000} kbps`,
            inline: true 
          });
        }
        
        if (channel.rtcRegion) {
          embed.addFields({ 
            name: '🌍 Region', 
            value: channel.rtcRegion,
            inline: true 
          });
        }
      }
      
      // Dodaj ostrzeżenie o utraconych danych dla forum
      if (isForum) {
        embed.addFields({ 
          name: '⚠️ Ostrzeżenie', 
          value: 'Wszystkie wątki i posty w tym forum zostały trwale utracone!',
          inline: false 
        });
      }
      
      // Dodaj informacje o liczbie uprawnień
      if (channel.permissionOverwrites && channel.permissionOverwrites.cache.size > 0) {
        embed.addFields({ 
          name: '🔐 Nadpisania uprawnień', 
          value: channel.permissionOverwrites.cache.size.toString(),
          inline: true 
        });
      }
      
      await logChannel.send({ embeds: [embed] });

      // Zapisz informacje o usunięciu kanału do bazy danych
      await logChannelDeleteToDatabase(channel, executor, reason);
    } catch (error) {
      logger.error(`Błąd podczas logowania usunięcia kanału: ${error.stack}`);
    }
  }
};

// Funkcja do zapisywania usunięcia kanału do bazy danych
async function logChannelDeleteToDatabase(channel, executor, reason) {
  try {
    // Znajdź lub utwórz dokument MessageLog dla tego kanału
    let messageLog = await MessageLog.findOne({
      guildId: channel.guild.id,
      channelId: channel.id
    });

    if (!messageLog) {
      messageLog = new MessageLog({
        guildId: channel.guild.id,
        channelId: channel.id,
        messageId: `channel-delete-${channel.id}-${Date.now()}`, // Unikalne ID dla usunięcia kanału
        authorId: executor?.id || 'system',
        authorTag: executor?.tag || 'System',
        content: '',
        channelLogs: []
      });
    }

    // Dodaj log kanału
    messageLog.channelLogs.push({
      type: 'delete',
      channelId: channel.id,
      channelName: channel.name,
      channelType: getChannelTypeText(channel.type),
      moderatorId: executor?.id,
      moderatorTag: executor?.tag,
      reason: reason
    });

    await messageLog.save();
    logger.info(`Zapisano usunięcie kanału ${channel.name} w bazie danych`);
  } catch (error) {
    logger.error(`Błąd podczas zapisywania usunięcia kanału do bazy danych: ${error.stack}`);
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
