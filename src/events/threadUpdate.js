// src/events/threadUpdate.js - zdarzenie aktualizacji wątku
const { Events, EmbedBuilder } = require('discord.js');
const Guild = require('../models/Guild');
const MessageLog = require('../models/MessageLog');
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
      let importantChange = false; // Flaga dla ważnych zmian
      
      // Sprawdź czy zmieniła się nazwa
      if (oldThread.name !== newThread.name) {
        changes.push({
          name: '📝 Nazwa',
          value: `**Przed:** ${oldThread.name}\n**Po:** ${newThread.name}`,
          inline: false
        });
        importantChange = true;
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
          name: '🏷️ Tagi',
          value: `**Przed:** ${oldTags}\n**Po:** ${newTags}`,
          inline: false
        });
        importantChange = true;
      }
      
      // Sprawdź czy zmieniono ustawienia archiwizacji
      if (oldThread.autoArchiveDuration !== newThread.autoArchiveDuration) {
        changes.push({
          name: '⏱️ Czas automatycznej archiwizacji',
          value: `**Przed:** ${formatArchiveDuration(oldThread.autoArchiveDuration)}\n**Po:** ${formatArchiveDuration(newThread.autoArchiveDuration)}`,
          inline: true
        });
      }
      
      // Sprawdź czy zmieniono slowmode
      if (oldThread.rateLimitPerUser !== newThread.rateLimitPerUser) {
        const oldRate = oldThread.rateLimitPerUser ? `${oldThread.rateLimitPerUser} sekund` : 'Wyłączony';
        const newRate = newThread.rateLimitPerUser ? `${newThread.rateLimitPerUser} sekund` : 'Wyłączony';
        
        changes.push({
          name: '🐌 Slowmode',
          value: `**Przed:** ${oldRate}\n**Po:** ${newRate}`,
          inline: true
        });
      }
      
      // Sprawdź czy nitka została zarchiwizowana
      if (!oldThread.archived && newThread.archived) {
        changes.push({
          name: '📁 Stan',
          value: '**Nitka została zarchiwizowana**',
          inline: false
        });
        importantChange = true;
      }
      
      // Sprawdź czy nitka została odarchiwizowana
      if (oldThread.archived && !newThread.archived) {
        changes.push({
          name: '📂 Stan',
          value: '**Nitka została odarchiwizowana**',
          inline: false
        });
        importantChange = true;
      }
      
      // Sprawdź czy nitka została zablokowana
      if (!oldThread.locked && newThread.locked) {
        changes.push({
          name: '🔒 Stan',
          value: '**Nitka została zablokowana**',
          inline: false
        });
        importantChange = true;
      }
      
      // Sprawdź czy nitka została odblokowana
      if (oldThread.locked && !newThread.locked) {
        changes.push({
          name: '🔓 Stan',
          value: '**Nitka została odblokowana**',
          inline: false
        });
        importantChange = true;
      }
      
      // Sprawdź czy zmieniono przypięcie (dla forum)
      if (oldThread.pinned !== newThread.pinned) {
        if (newThread.pinned) {
          changes.push({
            name: '📌 Stan',
            value: '**Wątek został przypięty**',
            inline: false
          });
        } else {
          changes.push({
            name: '📌 Stan',
            value: '**Wątek został odpięty**',
            inline: false
          });
        }
        importantChange = true;
      }
      
      // Jeśli nie wykryto zmian, zakończ
      if (changes.length === 0) return;
      
      // Opcjonalnie wysyłanie logu na wyznaczony kanał
      if (guildSettings.messageLogChannel) {
        const logChannel = await newThread.guild.channels.fetch(guildSettings.messageLogChannel).catch(() => null);
        
        if (logChannel) {
          // Nie logujemy zdarzeń z kanału logów
          if (logChannel.id === newThread.parent?.id) return;
          
          // Określ kolor na podstawie typu zmiany
          let embedColor = 0xf1c40f; // Żółty dla zwykłych zmian
          if (newThread.archived) embedColor = 0x95a5a6; // Szary dla zarchiwizowanych
          else if (newThread.locked) embedColor = 0xe74c3c; // Czerwony dla zablokowanych
          else if (importantChange) embedColor = 0x3498db; // Niebieski dla ważnych zmian
          
          // Przygotowanie embedu z informacjami o aktualizacji nitki
          const logEmbed = new EmbedBuilder()
            .setColor(embedColor)
            .setTitle(`${newThread.parent?.type === 15 ? 'Zaktualizowano wątek forum' : 'Zaktualizowano nitkę'}`)
            .setDescription(`**Nitka:** ${newThread.name}`)
            .addFields({ name: 'Kanał nadrzędny', value: newThread.parent ? `<#${newThread.parent.id}>` : 'Nieznany' });
          
          // Dodaj wykryte zmiany
          changes.forEach(change => {
            logEmbed.addFields(change);
          });
          
          // Dodaj link do wątku
          logEmbed.addFields({ 
            name: '🔗 Link', 
            value: `[Przejdź do wątku](https://discord.com/channels/${newThread.guild.id}/${newThread.id})`,
            inline: true
          });
          
          // Dodaj informacje o liczbie wiadomości jeśli dostępne
          if (newThread.messageCount !== undefined && newThread.messageCount !== null) {
            logEmbed.addFields({ 
              name: '💬 Wiadomości', 
              value: newThread.messageCount.toString(),
              inline: true
            });
          }
          
          // Dodaj informacje o liczbie uczestników jeśli dostępne
          if (newThread.memberCount !== undefined && newThread.memberCount !== null) {
            logEmbed.addFields({ 
              name: '👥 Uczestnicy', 
              value: newThread.memberCount.toString(),
              inline: true
            });
          }
          
          // Dodaj status wątku
          let statusParts = [];
          if (newThread.archived) statusParts.push('📁 Zarchiwizowany');
          if (newThread.locked) statusParts.push('🔒 Zablokowany');
          if (newThread.pinned) statusParts.push('📌 Przypięty');
          
          if (statusParts.length > 0) {
            logEmbed.addFields({ 
              name: '📊 Status', 
              value: statusParts.join(' | '),
              inline: false
            });
          }
          
          logEmbed.setFooter({ text: `ID nitki: ${newThread.id}` })
            .setTimestamp();
          
          await logChannel.send({ embeds: [logEmbed] });
        }
      }

      // Zapisz informacje o aktualizacji wątku do bazy danych
      await logThreadUpdateToDatabase(oldThread, newThread, changes);
    } catch (error) {
      logger.error(`Błąd podczas logowania aktualizacji nitki: ${error.stack}`);
    }
  }
};

// Funkcja do zapisywania aktualizacji wątku do bazy danych
async function logThreadUpdateToDatabase(oldThread, newThread, changes) {
  try {
    // Znajdź lub utwórz dokument MessageLog dla tego wątku
    let messageLog = await MessageLog.findOne({
      guildId: newThread.guild.id,
      channelId: newThread.id
    });

    if (!messageLog) {
      messageLog = new MessageLog({
        guildId: newThread.guild.id,
        channelId: newThread.id,
        messageId: `thread-update-${newThread.id}-${Date.now()}`, // Unikalne ID dla aktualizacji wątku
        authorId: newThread.ownerId || 'system',
        authorTag: newThread.ownerId ? 'Unknown' : 'System',
        content: '',
        threadLogs: []
      });
    }

    // Dodaj log wątku z informacjami o zmianach
    const changeSummary = changes.map(change => `${change.name}: ${change.value.replace(/\*\*/g, '')}`).join('; ');

    messageLog.threadLogs.push({
      type: 'update',
      threadId: newThread.id,
      threadName: newThread.name,
      parentId: newThread.parent?.id,
      parentName: newThread.parent?.name,
      authorId: newThread.ownerId,
      authorTag: 'Unknown', // Pobierzemy to później jeśli potrzebne
      isForumPost: newThread.parent?.type === 15,
      changes: changes.map(change => ({
        field: change.name,
        oldValue: change.value.split('\n')[0]?.replace(/\*\*Przed:\*\*/g, '').trim() || '',
        newValue: change.value.split('\n')[1]?.replace(/\*\*Po:\*\*/g, '').trim() || ''
      }))
    });

    await messageLog.save();
    logger.info(`Zapisano aktualizację wątku ${newThread.name} w bazie danych`);
  } catch (error) {
    logger.error(`Błąd podczas zapisywania aktualizacji wątku do bazy danych: ${error.stack}`);
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
