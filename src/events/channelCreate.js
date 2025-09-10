// src/events/channelCreate.js - zdarzenie utworzenia kanału
const { Events, EmbedBuilder, AuditLogEvent, ChannelType } = require('discord.js');
const Guild = require('../models/Guild');
const MessageLog = require('../models/MessageLog');
const logger = require('../utils/logger');

module.exports = {
  name: Events.ChannelCreate,
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
      
      const logChannel = await channel.guild.channels.fetch(guildSettings.messageLogChannel).catch(() => null);
      if (!logChannel || logChannel.id === channel.id) return;
      
      // Pobierz informacje z dziennika audytu
      let executor = null;
      let reason = "Nie podano powodu";
      
      try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const auditLogs = await channel.guild.fetchAuditLogs({
          limit: 1,
          type: AuditLogEvent.ChannelCreate
        });
        
        const channelLog = auditLogs.entries.first();
        
        if (channelLog && channelLog.target.id === channel.id) {
          executor = channelLog.executor;
          if (channelLog.reason) reason = channelLog.reason;
        }
      } catch (error) {
        logger.error(`Błąd podczas pobierania dziennika audytu dla utworzenia kanału: ${error.message}`);
      }
      
      // Określ typ kanału
      const channelTypeText = getChannelTypeText(channel.type);
      const isForum = channel.type === ChannelType.GuildForum;
      
      // Określ kolor embedu na podstawie typu kanału
      let embedColor = 0x2ECC71; // Zielony dla zwykłych kanałów
      if (isForum) embedColor = 0x9B59B6; // Fioletowy dla forów
      else if (channel.type === ChannelType.GuildVoice) embedColor = 0x3498DB; // Niebieski dla voice
      else if (channel.type === ChannelType.GuildCategory) embedColor = 0xF39C12; // Pomarańczowy dla kategorii
      
      // Przygotuj embed z informacjami o utworzeniu kanału
      const embed = new EmbedBuilder()
        .setTitle(`${isForum ? '🗂️ Utworzono forum' : '📁 Utworzono kanał'}`)
        .setColor(embedColor)
        .setDescription(`**Nazwa:** ${channel.name}`)
        .addFields(
          { name: 'Typ', value: channelTypeText, inline: true },
          { name: 'ID', value: channel.id, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: `ID kanału: ${channel.id}` });
      
      // Dodaj dodatkowe informacje na podstawie typu kanału
      if (channel.parent) {
        embed.addFields({ 
          name: 'Kategoria', 
          value: `${channel.parent.name} (${channel.parent.id})`,
          inline: true 
        });
      }
      
      if (executor) {
        embed.addFields({ 
          name: 'Utworzony przez', 
          value: `${executor.tag} (${executor.id})`,
          inline: true 
        });
      }
      
      if (reason !== "Nie podano powodu") {
        embed.addFields({ 
          name: 'Powód', 
          value: reason,
          inline: false 
        });
      }
      
      // Dodaj link do kanału
      embed.addFields({ 
        name: '🔗 Link', 
        value: `<#${channel.id}>`,
        inline: true 
      });
      
      // Specjalne informacje dla forum
      if (isForum) {
        // Dodaj opis forum jeśli istnieje
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
        
        // Dodaj informacje o dostępnych tagach
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
          
          embed.addFields({ 
            name: `🏷️ Dostępne tagi (${channel.availableTags.length})`, 
            value: tagsDescription.length > 1024 ? tagsDescription.substring(0, 1021) + '...' : tagsDescription,
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
        
        // Dodaj informacje o ustawieniach domyślnych dla wątków
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
            name: '📊 Domyślne sortowanie', 
            value: sortTexts[channel.defaultSortOrder] || `Nieznane (${channel.defaultSortOrder})`,
            inline: true 
          });
        }
        
        // Dodaj informacje o layoutcie forum
        if (channel.defaultForumLayout !== null && channel.defaultForumLayout !== undefined) {
          const layoutTexts = {
            0: 'Niespecyfikowany',
            1: 'Widok listy',
            2: 'Widok galerii'
          };
          embed.addFields({ 
            name: '🖼️ Layout forum', 
            value: layoutTexts[channel.defaultForumLayout] || `Nieznany (${channel.defaultForumLayout})`,
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
      
      await logChannel.send({ embeds: [embed] });

      // Zapisz informacje o utworzeniu kanału do bazy danych
      await logChannelCreateToDatabase(channel, executor, reason);
    } catch (error) {
      logger.error(`Błąd podczas logowania utworzenia kanału: ${error.stack}`);
    }
  }
};

// Funkcja do zapisywania utworzenia kanału do bazy danych
async function logChannelCreateToDatabase(channel, executor, reason) {
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
        messageId: `channel-create-${channel.id}-${Date.now()}`, // Unikalne ID dla utworzenia kanału
        authorId: executor?.id || 'system',
        authorTag: executor?.tag || 'System',
        content: '',
        channelLogs: []
      });
    }

    // Dodaj log kanału
    messageLog.channelLogs.push({
      type: 'create',
      channelId: channel.id,
      channelName: channel.name,
      channelType: getChannelTypeText(channel.type),
      moderatorId: executor?.id,
      moderatorTag: executor?.tag,
      reason: reason
    });

    await messageLog.save();
    logger.info(`Zapisano utworzenie kanału ${channel.name} w bazie danych`);
  } catch (error) {
    logger.error(`Błąd podczas zapisywania utworzenia kanału do bazy danych: ${error.stack}`);
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
