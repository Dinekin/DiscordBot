// Dodaj ten plik jako src/events/channelDelete.js
const { Events, EmbedBuilder, AuditLogEvent, ChannelType } = require('discord.js');
const Guild = require('../models/Guild');
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
      
      // Określ typ kanału
      const channelTypeText = getChannelTypeText(channel.type);
      const isForum = channel.type === ChannelType.GuildForum;
      
      // Przygotuj embed z informacjami o usunięciu kanału
      const embed = new EmbedBuilder()
        .setTitle(`Usunięto kanał${isForum ? ' forum' : ''}`)
        .setColor(0xE74C3C)
        .setDescription(`**Nazwa:** ${channel.name}`)
        .addFields(
          { name: 'Typ', value: channelTypeText },
          { name: 'ID', value: channel.id }
        )
        .setTimestamp()
        .setFooter({ text: `ID kanału: ${channel.id}` });
      
      // Dodaj dodatkowe informacje
      if (channel.parent) {
        embed.addFields({ name: 'Kategoria', value: `${channel.parent.name} (${channel.parent.id})` });
      }
      
      if (executor) {
        embed.addFields({ name: 'Usunięty przez', value: `${executor.tag} (${executor.id})` });
      }
      
      if (reason !== "Nie podano powodu") {
        embed.addFields({ name: 'Powód', value: reason });
      }
      
      await logChannel.send({ embeds: [embed] });
    } catch (error) {
      logger.error(`Błąd podczas logowania usunięcia kanału: ${error.stack}`);
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