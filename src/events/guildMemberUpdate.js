// Dodaj ten plik jako src/events/guildMemberUpdate.js
const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const Guild = require('../models/Guild');
const logger = require('../utils/logger');

module.exports = {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    try {
      // Sprawdź czy funkcja logowania wiadomości jest włączona na serwerze
      const guildSettings = await Guild.findOne({ guildId: newMember.guild?.id });
      
      // Jeśli nie ma guildSettings lub funkcja nie jest włączona, lub to jest wiadomość serwerowa, zakończ
      if (!newMember.guild || !guildSettings || !guildSettings.modules?.messageLog) return;
      
      // Sprawdź, czy mamy logować tylko usunięte wiadomości
      if (guildSettings.logDeletedOnly) {
        // Jeśli tak, nie logujemy aktualizacji członków
        return;
      }
      
      // Sprawdź czy kanał logów istnieje
      if (!guildSettings.messageLogChannel) return;
      
      const logChannel = await newMember.guild.channels.fetch(guildSettings.messageLogChannel).catch(() => null);
      if (!logChannel) return;
      
      // Sprawdź co się zmieniło
      let changeType = null;
      let executor = null;
      let reason = "Nie podano powodu";
      let timeoutDuration = null;
      let changeEmbed = null;
      
      // Sprawdź czy zmienił się nickname
      if (oldMember.nickname !== newMember.nickname) {
        changeType = 'nickname';
        
        try {
          // Pobierz informacje z dziennika audytu o zmianie nicku
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const auditLogs = await newMember.guild.fetchAuditLogs({
            limit: 1,
            type: AuditLogEvent.MemberUpdate
          });
          
          const nickLog = auditLogs.entries.first();
          
          if (nickLog && nickLog.target.id === newMember.user.id && 
              nickLog.changes.some(change => change.key === 'nick')) {
            executor = nickLog.executor;
            if (nickLog.reason) reason = nickLog.reason;
          }
        } catch (error) {
          logger.error(`Błąd podczas pobierania dziennika audytu dla zmiany nicku: ${error.message}`);
        }
        
        // Przygotuj embed z informacjami o zmianie nicku
        changeEmbed = new EmbedBuilder()
          .setTitle('Zmieniono pseudonim użytkownika')
          .setColor(0x3498DB)
          .setDescription(`**Użytkownik:** ${newMember.user.tag} (${newMember.user.id})`)
          .addFields(
            { name: 'Poprzedni pseudonim', value: oldMember.nickname || '*Brak pseudonimu*' },
            { name: 'Nowy pseudonim', value: newMember.nickname || '*Brak pseudonimu*' }
          )
          .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
          .setTimestamp()
          .setFooter({ text: `ID użytkownika: ${newMember.user.id}` });
        
        if (executor) {
          changeEmbed.addFields({ name: 'Zmienione przez', value: `${executor.tag} (${executor.id})` });
        }
        
        if (reason !== "Nie podano powodu") {
          changeEmbed.addFields({ name: 'Powód', value: reason });
        }
        // Sprawdź czy zmieniono role (dodano lub usunięto)
      } else if (!oldMember.roles.cache.equals(newMember.roles.cache)) {
        const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
        const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));
        
        if (addedRoles.size > 0) {
          changeType = 'roles_added';
          
          // Pobierz informacje z dziennika audytu o dodaniu roli
          try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const auditLogs = await newMember.guild.fetchAuditLogs({
              limit: 1,
              type: AuditLogEvent.MemberRoleUpdate
            });
            
            const roleLog = auditLogs.entries.first();
            
            if (roleLog && roleLog.target.id === newMember.user.id && 
                roleLog.changes.some(change => change.key === '$add')) {
              executor = roleLog.executor;
              if (roleLog.reason) reason = roleLog.reason;
            }
          } catch (error) {
            logger.error(`Błąd podczas pobierania dziennika audytu dla dodania roli: ${error.message}`);
          }
          
          // Przygotuj embed z informacjami o dodanych rolach
          changeEmbed = new EmbedBuilder()
            .setTitle('Dodano role użytkownikowi')
            .setColor(0x2ECC71)
            .setDescription(`**Użytkownik:** ${newMember.user.tag} (${newMember.user.id})`)
            .addFields(
              { name: 'Dodane role', value: addedRoles.map(r => `${r}`).join(', ') }
            )
            .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp()
            .setFooter({ text: `ID użytkownika: ${newMember.user.id}` });
          
          if (executor) {
            changeEmbed.addFields({ name: 'Dodane przez', value: `${executor.tag} (${executor.id})` });
          }
          
          if (reason !== "Nie podano powodu") {
            changeEmbed.addFields({ name: 'Powód', value: reason });
          }
          
        } else if (removedRoles.size > 0) {
          changeType = 'roles_removed';
          
          // Pobierz informacje z dziennika audytu o usunięciu roli
          try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const auditLogs = await newMember.guild.fetchAuditLogs({
              limit: 1,
              type: AuditLogEvent.MemberRoleUpdate
            });
            
            const roleLog = auditLogs.entries.first();
            
            if (roleLog && roleLog.target.id === newMember.user.id && 
                roleLog.changes.some(change => change.key === '$remove')) {
              executor = roleLog.executor;
              if (roleLog.reason) reason = roleLog.reason;
            }
          } catch (error) {
            logger.error(`Błąd podczas pobierania dziennika audytu dla usunięcia roli: ${error.message}`);
          }
          
          // Przygotuj embed z informacjami o usuniętych rolach
          changeEmbed = new EmbedBuilder()
            .setTitle('Usunięto role użytkownikowi')
            .setColor(0xE74C3C)
            .setDescription(`**Użytkownik:** ${newMember.user.tag} (${newMember.user.id})`)
            .addFields(
              { name: 'Usunięte role', value: removedRoles.map(r => `${r}`).join(', ') }
            )
            .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp()
            .setFooter({ text: `ID użytkownika: ${newMember.user.id}` });
          
          if (executor) {
            changeEmbed.addFields({ name: 'Usunięte przez', value: `${executor.tag} (${executor.id})` });
          }
          
          if (reason !== "Nie podano powodu") {
            changeEmbed.addFields({ name: 'Powód', value: reason });
          }
        }
      }
      
      // Sprawdź czy użytkownik został wyciszony (timeout)
      if (!oldMember.communicationDisabledUntil && newMember.communicationDisabledUntil) {
        changeType = 'timeout_added';
        
        // Pobierz informacje z dziennika audytu o wyciszeniu
        try {
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const auditLogs = await newMember.guild.fetchAuditLogs({
            limit: 1,
            type: AuditLogEvent.MemberUpdate
          });
          
          const timeoutLog = auditLogs.entries.first();
          
          if (timeoutLog && timeoutLog.target.id === newMember.user.id && 
              timeoutLog.changes.some(change => change.key === 'communication_disabled_until')) {
            executor = timeoutLog.executor;
            if (timeoutLog.reason) reason = timeoutLog.reason;
          }
        } catch (error) {
          logger.error(`Błąd podczas pobierania dziennika audytu dla timeout: ${error.message}`);
        }
        
        // Oblicz czas trwania wyciszenia
        const now = new Date();
        const timeoutEnd = new Date(newMember.communicationDisabledUntil);
        const durationMs = timeoutEnd - now;
        
        // Konwertuj czas trwania na czytelny format
        timeoutDuration = formatDuration(durationMs);
        
        // Przygotuj embed z informacjami o wyciszeniu
        changeEmbed = new EmbedBuilder()
          .setTitle('Wyciszono użytkownika (timeout)')
          .setColor(0x9B59B6)
          .setDescription(`**Użytkownik:** ${newMember.user.tag} (${newMember.user.id})`)
          .addFields(
            { name: 'Czas trwania', value: timeoutDuration },
            { name: 'Do kiedy', value: `<t:${Math.floor(timeoutEnd.getTime() / 1000)}:F>` }
          )
          .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
          .setTimestamp()
          .setFooter({ text: `ID użytkownika: ${newMember.user.id}` });
        
        if (executor) {
          changeEmbed.addFields({ name: 'Wyciszony przez', value: `${executor.tag} (${executor.id})` });
        }
        
        if (reason !== "Nie podano powodu") {
          changeEmbed.addFields({ name: 'Powód', value: reason });
        }
      }
      
      // Sprawdź czy z użytkownika zdjęto wyciszenie (timeout)
      if (oldMember.communicationDisabledUntil && !newMember.communicationDisabledUntil) {
        changeType = 'timeout_removed';
        
        // Pobierz informacje z dziennika audytu o zdjęciu wyciszenia
        try {
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const auditLogs = await newMember.guild.fetchAuditLogs({
            limit: 1,
            type: AuditLogEvent.MemberUpdate
          });
          
          const timeoutLog = auditLogs.entries.first();
          
          if (timeoutLog && timeoutLog.target.id === newMember.user.id && 
              timeoutLog.changes.some(change => change.key === 'communication_disabled_until')) {
            executor = timeoutLog.executor;
            if (timeoutLog.reason) reason = timeoutLog.reason;
          }
        } catch (error) {
          logger.error(`Błąd podczas pobierania dziennika audytu dla zdjęcia timeout: ${error.message}`);
        }
        
        // Przygotuj embed z informacjami o zdjęciu wyciszenia
        changeEmbed = new EmbedBuilder()
          .setTitle('Zdjęto wyciszenie (timeout)')
          .setColor(0x58D68D)
          .setDescription(`**Użytkownik:** ${newMember.user.tag} (${newMember.user.id})`)
          .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
          .setTimestamp()
          .setFooter({ text: `ID użytkownika: ${newMember.user.id}` });
        
        if (executor) {
          changeEmbed.addFields({ name: 'Zdjęte przez', value: `${executor.tag} (${executor.id})` });
        }
        
        if (reason !== "Nie podano powodu") {
          changeEmbed.addFields({ name: 'Powód', value: reason });
        }
      }
      
      // Jeśli wykryto zmianę i utworzono embed, wyślij go na kanał logów
      if (changeType && changeEmbed) {
        await logChannel.send({ embeds: [changeEmbed] });
      }
    } catch (error) {
      logger.error(`Błąd podczas logowania aktualizacji członka: ${error.stack}`);
    }
  }
};

// Funkcja pomocnicza do formatowania czasu trwania
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days} dni, ${hours % 24} godz.`;
  } else if (hours > 0) {
    return `${hours} godz., ${minutes % 60} min.`;
  } else if (minutes > 0) {
    return `${minutes} min., ${seconds % 60} sek.`;
  } else {
    return `${seconds} sekund`;
  }
}