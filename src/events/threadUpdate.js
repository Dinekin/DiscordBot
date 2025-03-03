// Dodaj ten plik jako src/events/threadUpdate.js
const { Events, EmbedBuilder } = require('discord.js');
const Guild = require('../models/Guild');
const logger = require('../utils/logger');

module.exports = {
  name: Events.ThreadUpdate,
  async execute(oldThread, newThread) {
    try {
      // Sprawdź czy funkcja logowania wiadomości jest włączona na serwerze
      const guildSettings = await Guild.findOne({ guildId: newThread.guild?.id });
      
      // Jeśli nie ma guildSettings lub funkcja nie jest włączona, lub to jest wiadomość serwerowa, zakończ
      if (!newThread.guild || !guildSettings || !guildSettings.modules?.messageLog) return;
      
      // Sprawdź, czy mamy logować tylko usunięte wiadomości
      if (guildSettings.logDeletedOnly) {
        // Jeśli tak, nie logujemy aktualizacji nitek
        return;
      }
      
      // Przygotuj listę zmian, które wystąpiły
      const changes = [];
      
      // Sprawdź czy zmieniła się nazwa
      if (oldThread.name !== newThread.name) {
        changes.push({
          name: 'Nazwa',
          value: `**Przed:** ${oldThread.name}\n**Po:** ${newThread.name}`
        });
      }
      
      // Sprawdź czy zmieniono tagi (dla wątków forum)
      if (oldThread.appliedTags?.toString() !== newThread.appliedTags?.toString()) {
        let oldTags = 'Brak tagów';
        let newTags = 'Brak tagów';
        
        if (oldThread.appliedTags && oldThread.appliedTags.length > 0) {
          oldTags = oldThread.appliedTags.map(tagId => {
            const tag = oldThread.parent?.availableTags.find(t => t.id === tagId);
            return tag ? `\`${tag.name}\`` : `\`${tagId}\``;
          }).join(', ');
        }
        
        if (newThread.appliedTags && newThread.appliedTags.length > 0) {
          newTags = newThread.appliedTags.map(tagId => {
            const tag = newThread.parent?.availableTags.find(t => t.id === tagId);
            return tag ? `\`${tag.name}\`` : `\`${tagId}\``;
          }).join(', ');
        }
        
        changes.push({
          name: 'Tagi',
          value: `**Przed:** ${oldTags}\n**Po:** ${newTags}`
        });
      }
      
      // Sprawdź czy zmieniono ustawienia archiwizacji
      if (oldThread.autoArchiveDuration !== newThread.autoArchiveDuration) {
        changes.push({
          name: 'Czas automatycznej archiwizacji',
          value: `**Przed:** ${formatArchiveDuration(oldThread.autoArchiveDuration)}\n**Po:** ${formatArchiveDuration(newThread.autoArchiveDuration)}`
        });
      }
      
      // Sprawdź czy nitka została zarchiwizowana
      if (!oldThread.archived && newThread.archived) {
        changes.push({
          name: 'Stan',
          value: '**Nitka została zarchiwizowana**'
        });
      }
      
      // Sprawdź czy nitka została odarchiwizowana
      if (oldThread.archived && !newThread.archived) {
        changes.push({
          name: 'Stan',
          value: '**Nitka została odarchiwizowana**'
        });
      }
      
      // Sprawdź czy nitka została zablokowana
      if (!oldThread.locked && newThread.locked) {
        changes.push({
          name: 'Stan',
          value: '**Nitka została zablokowana**'
        });
      }
      
      // Sprawdź czy nitka została odblokowana
      if (oldThread.locked && !newThread.locked) {
        changes.push({
          name: 'Stan',
          value: '**Nitka została odblokowana**'
        });
      }
      
      // Jeśli nie wykryto zmian, zakończ
      if (changes.length === 0) return;
      
      // Opcjonalnie wysyłanie logu na wyznaczony kanał
      if (guildSettings.messageLogChannel) {
        const logChannel = await newThread.guild.channels.fetch(guildSettings.messageLogChannel).catch(() => null);
        
        if (logChannel) {
          // Nie logujemy zdarzeń z kanału logów
          if (logChannel.id === newThread.parent?.id) return;
          
          // Przygotowanie embedu z informacjami o aktualizacji nitki
          const logEmbed = new EmbedBuilder()
            .setColor(0xf1c40f)
            .setTitle('Zaktualizowano nitkę')
            .setDescription(`Nitka: **${newThread.name}**`)
            .addFields({ name: 'Kanał nadrzędny', value: newThread.parent ? `<#${newThread.parent.id}>` : 'Nieznany' });
          
          // Dodaj wykryte zmiany
          changes.forEach(change => {
            logEmbed.addFields(change);
          });
          
          logEmbed.setFooter({ text: `ID nitki: ${newThread.id}` })
            .setTimestamp();
          
          await logChannel.send({ embeds: [logEmbed] });
        }
      }
    } catch (error) {
      logger.error(`Błąd podczas logowania aktualizacji nitki: ${error.stack}`);
    }
  }
};

// Funkcja pomocnicza do formatowania czasu archiwizacji
function formatArchiveDuration(minutes) {
  if (!minutes) return 'Nieznany';
  
  if (minutes === 60) return '1 godzina';
  if (minutes === 1440) return '1 dzień';
  if (minutes === 4320) return '3 dni';
  if (minutes === 10080) return '1 tydzień';
  
  return `${minutes} minut`;
}