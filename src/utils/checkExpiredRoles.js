// src/utils/checkExpiredRoles.js - z systemem diagnostycznym
const TempRole = require('../models/TempRole');
const TempRoleReplace = require('../models/TempRoleReplace');
const { protectRole, isRoleProtected, monitorTempRoleOperations } = require('./tempRoleTracker');
const logger = require('./logger');

// Uruchom monitoring przy pierwszym załadowaniu
monitorTempRoleOperations();

// Główna funkcja sprawdzania wygasłych ról
async function checkExpiredRoles(client) {
  try {
    logger.info('🔄 Rozpoczęcie sprawdzania wygasłych ról czasowych');
    
    // Sprawdź standardowe role czasowe
    const standardResult = await checkStandardTempRoles(client);
    
    // Sprawdź role czasowe z automatyczną zamianą
    const replaceResult = await checkTempRoleReplacements(client);
    
    const totalResult = {
      processed: standardResult.processed + replaceResult.processed,
      removed: standardResult.removed + replaceResult.removed,
      replaced: replaceResult.replaced || 0,
      errors: standardResult.errors + replaceResult.errors
    };
    
    if (totalResult.processed > 0) {
      logger.info(`✅ Zakończono sprawdzanie. Przetworzono: ${totalResult.processed}, Usunięto: ${totalResult.removed}, Zamieniono: ${totalResult.replaced}, Błędów: ${totalResult.errors}`);
    }
    
    return totalResult;
  } catch (error) {
    logger.error(`💥 Krytyczny błąd podczas sprawdzania ról: ${error.stack}`);
    throw error;
  }
}

// Sprawdź standardowe role czasowe
async function checkStandardTempRoles(client) {
  try {
    const now = new Date();
    const expiredRoles = await TempRole.find({
      expiresAt: { $lte: now }
    }).sort({ expiresAt: 1 });
    
    if (expiredRoles.length === 0) {
      return { processed: 0, removed: 0, errors: 0 };
    }
    
    logger.info(`📋 Znaleziono ${expiredRoles.length} wygasłych standardowych ról czasowych`);
    
    let removed = 0;
    let errors = 0;
    let processed = 0;
    
    for (const tempRole of expiredRoles) {
      processed++;
      
      try {
        const guild = client.guilds.cache.get(tempRole.guildId);
        if (!guild) {
          await TempRole.deleteOne({ _id: tempRole._id });
          removed++;
          continue;
        }
        
        let member;
        try {
          member = await guild.members.fetch(tempRole.userId);
        } catch (fetchError) {
          await TempRole.deleteOne({ _id: tempRole._id });
          removed++;
          continue;
        }
        
        const role = guild.roles.cache.get(tempRole.roleId);
        if (!role) {
          await TempRole.deleteOne({ _id: tempRole._id });
          removed++;
          continue;
        }
        
        if (member.roles.cache.has(role.id)) {
          try {
            await member.roles.remove(role, `Wygasła standardowa rola czasowa`);
            logger.info(`✅ Usunięto standardową rolę ${role.name} użytkownikowi ${member.user.tag}`);
            
            // Powiadomienie DM
            try {
              await member.send({
                content: `⏰ Twoja rola **${role.name}** na serwerze **${guild.name}** wygasła i została usunięta.`
              });
            } catch (dmError) {
              // Ignoruj błędy DM
            }
          } catch (roleRemoveError) {
            logger.error(`❌ Błąd usuwania standardowej roli: ${roleRemoveError.message}`);
            errors++;
            continue;
          }
        }
        
        await TempRole.deleteOne({ _id: tempRole._id });
        removed++;
        
        // Pauza co 5 ról
        if (processed % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (roleError) {
        logger.error(`❌ Błąd przetwarzania standardowej roli: ${roleError.message}`);
        errors++;
      }
    }
    
    return { processed, removed, errors };
  } catch (error) {
    logger.error(`💥 Błąd w sprawdzaniu standardowych ról: ${error.stack}`);
    return { processed: 0, removed: 0, errors: 1 };
  }
}

// Sprawdź role czasowe z automatyczną zamianą
async function checkTempRoleReplacements(client) {
  try {
    const now = new Date();
    const expiredRoleReplacements = await TempRoleReplace.find({
      expiresAt: { $lte: now }
    }).sort({ expiresAt: 1 });
    
    if (expiredRoleReplacements.length === 0) {
      return { processed: 0, removed: 0, replaced: 0, errors: 0 };
    }
    
    logger.info(`📋 Znaleziono ${expiredRoleReplacements.length} wygasłych ról z automatyczną zamianą`);
    
    let removed = 0;
    let replaced = 0;
    let errors = 0;
    let processed = 0;
    
    for (const tempRoleDoc of expiredRoleReplacements) {
      processed++;
      
      try {
        const guild = client.guilds.cache.get(tempRoleDoc.guildId);
        if (!guild) {
          await TempRoleReplace.deleteOne({ _id: tempRoleDoc._id });
          removed++;
          continue;
        }
        
        let member;
        try {
          member = await guild.members.fetch(tempRoleDoc.userId);
        } catch (fetchError) {
          await TempRoleReplace.deleteOne({ _id: tempRoleDoc._id });
          removed++;
          continue;
        }
        
        const tempRole = guild.roles.cache.get(tempRoleDoc.tempRoleId);
        const finalRole = guild.roles.cache.get(tempRoleDoc.finalRoleId);
        
        if (!finalRole) {
          logger.warn(`⚠️ Nie znaleziono roli końcowej ${tempRoleDoc.finalRoleId}`);
          await TempRoleReplace.deleteOne({ _id: tempRoleDoc._id });
          removed++;
          continue;
        }
        
        // Sprawdź uprawnienia bota
        const botMember = guild.members.me;
        if (finalRole.position >= botMember.roles.highest.position) {
          logger.error(`❌ Bot nie może zarządzać rolą końcową ${finalRole.name} - zbyt niska pozycja`);
          errors++;
          continue;
        }
        
        logger.info(`🔄 Wykonywanie zamiany: ${tempRole ? tempRole.name : 'Nieznana'} → ${finalRole.name} dla ${member.user.tag}`);
        
        // Usuń rolę czasową jeśli istnieje i użytkownik ją ma
        if (tempRole && member.roles.cache.has(tempRole.id) && tempRoleDoc.removeTempRole) {
          try {
            if (tempRole.position < botMember.roles.highest.position) {
              await member.roles.remove(tempRole.id, `Zamiana roli czasowej na ${finalRole.name}`);
              logger.info(`🗑️ Usunięto rolę czasową ${tempRole.name}`);
            }
          } catch (removeError) {
            logger.warn(`⚠️ Nie można usunąć roli czasowej: ${removeError.message}`);
          }
        }
        
        // KLUCZOWE: Chroń rolę końcową przed dodaniem jako czasowa
        protectRole(guild.id, member.id, finalRole.id, `Rola końcowa z zamiany ${tempRole ? tempRole.name : 'nieznana'} → ${finalRole.name}`, 300000); // 5 minut ochrony
        
        // Dodaj rolę końcową
        if (!member.roles.cache.has(finalRole.id)) {
          try {
            await member.roles.add(finalRole.id, `Automatyczna zamiana z roli czasowej - ROLA STAŁA`);
            logger.info(`✅ Przyznano rolę końcową ${finalRole.name} użytkownikowi ${member.user.tag}`);
            replaced++;
            
            // Uruchom sprawdzenie po 10 sekundach czy rola została przypadkiem dodana jako czasowa
            setTimeout(async () => {
              await checkAndCleanupUnwantedTempRole(guild.id, member.id, finalRole.id, finalRole.name);
            }, 10000);
            
            // Powiadomienie DM
            try {
              const tempRoleName = tempRole ? tempRole.name : 'nieznana rola czasowa';
              await member.send({
                content: `🔄 Twoja rola **${tempRoleName}** na serwerze **${guild.name}** wygasła i została automatycznie zamieniona na **${finalRole.name}**.\n\n✅ Rola **${finalRole.name}** jest rolą stałą i nie wygaśnie.`
              });
            } catch (dmError) {
              // Ignoruj błędy DM
            }
          } catch (addError) {
            logger.error(`❌ Błąd podczas dodawania roli końcowej ${finalRole.name}: ${addError.message}`);
            errors++;
            continue;
          }
        } else {
          replaced++; // Już ma rolę - liczymy jako udaną zamianę
        }
        
        // Usuń wpis z bazy danych
        await TempRoleReplace.deleteOne({ _id: tempRoleDoc._id });
        removed++;
        
        // Pauza co 5 ról
        if (processed % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (replaceError) {
        logger.error(`❌ Błąd podczas zamiany roli: ${replaceError.message}`);
        errors++;
      }
    }
    
    return { processed, removed, replaced, errors };
  } catch (error) {
    logger.error(`💥 Błąd w sprawdzaniu ról z zamianą: ${error.stack}`);
    return { processed: 0, removed: 0, replaced: 0, errors: 1 };
  }
}

// Funkcja do sprawdzania i usuwania niechcianych ról czasowych
async function checkAndCleanupUnwantedTempRole(guildId, userId, roleId, roleName) {
  try {
    logger.info(`🔍 Sprawdzanie czy rola końcowa ${roleName} (${roleId}) została dodana jako czasowa...`);
    
    // Sprawdź w standardowych rolach czasowych
    const unwantedTempRole = await TempRole.findOne({
      guildId: guildId,
      userId: userId,
      roleId: roleId
    });
    
    // Sprawdź w rolach z zamianą
    const unwantedTempRoleReplace = await TempRoleReplace.findOne({
      guildId: guildId,
      userId: userId,
      tempRoleId: roleId
    });
    
    if (unwantedTempRole) {
      logger.error(`🚨 WYKRYTO PROBLEM: Rola końcowa ${roleName} została dodana jako standardowa rola czasowa!`);
      logger.error(`🗑️ Automatycznie usuwam rolę ${roleName} z systemu ról czasowych...`);
      await TempRole.deleteOne({ _id: unwantedTempRole._id });
      logger.info(`✅ Usunięto rolę końcową ${roleName} z systemu standardowych ról czasowych`);
    }
    
    if (unwantedTempRoleReplace) {
      logger.error(`🚨 WYKRYTO PROBLEM: Rola końcowa ${roleName} została dodana jako rola czasowa z zamianą!`);
      logger.error(`🗑️ Automatycznie usuwam rolę ${roleName} z systemu ról z zamianą...`);
      await TempRoleReplace.deleteOne({ _id: unwantedTempRoleReplace._id });
      logger.info(`✅ Usunięto rolę końcową ${roleName} z systemu ról z zamianą`);
    }
    
    if (!unwantedTempRole && !unwantedTempRoleReplace) {
      logger.info(`✅ Rola końcowa ${roleName} NIE została dodana jako czasowa - wszystko OK!`);
    }
  } catch (error) {
    logger.error(`❌ Błąd podczas sprawdzania roli końcowej: ${error.message}`);
  }
}

// Globalna zmienna interval ID
let globalExpiredRoleCheckerInterval = null;

// Uruchom automatyczne sprawdzanie
function startExpiredRoleChecker(client, intervalMinutes = 1) {
  const intervalMs = intervalMinutes * 60 * 1000;
  
  // Zatrzymaj poprzedni checker jeśli istnieje
  if (globalExpiredRoleCheckerInterval) {
    clearInterval(globalExpiredRoleCheckerInterval);
    logger.info('🛑 Zatrzymano poprzedni checker ról czasowych');
  }
  
  logger.info(`🚀 Uruchamianie automatycznego sprawdzania wygasłych ról co ${intervalMinutes} ${intervalMinutes === 1 ? 'minutę' : 'minut'}`);
  
  // Funkcja sprawdzająca
  const runCheck = async () => {
    try {
      const result = await checkExpiredRoles(client);
      if (result.processed > 0 || result.removed > 0 || result.replaced > 0 || result.errors > 0) {
        logger.info(`📈 Wynik sprawdzania: Przetworzono: ${result.processed}, Usunięto: ${result.removed}, Zamieniono: ${result.replaced}, Błędów: ${result.errors}`);
      }
    } catch (error) {
      logger.error(`💥 Błąd podczas automatycznego sprawdzania: ${error.message}`);
    }
  };
  
  // Uruchom po 30 sekundach
  setTimeout(() => {
    logger.info('🏁 Pierwsze sprawdzanie ról czasowych po starcie bota');
    runCheck();
  }, 30000);
  
  // Następnie co określony interwał
  globalExpiredRoleCheckerInterval = setInterval(runCheck, intervalMs);
  
  logger.info(`✅ Checker ról czasowych uruchomiony. Następne sprawdzenie za ${intervalMinutes} ${intervalMinutes === 1 ? 'minutę' : 'minut'}`);
  
  return globalExpiredRoleCheckerInterval;
}

// Zatrzymaj sprawdzanie
function stopExpiredRoleChecker() {
  if (globalExpiredRoleCheckerInterval) {
    clearInterval(globalExpiredRoleCheckerInterval);
    globalExpiredRoleCheckerInterval = null;
    logger.info('🛑 Zatrzymano automatyczne sprawdzanie wygasłych ról');
    return true;
  }
  return false;
}

// Sprawdź status
function getExpiredRoleCheckerStatus() {
  return {
    isRunning: globalExpiredRoleCheckerInterval !== null,
    intervalId: globalExpiredRoleCheckerInterval ? 'active' : null
  };
}

// Funkcja do sprawdzania przed dodaniem roli czasowej (używana w innych częściach kodu)
function canAddAsTempRole(guildId, userId, roleId) {
  if (isRoleProtected(guildId, userId, roleId)) {
    logger.error(`🚫 BLOKADA: Próba dodania chronionej roli ${roleId} jako czasowa dla użytkownika ${userId}`);
    return false;
  }
  return true;
}

// Funkcja do ochrony roli (alias dla protectRole)
function protectFinalRole(guildId, userId, roleId, duration = 120000) {
  return protectRole(guildId, userId, roleId, 'Rola końcowa z zamiany', duration);
}

module.exports = { 
  checkExpiredRoles, 
  startExpiredRoleChecker, 
  stopExpiredRoleChecker,
  getExpiredRoleCheckerStatus,
  canAddAsTempRole,
  protectFinalRole,
  isRoleProtected,
  checkAndCleanupUnwantedTempRole
};