// Dodaj ten plik jako src/events/channelUpdate.js
const { Events, EmbedBuilder, AuditLogEvent, ChannelType } = require('discord.js');
const Guild = require('../models/Guild');
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
      
      // Sprawdź czy zmieniła się nazwa
      if (oldChannel.name !== newChannel.name) {
        changes.push({
          name: 'Nazwa',
          value: `**Przed:** ${oldChannel.name}\n**Po:** ${newChannel.name}`
        });
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
          name: 'Kategoria',
          value: `**Przed:** ${oldParentName}\n**Po:** ${newParentName}`
        });
      }
      
      // Sprawdź czy zmieniły się uprawnienia
      if (oldChannel.permissionOverwrites.cache.size !== newChannel.permissionOverwrites.cache.size) {
        changes.push({
          name: 'Uprawnienia',
          value: `Zmieniono uprawnienia kanału.`
        });
      }
      
      // Dla forów sprawdź zmiany w dostępnych tagach
      if (newChannel.type === ChannelType.GuildForum) {
        // Sprawdź zmiany w dostępnych tagach
        if (oldChannel.availableTags?.length !== newChannel.availableTags?.length) {
          changes.push({
            name: 'Tagi forum',
            value: `Zmieniono dostępne tagi (${oldChannel.availableTags?.length || 0} → ${newChannel.availableTags?.length || 0})`
          });
        }
        
        // Sprawdź zmiany w domyślnej reakcji
        if (oldChannel.defaultReactionEmoji?.id !== newChannel.defaultReactionEmoji?.id ||
            oldChannel.defaultReactionEmoji?.name !== newChannel.defaultReactionEmoji?.name) {
          
          let oldEmoji = 'Brak';
          let newEmoji = 'Brak';
          
          if (oldChannel.defaultReactionEmoji) {
            oldEmoji = oldChannel.defaultReactionEmoji.id
              ? `<:emoji:${oldChannel.defaultReactionEmoji.id}>`
              : oldChannel.defaultReactionEmoji.name;
          }
          
          if (newChannel.defaultReactionEmoji) {
            newEmoji = newChannel.defaultReactionEmoji.id
              ? `<:emoji:${newChannel.defaultReactionEmoji.id}>`
              : newChannel.defaultReactionEmoji.name;
          }
          
          changes.push({
            name: 'Domyślna reakcja',
            value: `**Przed:** ${oldEmoji}\n**Po:** ${newEmoji}`
          });
        }
      }
      
      // Sprawdź czy zmieniło się ograniczenie szybkości
      if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
        const oldLimit = oldChannel.rateLimitPerUser ? `${oldChannel.rateLimitPerUser} sekund` : 'Brak';
        const newLimit = newChannel.rateLimitPerUser ? `${newChannel.rateLimitPerUser} sekund` : 'Brak';
        
        changes.push({
          name: 'Ograniczenie szybkości',
          value: `**Przed:** ${oldLimit}\n**Po:** ${newLimit}`
        });
      }
      
      // Sprawdź czy zmieniła się pozycja
      if (oldChannel.position !== newChannel.position) {
        changes.push({
          name: 'Pozycja',
          value: `**Przed:** ${oldChannel.position}\n**Po:** ${newChannel.position}`
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
      
      // Określ typ kanału
      const channelTypeText = getChannelTypeText(newChannel.type);
      const isForum = newChannel.type === ChannelType.GuildForum;
      
      // Przygotuj embed z informacjami o aktualizacji kanału
      const embed = new EmbedBuilder()
        .setTitle(`Zaktualizowano kanał${isForum ? ' forum' : ''}`)
        .setColor(0xF1C40F)
        .setDescription(`**Kanał:** ${newChannel.name} (<#${newChannel.id}>)`)
        .setTimestamp()
        .setFooter({ text: `ID kanału: ${newChannel.id}` });
      
      // Dodaj wykryte zmiany
      changes.forEach(change => {
        embed.addFields(change);
      });
      
      if (executor) {
        embed.addFields({ name: 'Zaktualizowany przez', value: `${executor.tag} (${executor.id})` });
      }
      
      if (reason !== "Nie podano powodu") {
        embed.addFields({ name: 'Powód', value: reason });
      }
      
      await logChannel.send({ embeds: [embed] });
    } catch (error) {
      logger.error(`Błąd podczas logowania aktualizacji kanału: ${error.stack}`);
    }
  }
};

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
    default: return `Nieznany (${type})`;
  }
}