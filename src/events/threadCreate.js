// Dodaj ten plik jako src/events/threadCreate.js
const { Events, EmbedBuilder } = require('discord.js');
const Guild = require('../models/Guild');
const logger = require('../utils/logger');

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
          
          // Przygotowanie embedu z informacjami o nowej nitce
          const logEmbed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle('Utworzono nową nitkę')
            .setDescription(`Nazwa: **${thread.name}**`)
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
          }
          
          await logChannel.send({ embeds: [logEmbed] });
        }
      }
    } catch (error) {
      logger.error(`Błąd podczas logowania utworzenia nitki: ${error.stack}`);
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
}c