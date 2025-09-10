// src/events/guildAddBan.js - zdarzenie bana użytkownika
const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const Guild = require('../models/Guild');
const MessageLog = require('../models/MessageLog');
const logger = require('../utils/logger');

module.exports = {
  name: Events.GuildBanAdd,
  async execute(ban) {
    try {
      // Sprawdź czy funkcja logowania wiadomości jest włączona na serwerze
      const guildSettings = await Guild.findOne({ guildId: ban.guild?.id });

      // Jeśli nie ma guildSettings lub funkcja nie jest włączona, zakończ
      if (!ban.guild || !guildSettings || !guildSettings.modules?.messageLog) return;

      // Sprawdź, czy mamy logować tylko usunięte wiadomości
      if (guildSettings.logDeletedOnly) {
        // Jeśli tak, nie logujemy banów
        return;
      }

      // Sprawdź czy kanał logów istnieje
      if (!guildSettings.messageLogChannel) return;

      const logChannel = await ban.guild.channels.fetch(guildSettings.messageLogChannel).catch(() => null);
      if (!logChannel) return;

      // Pobierz szczegóły z dziennika audytu
      let executor = null;
      let reason = ban.reason || "Nie podano powodu";
      let isTempBan = false;
      let banDuration = null;
      let expiresAt = null;

      try {
        // Poczekaj chwilę, aby upewnić się, że wpis w dzienniku audytu jest dostępny
        await new Promise(resolve => setTimeout(resolve, 1000));

        const auditLogs = await ban.guild.fetchAuditLogs({
          limit: 1,
          type: AuditLogEvent.MemberBanAdd
        });

        const banLog = auditLogs.entries.first();

        if (banLog && banLog.target.id === ban.user.id) {
          executor = banLog.executor;

          // Jeśli powód jest dostępny w dzienniku audytu, użyj go
          if (banLog.reason) reason = banLog.reason;

          // Sprawdź czy ban jest tymczasowy na podstawie treści powodu
          const tempBanRegex = /temp(?:ban|orary)?:?\s*(\d+)\s*(d|h|m|min|s|day|hour|minute|second)s?/i;
          const match = tempBanRegex.exec(reason);

          if (match) {
            isTempBan = true;
            const duration = match[1];
            const unit = match[2].toLowerCase();

            // Przekształć jednostkę na pełny tekst i oblicz datę wygaśnięcia
            let unitText = 'sekund';
            let multiplier = 1000; // sekundy

            if (unit.startsWith('d')) {
              unitText = 'dni';
              multiplier = 24 * 60 * 60 * 1000; // dni
            } else if (unit.startsWith('h')) {
              unitText = 'godzin';
              multiplier = 60 * 60 * 1000; // godziny
            } else if (unit.startsWith('m')) {
              unitText = 'minut';
              multiplier = 60 * 1000; // minuty
            }

            banDuration = `${duration} ${unitText}`;
            expiresAt = new Date(Date.now() + (duration * multiplier));
          }
        }
      } catch (error) {
        logger.error(`Błąd podczas pobierania dziennika audytu dla bana: ${error.message}`);
      }

      // Przygotuj embed z informacjami o banie
      const banEmbed = new EmbedBuilder()
        .setTitle('Zbanowano użytkownika')
        .setColor(0xFF0000)
        .setDescription(`**Użytkownik:** ${ban.user.tag} (${ban.user.id})`)
        .addFields(
          { name: 'Powód', value: reason },
          { name: 'Zbanowany przez', value: executor ? `${executor.tag} (${executor.id})` : 'Nie można ustalić' }
        )
        .setThumbnail(ban.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp()
        .setFooter({ text: `ID użytkownika: ${ban.user.id}` });

      // Jeśli ban jest tymczasowy, dodaj informację o czasie trwania
      if (isTempBan && banDuration) {
        banEmbed.addFields({ name: 'Czas trwania', value: banDuration });
      }

      await logChannel.send({ embeds: [banEmbed] });

      // Zapisz informacje o banie do bazy danych
      await logBanToDatabase(ban, executor, reason, banDuration, expiresAt);
    } catch (error) {
      logger.error(`Błąd podczas logowania bana: ${error.stack}`);
    }
  }
};

// Funkcja do zapisywania bana do bazy danych
async function logBanToDatabase(ban, executor, reason, duration, expiresAt) {
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
        messageId: `ban-${ban.user.id}-${Date.now()}`, // Unikalne ID dla banów
        authorId: ban.user.id,
        authorTag: ban.user.tag,
        content: '',
        modActions: []
      });
    }

    // Dodaj akcję moderacyjną bana
    messageLog.modActions.push({
      type: 'ban',
      targetId: ban.user.id,
      targetTag: ban.user.tag,
      moderatorId: executor?.id,
      moderatorTag: executor?.tag,
      reason: reason,
      duration: duration,
      expiresAt: expiresAt
    });

    await messageLog.save();
    logger.info(`Zapisano bana dla użytkownika ${ban.user.tag} w bazie danych`);
  } catch (error) {
    logger.error(`Błąd podczas zapisywania bana do bazy danych: ${error.stack}`);
  }
}
