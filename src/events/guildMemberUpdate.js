// src/events/guildMemberUpdate.js - czysła wersja
const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const Guild = require('../models/Guild');
const MessageLog = require('../models/MessageLog');
const { canAddAsTempRole } = require('../utils/checkExpiredRoles');
const logger = require('../utils/logger');

module.exports = {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    try {
      // Sprawdź czy funkcja logowania wiadomości jest włączona na serwerze
      const guildSettings = await Guild.findOne({ guildId: newMember.guild?.id });
      
      // Jeśli nie ma guildSettings lub funkcja nie jest włączona, zakończ
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
      
      // Sprawdź co się zmieniło i przygotuj odpowiedni embed
      let changeEmbed = null;
      
      // Sprawdź czy zmienił się nickname
      if (oldMember.nickname !== newMember.nickname) {
        changeEmbed = await handleNicknameChange(oldMember, newMember);
        await logNicknameChangeToDatabase(oldMember, newMember);
      }
      // Sprawdź czy zmieniono role (dodano lub usunięto)
      else if (!oldMember.roles.cache.equals(newMember.roles.cache)) {
        const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
        const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));

        if (addedRoles.size > 0) {
          changeEmbed = await handleRoleAdd(oldMember, newMember, addedRoles);
          await logRoleChangesToDatabase(oldMember, newMember, addedRoles, 'add');
        } else if (removedRoles.size > 0) {
          changeEmbed = await handleRoleRemove(oldMember, newMember, removedRoles);
          await logRoleChangesToDatabase(oldMember, newMember, removedRoles, 'remove');
        }
      }
      // Sprawdź czy użytkownik został wyciszony (timeout)
      else if (!oldMember.communicationDisabledUntil && newMember.communicationDisabledUntil) {
        changeEmbed = await handleTimeoutAdd(oldMember, newMember);
        await logTimeoutToDatabase(oldMember, newMember, 'add');
      }
      // Sprawdź czy z użytkownika zdjęto wyciszenie (timeout)
      else if (oldMember.communicationDisabledUntil && !newMember.communicationDisabledUntil) {
        changeEmbed = await handleTimeoutRemove(oldMember, newMember);
        await logTimeoutToDatabase(oldMember, newMember, 'remove');
      }

      // Jeśli wykryto zmianę i utworzono embed, wyślij go na kanał logów
      if (changeEmbed) {
        await logChannel.send({ embeds: [changeEmbed] });
      }
    } catch (error) {
      logger.error(`Błąd podczas logowania aktualizacji członka: ${error.stack}`);
    }
  }
};

// Funkcje pomocnicze do obsługi różnych typów zmian

async function handleNicknameChange(oldMember, newMember) {
  let executor = null;
  let reason = "Nie podano powodu";
  
  try {
    // Krótkie opóźnienie i sprawdzenie audit logs
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const auditLogs = await newMember.guild.fetchAuditLogs({
      limit: 5,
      type: AuditLogEvent.MemberUpdate
    });
    
    // Znajdź najnowszy wpis dotyczący tego użytkownika i zmiany nicku
    const nickLog = auditLogs.entries.find(entry => 
      entry.target.id === newMember.user.id && 
      entry.changes.some(change => change.key === 'nick') &&
      (Date.now() - entry.createdTimestamp) < 10000 // max 10 sekund
    );
    
    if (nickLog) {
      executor = nickLog.executor;
      if (nickLog.reason) reason = nickLog.reason;
    }
  } catch (error) {
    logger.error(`Błąd podczas pobierania dziennika audytu dla zmiany nicku: ${error.message}`);
  }
  
  // Przygotuj embed z informacjami o zmianie nicku
  const changeEmbed = new EmbedBuilder()
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
  
  if (executor && executor.id !== newMember.user.id) {
    changeEmbed.addFields({ name: 'Zmienione przez', value: `${executor.tag} (${executor.id})` });
  } else if (!executor || executor.id === newMember.user.id) {
    changeEmbed.addFields({ name: 'Zmienione przez', value: 'Samego siebie' });
  }
  
  if (reason !== "Nie podano powodu") {
    changeEmbed.addFields({ name: 'Powód', value: reason });
  }
  
  return changeEmbed;
}

async function handleRoleAdd(oldMember, newMember, addedRoles) {
  let executor = null;
  let reason = "Nie podano powodu";
  
  try {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const auditLogs = await newMember.guild.fetchAuditLogs({
      limit: 5,
      type: AuditLogEvent.MemberRoleUpdate
    });
    
    const roleLog = auditLogs.entries.find(entry => 
      entry.target.id === newMember.user.id && 
      entry.changes.some(change => change.key === '$add') &&
      (Date.now() - entry.createdTimestamp) < 10000
    );
    
    if (roleLog) {
      executor = roleLog.executor;
      if (roleLog.reason) reason = roleLog.reason;
    }
  } catch (error) {
    logger.error(`Błąd podczas pobierania dziennika audytu dla dodania roli: ${error.message}`);
  }
  
  // WAŻNE: Tutaj NIE DODAJEMY automatycznie ról jako czasowych!
  // Jeśli miałbyś taką logikę, dodaj sprawdzenie:
  /*
  for (const role of addedRoles) {
    // Sprawdź czy rola może być dodana jako czasowa
    if (!canAddAsTempRole(newMember.guild.id, newMember.id, role.id)) {
      logger.info(`🚫 Pomijam automatyczne dodanie roli ${role.name} jako czasowa - jest chroniona`);
      continue;
    }
    
    // Tutaj ewentualny kod dodawania roli jako czasowej
    // UWAGA: Ten kod został USUNIĘTY aby zapobiec problemom
    // await TempRole.create({...});
  }
  */
  
  const changeEmbed = new EmbedBuilder()
    .setTitle('Dodano role użytkownikowi')
    .setColor(0x2ECC71)
    .setDescription(`**Użytkownik:** ${newMember.user.tag} (${newMember.user.id})`)
    .addFields(
      { name: 'Dodane role', value: addedRoles.map(r => `${r}`).join(', ') }
    )
    .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
    .setTimestamp()
    .setFooter({ text: `ID użytkownika: ${newMember.user.id}` });
  
  if (executor && executor.id !== newMember.user.id) {
    changeEmbed.addFields({ name: 'Dodane przez', value: `${executor.tag} (${executor.id})` });
  }
  
  if (reason !== "Nie podano powodu") {
    changeEmbed.addFields({ name: 'Powód', value: reason });
  }
  
  return changeEmbed;
}

async function handleRoleRemove(oldMember, newMember, removedRoles) {
  let executor = null;
  let reason = "Nie podano powodu";
  
  try {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const auditLogs = await newMember.guild.fetchAuditLogs({
      limit: 5,
      type: AuditLogEvent.MemberRoleUpdate
    });
    
    const roleLog = auditLogs.entries.find(entry => 
      entry.target.id === newMember.user.id && 
      entry.changes.some(change => change.key === '$remove') &&
      (Date.now() - entry.createdTimestamp) < 10000
    );
    
    if (roleLog) {
      executor = roleLog.executor;
      if (roleLog.reason) reason = roleLog.reason;
    }
  } catch (error) {
    logger.error(`Błąd podczas pobierania dziennika audytu dla usunięcia roli: ${error.message}`);
  }
  
  const changeEmbed = new EmbedBuilder()
    .setTitle('Usunięto role użytkownikowi')
    .setColor(0xE74C3C)
    .setDescription(`**Użytkownik:** ${newMember.user.tag} (${newMember.user.id})`)
    .addFields(
      { name: 'Usunięte role', value: removedRoles.map(r => `${r}`).join(', ') }
    )
    .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
    .setTimestamp()
    .setFooter({ text: `ID użytkownika: ${newMember.user.id}` });
  
  if (executor && executor.id !== newMember.user.id) {
    changeEmbed.addFields({ name: 'Usunięte przez', value: `${executor.tag} (${executor.id})` });
  }
  
  if (reason !== "Nie podano powodu") {
    changeEmbed.addFields({ name: 'Powód', value: reason });
  }
  
  return changeEmbed;
}

async function handleTimeoutAdd(oldMember, newMember) {
  let executor = null;
  let reason = "Nie podano powodu";
  
  try {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const auditLogs = await newMember.guild.fetchAuditLogs({
      limit: 5,
      type: AuditLogEvent.MemberUpdate
    });
    
    const timeoutLog = auditLogs.entries.find(entry => 
      entry.target.id === newMember.user.id && 
      entry.changes.some(change => change.key === 'communication_disabled_until') &&
      (Date.now() - entry.createdTimestamp) < 10000
    );
    
    if (timeoutLog) {
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
  const timeoutDuration = formatDuration(durationMs);
  
  const changeEmbed = new EmbedBuilder()
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
  
  return changeEmbed;
}

async function handleTimeoutRemove(oldMember, newMember) {
  let executor = null;
  let reason = "Nie podano powodu";
  
  try {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const auditLogs = await newMember.guild.fetchAuditLogs({
      limit: 5,
      type: AuditLogEvent.MemberUpdate
    });
    
    const timeoutLog = auditLogs.entries.find(entry => 
      entry.target.id === newMember.user.id && 
      entry.changes.some(change => change.key === 'communication_disabled_until') &&
      (Date.now() - entry.createdTimestamp) < 10000
    );
    
    if (timeoutLog) {
      executor = timeoutLog.executor;
      if (timeoutLog.reason) reason = timeoutLog.reason;
    }
  } catch (error) {
    logger.error(`Błąd podczas pobierania dziennika audytu dla zdjęcia timeout: ${error.message}`);
  }
  
  const changeEmbed = new EmbedBuilder()
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
  
  return changeEmbed;
}

// Funkcje do zapisywania danych do bazy danych

async function logNicknameChangeToDatabase(oldMember, newMember) {
  try {
    // Pobierz informacje o executor i reason z audit logs
    let executor = null;
    let reason = null;

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const auditLogs = await newMember.guild.fetchAuditLogs({
        limit: 5,
        type: AuditLogEvent.MemberUpdate
      });

      const nickLog = auditLogs.entries.find(entry =>
        entry.target.id === newMember.user.id &&
        entry.changes.some(change => change.key === 'nick') &&
        (Date.now() - entry.createdTimestamp) < 10000
      );

      if (nickLog) {
        executor = nickLog.executor;
        reason = nickLog.reason;
      }
    } catch (error) {
      logger.error(`Błąd podczas pobierania audit logs dla nick change: ${error.message}`);
    }

    // Znajdź lub utwórz dokument MessageLog dla tego użytkownika
    let messageLog = await MessageLog.findOne({
      guildId: newMember.guild.id,
      authorId: newMember.user.id
    });

    if (!messageLog) {
      messageLog = new MessageLog({
        guildId: newMember.guild.id,
        channelId: newMember.guild.systemChannel?.id || newMember.guild.channels.cache.filter(c => c.type === 0).first()?.id,
        messageId: `nick-${newMember.user.id}-${Date.now()}`, // Unikalne ID dla zmian nicku
        authorId: newMember.user.id,
        authorTag: newMember.user.tag,
        content: '',
        nicknameChanges: []
      });
    }

    // Dodaj zmianę nicku
    messageLog.nicknameChanges.push({
      userId: newMember.user.id,
      userTag: newMember.user.tag,
      oldNickname: oldMember.nickname,
      newNickname: newMember.nickname,
      changedById: executor?.id,
      changedByTag: executor?.tag,
      reason: reason
    });

    await messageLog.save();
    logger.info(`Zapisano zmianę nicku dla użytkownika ${newMember.user.tag} w bazie danych`);
  } catch (error) {
    logger.error(`Błąd podczas zapisywania zmiany nicku do bazy danych: ${error.stack}`);
  }
}

async function logRoleChangesToDatabase(oldMember, newMember, roles, type) {
  try {
    // Pobierz informacje o executor i reason z audit logs
    let executor = null;
    let reason = null;

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const auditLogs = await newMember.guild.fetchAuditLogs({
        limit: 5,
        type: AuditLogEvent.MemberRoleUpdate
      });

      const roleLog = auditLogs.entries.find(entry =>
        entry.target.id === newMember.user.id &&
        entry.changes.some(change => change.key === (type === 'add' ? '$add' : '$remove')) &&
        (Date.now() - entry.createdTimestamp) < 10000
      );

      if (roleLog) {
        executor = roleLog.executor;
        reason = roleLog.reason;
      }
    } catch (error) {
      logger.error(`Błąd podczas pobierania audit logs dla zmiany roli: ${error.message}`);
    }

    // Znajdź lub utwórz dokument MessageLog dla tego użytkownika
    let messageLog = await MessageLog.findOne({
      guildId: newMember.guild.id,
      authorId: newMember.user.id
    });

    if (!messageLog) {
      messageLog = new MessageLog({
        guildId: newMember.guild.id,
        channelId: newMember.guild.systemChannel?.id || newMember.guild.channels.cache.filter(c => c.type === 0).first()?.id,
        messageId: `role-${newMember.user.id}-${Date.now()}`, // Unikalne ID dla zmian ról
        authorId: newMember.user.id,
        authorTag: newMember.user.tag,
        content: '',
        roleChanges: []
      });
    }

    // Dodaj każdą zmianę roli
    for (const role of roles) {
      messageLog.roleChanges.push({
        userId: newMember.user.id,
        userTag: newMember.user.tag,
        roleId: role.id,
        roleName: role.name,
        type: type,
        changedById: executor?.id,
        changedByTag: executor?.tag,
        reason: reason
      });
    }

    await messageLog.save();
    logger.info(`Zapisano ${type === 'add' ? 'dodanie' : 'usunięcie'} ról dla użytkownika ${newMember.user.tag} w bazie danych`);
  } catch (error) {
    logger.error(`Błąd podczas zapisywania zmiany roli do bazy danych: ${error.stack}`);
  }
}

async function logTimeoutToDatabase(oldMember, newMember, type) {
  try {
    // Pobierz informacje o executor i reason z audit logs
    let executor = null;
    let reason = null;

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const auditLogs = await newMember.guild.fetchAuditLogs({
        limit: 5,
        type: AuditLogEvent.MemberUpdate
      });

      const timeoutLog = auditLogs.entries.find(entry =>
        entry.target.id === newMember.user.id &&
        entry.changes.some(change => change.key === 'communication_disabled_until') &&
        (Date.now() - entry.createdTimestamp) < 10000
      );

      if (timeoutLog) {
        executor = timeoutLog.executor;
        reason = timeoutLog.reason;
      }
    } catch (error) {
      logger.error(`Błąd podczas pobierania audit logs dla timeout: ${error.message}`);
    }

    // Oblicz czas trwania
    let duration = null;
    let expiresAt = null;

    if (type === 'add' && newMember.communicationDisabledUntil) {
      expiresAt = new Date(newMember.communicationDisabledUntil);
      const now = new Date();
      const durationMs = expiresAt - now;
      duration = formatDuration(durationMs);
    }

    // Znajdź lub utwórz dokument MessageLog dla tego użytkownika
    let messageLog = await MessageLog.findOne({
      guildId: newMember.guild.id,
      authorId: newMember.user.id
    });

    if (!messageLog) {
      messageLog = new MessageLog({
        guildId: newMember.guild.id,
        channelId: newMember.guild.systemChannel?.id || newMember.guild.channels.cache.filter(c => c.type === 0).first()?.id,
        messageId: `timeout-${newMember.user.id}-${Date.now()}`, // Unikalne ID dla timeoutów
        authorId: newMember.user.id,
        authorTag: newMember.user.tag,
        content: '',
        modActions: []
      });
    }

    // Dodaj akcję moderacyjną
    messageLog.modActions.push({
      type: type === 'add' ? 'timeout' : 'remove_timeout',
      targetId: newMember.user.id,
      targetTag: newMember.user.tag,
      moderatorId: executor?.id,
      moderatorTag: executor?.tag,
      reason: reason,
      duration: duration,
      expiresAt: expiresAt
    });

    await messageLog.save();
    logger.info(`Zapisano ${type === 'add' ? 'dodanie' : 'usunięcie'} timeout dla użytkownika ${newMember.user.tag} w bazie danych`);
  } catch (error) {
    logger.error(`Błąd podczas zapisywania timeout do bazy danych: ${error.stack}`);
  }
}

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
