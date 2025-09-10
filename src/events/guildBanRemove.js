// src/events/guildBanRemove.js - zdarzenie zdjęcia bana użytkownika
const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const Guild = require('../models/Guild');
const MessageLog = require('../models/MessageLog');
const logger = require('../utils/logger');

module.exports = {
  name: Events.GuildBanRemove,
  async execute(ban) {
    try {
      // Sprawdź czy funkcja logowania wiadomości jest włączona na serwerze
      const guildSettings = await Guild.findOne({ guildId: ban.guild?.id });

      // Jeśli nie ma guildSettings lub funkcja nie jest włączona, zakończ
      if (!ban.guild || !guildSettings || !guildSettings.modules?.messageLog) return;

      // Sprawdź, czy mamy logować tylko usunięte wiadomości
      if (guildSettings.logDeletedOnly) {
        // Jeśli tak, nie logujemy odbanowań
        return;
      }

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

      // Zapisz informacje o odbanowaniu do bazy danych
      await logUnbanToDatabase(ban, executor, reason);
    } catch (error) {
      logger.error(`Błąd podczas logowania odbanowania: ${error.stack}`);
    }
  }
};

// Funkcja do zapisywania odbanowania do bazy danych
async function logUnbanToDatabase(ban, executor, reason) {
  try {
    // Znajdź lub utwórz dokument MessageLog dla tego użytkownika
    let messageLog = await MessageLog.findOne({
      guildId: ban.guild.id,
      authorId: ban.user.id
    });

    if (!messageLog) {
      messageLog = new MessageLog({
        guildId: ban.guild.id,
        channelId: ban.guild.systemChannel?.id || ban.guild.channels.cache.filter(c => c.type === 0).first()?.id,
        messageId: `unban-${ban.user.id}-${Date.now()}`, // Unikalne ID dla odbanowań
        authorId: ban.user.id,
        authorTag: ban.user.tag,
        content: '',
        modActions: []
      });
    }

    // Dodaj akcję moderacyjną odbanowania
    messageLog.modActions.push({
      type: 'unban',
      targetId: ban.user.id,
      targetTag: ban.user.tag,
      moderatorId: executor?.id,
      moderatorTag: executor?.tag,
      reason: reason
    });

    await messageLog.save();
    logger.info(`Zapisano odbanowanie dla użytkownika ${ban.user.tag} w bazie danych`);
  } catch (error) {
    logger.error(`Błąd podczas zapisywania odbanowania do bazy danych: ${error.stack}`);
  }
}
