// Dodaj ten plik jako src/events/threadDelete.js
const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
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
          
          // Pobierz informacje z dziennika audytu o usunięciu wątku
          let executor = null;
          let reason = "Nie podano powodu";
          
          try {
            // Poczekaj chwilę na wpis w dzienniku audytu
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const auditLogs = await thread.guild.fetchAuditLogs({
              limit: 1,
              type: AuditLogEvent.ThreadDelete
            });
            
            const threadLog = auditLogs.entries.first();
            
            if (threadLog && threadLog.target?.id === thread.id) {
              executor = threadLog.executor;
              if (threadLog.reason) reason = threadLog.reason;
            }
          } catch (error) {
            logger.error(`Błąd podczas pobierania dziennika audytu dla usunięcia wątku: ${error.message}`);
          }
          
          // Przygotowanie embedu z informacjami o usuniętej nitce
          const logEmbed = new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle(`${thread.parent?.type === 15 ? 'Usunięto wątek forum' : 'Usunięto nitkę'}`)
            .setDescription(`**Nazwa:** ${thread.name}`)
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
              logEmbed.addFields({ name: 'Utworzona przez', value: `${owner} (${owner.user.tag})` });
            } catch (error) {
              logEmbed.addFields({ name: 'Utworzona przez', value: `<@${thread.ownerId}>` });
            }
          }
          
          // Dodaj informacje o moderatorze który usunął (jeśli różny od twórcy)
          if (executor && executor.id !== thread.ownerId) {
            logEmbed.addFields({ 
              name: 'Usunięta przez', 
              value: `${executor.tag} (${executor.id})`,
              inline: true 
            });
          }
          
          // Dodaj powód usunięcia
          if (reason !== "Nie podano powodu") {
            logEmbed.addFields({ 
              name: 'Powód usunięcia', 
              value: reason,
              inline: false 
            });
          }
          
          // Dodaj informacje o wątku forum jeśli to był wątek forum
          if (thread.parent?.type === 15) {
            // Dodaj tagi jeśli były dostępne
            if (thread.appliedTags && thread.appliedTags.length > 0) {
              const tagsText = thread.appliedTags.map(tagId => {
                const tag = thread.parent.availableTags.find(t => t.id === tagId);
                return tag ? `\`${tag.name}\`` : `\`${tagId}\``;
              }).join(', ');
              
              logEmbed.addFields({ 
                name: '🏷️ Tagi', 
                value: tagsText,
                inline: false 
              });
            }
            
            // Dodaj informacje czy był przypięty
            if (thread.pinned) {
              logEmbed.addFields({ 
                name: '📌 Status', 
                value: 'Był przypięty',
                inline: true 
              });
            }
          }
          
          // Dodaj informacje o liczbie wiadomości jeśli dostępne
          if (thread.messageCount !== undefined && thread.messageCount !== null) {
            logEmbed.addFields({ 
              name: '💬 Liczba wiadomości', 
              value: thread.messageCount.toString(),
              inline: true
            });
          }
          
          // Dodaj informacje o liczbie uczestników jeśli dostępne
          if (thread.memberCount !== undefined && thread.memberCount !== null) {
            logEmbed.addFields({ 
              name: '👥 Liczba uczestników', 
              value: thread.memberCount.toString(),
              inline: true
            });
          }
          
          // Dodaj informacje o czasie utworzenia
          if (thread.createdAt) {
            logEmbed.addFields({ 
              name: '📅 Utworzony', 
              value: `<t:${Math.floor(thread.createdAt.getTime() / 1000)}:F>`,
              inline: true
            });
            
            // Oblicz jak długo istniał wątek
            const existedFor = new Date() - thread.createdAt;
            const days = Math.floor(existedFor / (1000 * 60 * 60 * 24));
            const hours = Math.floor((existedFor % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((existedFor % (1000 * 60 * 60)) / (1000 * 60));
            
            let duration = '';
            if (days > 0) duration += `${days} dni `;
            if (hours > 0) duration += `${hours} godz `;
            if (minutes > 0) duration += `${minutes} min`;
            
            if (duration.trim()) {
              logEmbed.addFields({ 
                name: '⏱️ Czas istnienia', 
                value: duration.trim(),
                inline: true
              });
            }
          }
          
          // Dodaj informacje o statusie przed usunięciem
          let statusParts = [];
          if (thread.archived) statusParts.push('📁 Zarchiwizowany');
          if (thread.locked) statusParts.push('🔒 Zablokowany');
          if (thread.pinned) statusParts.push('📌 Przypięty');
          
          if (statusParts.length > 0) {
            logEmbed.addFields({ 
              name: '📊 Status przed usunięciem', 
              value: statusParts.join(' | '),
              inline: false
            });
          }
          
          // Dodaj informacje o slowmode jeśli było ustawione
          if (thread.rateLimitPerUser && thread.rateLimitPerUser > 0) {
            logEmbed.addFields({ 
              name: '🐌 Slowmode', 
              value: `${thread.rateLimitPerUser} sekund`,
              inline: true
            });
          }
          
          // Dodaj informacje o automatycznej archiwizacji
          if (thread.autoArchiveDuration) {
            logEmbed.addFields({ 
              name: '⏱️ Auto-archiwizacja', 
              value: formatArchiveDuration(thread.autoArchiveDuration),
              inline: true
            });
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

// Funkcja pomocnicza do formatowania czasu archiwizacji
function formatArchiveDuration(minutes) {
  if (!minutes) return 'Nieznany';
  
  if (minutes === 60) return '1 godzina';
  if (minutes === 1440) return '1 dzień';
  if (minutes === 4320) return '3 dni';
  if (minutes === 10080) return '1 tydzień';
  
  return `${minutes} minut`;
}