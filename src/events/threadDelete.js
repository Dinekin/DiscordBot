// Dodaj ten plik jako src/events/threadDelete.js
const { Events, EmbedBuilder } = require('discord.js');
const Guild = require('../models/Guild');
const logger = require('../utils/logger');

module.exports = {
  name: Events.ThreadDelete,
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
          
          // Przygotowanie embedu z informacjami o usuniętej nitce
          const logEmbed = new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle('Usunięto nitkę')
            .setDescription(`Nazwa: **${thread.name}**`)
            .addFields(
              { name: 'Kanał nadrzędny', value: thread.parent ? `<#${thread.parent.id}>` : 'Nieznany' },
              { name: 'Typ', value: getThreadTypeText(thread.type) }
            )
            .setFooter({ text: `ID nitki: ${thread.id}` })
            .setTimestamp();
          
          // Dodaj informacje o twórcy jeśli dostępne
          if (thread.ownerId) {
            logEmbed.addFields({ name: 'Utworzona przez', value: `<@${thread.ownerId}>` });
          }
          
          await logChannel.send({ embeds: [logEmbed] });
        }
      }
    } catch (error) {
      logger.error(`Błąd podczas logowania usunięcia nitki: ${error.stack}`);
    }
  }
};

// Funkcja pomocnicza do tłumaczenia typu nitki
function getThreadTypeText(type) {
  switch (type) {
    case 11: return 'Publiczna nitka (PUBLIC_THREAD)';
    case 12: return 'Prywatna nitka (PRIVATE_THREAD)';
    case 13: return 'Ogłoszenie (ANNOUNCEMENT_THREAD)';
    default: return `Nieznany (${type})`;
  }
}