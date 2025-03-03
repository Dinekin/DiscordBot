// Dodaj ten plik jako src/events/guildBanRemove.js
const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const Guild = require('../models/Guild');
const logger = require('../utils/logger');

module.exports = {
  name: Events.GuildBanRemove,
  async execute(ban) {
    try {
      // Sprawdź czy funkcja logowania wiadomości jest włączona na serwerze
      const guildSettings = await Guild.findOne({ guildId: ban.guild?.id });
      
      // Jeśli nie ma guildSettings lub funkcja nie jest włączona, zakończ
      if (!ban.guild || !guildSettings || !guildSettings.modules?.messageLog) return;
      
      // Sprawdź czy kanał logów istnieje
      if (!guildSettings.messageLogChannel) return;
      
      const logChannel = await ban.guild.channels.fetch(guildSettings.messageLogChannel).catch(() => null);
      if (!logChannel) return;
      
      // Pobierz szczegóły z dziennika audytu
      let executor = null;
      let reason = "Nie podano powodu";
      
      try {
        // Poczekaj chwilę, aby upewnić się, że wpis w dzienniku audytu jest dostępny
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const auditLogs = await ban.guild.fetchAuditLogs({
          limit: 1,
          type: AuditLogEvent.MemberBanRemove
        });
        
        const unbanLog = auditLogs.entries.first();
        
        if (unbanLog && unbanLog.target.id === ban.user.id) {
          executor = unbanLog.executor;
          if (unbanLog.reason) reason = unbanLog.reason;
        }
      } catch (error) {
        logger.error(`Błąd podczas pobierania dziennika audytu dla odbanowania: ${error.message}`);
      }
      
      // Przygotuj embed z informacjami o zdjęciu bana
      const unbanEmbed = new EmbedBuilder()
        .setTitle('Odbanowano użytkownika')
        .setColor(0x00FF00)
        .setDescription(`**Użytkownik:** ${ban.user.tag} (${ban.user.id})`)
        .addFields(
          { name: 'Powód odbanowania', value: reason },
          { name: 'Odbanowany przez', value: executor ? `${executor.tag} (${executor.id})` : 'Nie można ustalić' }
        )
        .setThumbnail(ban.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp()
        .setFooter({ text: `ID użytkownika: ${ban.user.id}` });
      
      await logChannel.send({ embeds: [unbanEmbed] });
    } catch (error) {
      logger.error(`Błąd podczas logowania odbanowania: ${error.stack}`);
    }
  }
};
