// src/utils/checkExpiredRoles.js - kompletna wersja z obsługą ról z zamianą
const TempRole = require('../models/TempRole');
const TempRoleReplace = require('../models/TempRoleReplace');
const logger = require('./logger');

async function checkExpiredRoles(client) {
  try {
    const startTime = new Date();
    logger.info('🔄 [CHECKER] Rozpoczęcie sprawdzania wygasłych ról czasowych');
    
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
    
    const endTime = new Date();
    const duration = Math.round((endTime - startTime) / 1000);
    logger.info(`🏁 [CHECKER] Zakończono sprawdzanie w ${duration}s. Przetworzono: ${totalResult.processed}, Usunięto: ${totalResult.removed}, Zamieniono: ${totalResult.replaced}, Błędów: ${totalResult.errors}`);
    
    return totalResult;
  } catch (error) {
    logger.error(`💥 [CHECKER] Krytyczny błąd: ${error.stack}`);
    throw error;
  }
}

// Sprawdź standardowe role czasowe
async function checkStandardTempRoles(client) {
  try {
    logger.debug('🔍 [CHECKER] Sprawdzanie standardowych ról czasowych');
    
    const now = new Date();
    const expiredRoles = await TempRole.find({
      expiresAt: { $lte: now }
    }).sort({ expiresAt: 1 });
    
    logger.info(`📋 [CHECKER] Znaleziono ${expiredRoles.length} wygasłych standardowych ról czasowych`);
    
    if (expiredRoles.length === 0) {
      return { processed: 0, removed: 0, errors: 0 };
    }
    
    let removed = 0;
    let errors = 0;
    let processed = 0;
    
    for (const tempRole of expiredRoles) {
      processed++;
      
      try {
        logger.debug(`🔄 [CHECKER] Przetwarzanie standardowej roli ${processed}/${expiredRoles.length}: ID ${tempRole._id}`);
        
        const guild = client.guilds.cache.get(tempRole.guildId);
        if (!guild) {
          logger.warn(`⚠️ [CHECKER] Nie znaleziono serwera ${tempRole.guildId}`);
          await TempRole.deleteOne({ _id: tempRole._id });
          removed++;
          continue;
        }
        
        let member;
        try {
          member = await guild.members.fetch(tempRole.userId);
        } catch (fetchError) {
          logger.warn(`⚠️ [CHECKER] Użytkownik ${tempRole.userId} nie jest na serwerze ${guild.name}`);
          await TempRole.deleteOne({ _id: tempRole._id });
          removed++;
          continue;
        }
        
        const role = guild.roles.cache.get(tempRole.roleId);
        if (!role) {
          logger.warn(`⚠️ [CHECKER] Nie znaleziono roli ${tempRole.roleId} na serwerze ${guild.name}`);
          await TempRole.deleteOne({ _id: tempRole._id });
          removed++;
          continue;
        }
        
        if (member.roles.cache.has(role.id)) {
          try {
            const botMember = guild.members.me;
            if (role.position >= botMember.roles.highest.position) {
              logger.error(`❌ [CHECKER] Bot nie może zarządzać rolą ${role.name} - zbyt niska pozycja`);
              errors++;
              continue;
            }
            
            await member.roles.remove(role, `Wygasła standardowa rola czasowa (ID: ${tempRole._id})`);
            logger.info(`✅ [CHECKER] Usunięto standardową rolę ${role.name} użytkownikowi ${member.user.tag}`);
            
            // Wyślij DM
            try {
              await member.send({
                content: `⏰ Twoja rola **${role.name}** na serwerze **${guild.name}** wygasła i została usunięta.`
              });
              logger.debug(`📨 [CHECKER] Wysłano DM do ${member.user.tag}`);
            } catch (dmError) {
              logger.debug(`📭 [CHECKER] Nie można wysłać DM do ${member.user.tag}: ${dmError.message}`);
            }
          } catch (roleRemoveError) {
            logger.error(`❌ [CHECKER] Błąd usuwania standardowej roli: ${roleRemoveError.message}`);
            errors++;
            continue;
          }
        } else {
          logger.debug(`ℹ️ [CHECKER] Użytkownik ${member.user.tag} już nie ma roli ${role.name}`);
        }
        
        await TempRole.deleteOne({ _id: tempRole._id });
        removed++;
        
        // Pauza co 5 ról
        if (processed % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (roleError) {
        logger.error(`❌ [CHECKER] Błąd przetwarzania standardowej roli: ${roleError.message}`);
        errors++;
      }
    }
    
    return { processed, removed, errors };
  } catch (error) {
    logger.error(`💥 [CHECKER] Błąd w sprawdzaniu standardowych ról: ${error.stack}`);
    return { processed: 0, removed: 0, errors: 1 };
  }
}

// Sprawdź role czasowe z automatyczną zamianą
async function checkTempRoleReplacements(client) {
  try {
    logger.debug('🔍 [CHECKER] Sprawdzanie ról czasowych z automatyczną zamianą');
    
    const now = new Date();
    const expiredRoleReplacements = await TempRoleReplace.find({
      expiresAt: { $lte: now }
    }).sort({ expiresAt: 1 });
    
    logger.info(`📋 [CHECKER] Znaleziono ${expiredRoleReplacements.length} wygasłych ról z automatyczną zamianą`);
    
    if (expiredRoleReplacements.length === 0) {
      return { processed: 0, removed: 0, replaced: 0, errors: 0 };
    }
    
    let removed = 0;
    let replaced = 0;
    let errors = 0;
    let processed = 0;
    
    for (const tempRoleDoc of expiredRoleReplacements) {
      processed++;
      
      try {
        logger.info(`🔄 [CHECKER] Przetwarzanie zamiany roli ${processed}/${expiredRoleReplacements.length}: ID ${tempRoleDoc._id}`);
        
        const guild = client.guilds.cache.get(tempRoleDoc.guildId);
        if (!guild) {
          logger.warn(`⚠️ [CHECKER] Nie znaleziono serwera ${tempRoleDoc.guildId}`);
          await TempRoleReplace.deleteOne({ _id: tempRoleDoc._id });
          removed++;
          continue;
        }
        
        let member;
        try {
          member = await guild.members.fetch(tempRoleDoc.userId);
        } catch (fetchError) {
          logger.warn(`⚠️ [CHECKER] Użytkownik ${tempRoleDoc.userId} nie jest na serwerze ${guild.name}`);
          await TempRoleReplace.deleteOne({ _id: tempRoleDoc._id });
          removed++;
          continue;
        }
        
        const tempRole = guild.roles.cache.get(tempRoleDoc.tempRoleId);
        const finalRole = guild.roles.cache.get(tempRoleDoc.finalRoleId);
        
        if (!finalRole) {
          logger.warn(`⚠️ [CHECKER] Nie znaleziono roli końcowej ${tempRoleDoc.finalRoleId}, pomijam zamianę`);
          await TempRoleReplace.deleteOne({ _id: tempRoleDoc._id });
          removed++;
          continue;
        }
        
        // Sprawdź uprawnienia bota do zarządzania rolą końcową
        const botMember = guild.members.me;
        if (finalRole.position >= botMember.roles.highest.position) {
          logger.error(`❌ [CHECKER] Bot nie może zarządzać rolą końcową ${finalRole.name} - zbyt niska pozycja`);
          errors++;
          continue;
        }
        
        logger.info(`🔄 [CHECKER] Wykonywanie zamiany: ${tempRole ? tempRole.name : 'Nieznana'} → ${finalRole.name} dla ${member.user.tag}`);
        
        // Usuń rolę czasową jeśli istnieje i użytkownik ją ma
        if (tempRole && member.roles.cache.has(tempRole.id) && tempRoleDoc.removeTempRole) {
          try {
            if (tempRole.position < botMember.roles.highest.position) {
              await member.roles.remove(tempRole.id, `Zamiana roli czasowej na ${finalRole.name}`);
              logger.debug(`🗑️ [CHECKER] Usunięto rolę czasową ${tempRole.name}`);
            } else {
              logger.warn(`⚠️ [CHECKER] Nie można usunąć roli czasowej ${tempRole.name} - zbyt niska pozycja bota`);
            }
          } catch (removeError) {
            logger.warn(`⚠️ [CHECKER] Nie można usunąć roli czasowej: ${removeError.message}`);
          }
        }
        
        // Dodaj rolę końcową
        if (!member.roles.cache.has(finalRole.id)) {
          try {
            await member.roles.add(finalRole.id, `Automatyczna zamiana z roli czasowej ${tempRole ? tempRole.name : 'nieznana'}`);
            logger.info(`✅ [CHECKER] Przyznano rolę końcową ${finalRole.name} użytkownikowi ${member.user.tag}`);
            replaced++;
            
            // Wyślij powiadomienie DM
            try {
              const tempRoleName = tempRole ? tempRole.name : 'nieznana rola czasowa';
              await member.send({
                content: `🔄 Twoja rola **${tempRoleName}** na serwerze **${guild.name}** wygasła i została automatycznie zamieniona na **${finalRole.name}**.`
              });
              logger.debug(`📨 [CHECKER] Wysłano DM o zamianie do ${member.user.tag}`);
            } catch (dmError) {
              logger.debug(`📭 [CHECKER] Nie można wysłać DM o zamianie do ${member.user.tag}: ${dmError.message}`);
            }
          } catch (addError) {
            logger.error(`❌ [CHECKER] Błąd podczas dodawania roli końcowej ${finalRole.name}: ${addError.message}`);
            errors++;
            continue;
          }
        } else {
          logger.debug(`ℹ️ [CHECKER] Użytkownik ${member.user.tag} już ma rolę końcową ${finalRole.name}`);
          replaced++; // Liczymy jako udaną zamianę
        }
        
        // Usuń wpis z bazy danych
        await TempRoleReplace.deleteOne({ _id: tempRoleDoc._id });
        removed++;
        
        // Pauza co 5 ról
        if (processed % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (replaceError) {
        logger.error(`❌ [CHECKER] Błąd podczas zamiany roli: ${replaceError.message}`);
        errors++;
      }
    }
    
    return { processed, removed, replaced, errors };
  } catch (error) {
    logger.error(`💥 [CHECKER] Błąd w sprawdzaniu ról z zamianą: ${error.stack}`);
    return { processed: 0, removed: 0, replaced: 0, errors: 1 };
  }
}

// Globalna zmienna do przechowywania interval ID
let globalExpiredRoleCheckerInterval = null;

// Funkcja do uruchamiania w tle co określony interwał
function startExpiredRoleChecker(client, intervalMinutes = 1) {
  const intervalMs = intervalMinutes * 60 * 1000;
  
  // Zatrzymaj poprzedni checker jeśli istnieje
  if (globalExpiredRoleCheckerInterval) {
    clearInterval(globalExpiredRoleCheckerInterval);
    logger.info('🛑 [STARTER] Zatrzymano poprzedni checker ról czasowych');
  }
  
  logger.info(`🚀 [STARTER] Uruchamianie automatycznego sprawdzania wygasłych ról co ${intervalMinutes} ${intervalMinutes === 1 ? 'minutę' : 'minut'}`);
  
  // Funkcja sprawdzająca z error handling
  const runCheck = async () => {
    try {
      logger.debug(`⏰ [STARTER] Uruchamianie automatycznego sprawdzania ról czasowych - ${new Date().toISOString()}`);
      const result = await checkExpiredRoles(client);
      if (result.processed > 0 || result.removed > 0 || result.replaced > 0 || result.errors > 0) {
        logger.info(`📈 [STARTER] Wynik automatycznego sprawdzania: Przetworzono: ${result.processed}, Usunięto: ${result.removed}, Zamieniono: ${result.replaced}, Błędów: ${result.errors}`);
      } else {
        logger.debug(`📈 [STARTER] Wynik automatycznego sprawdzania: Brak ról do przetworzenia`);
      }
    } catch (error) {
      logger.error(`💥 [STARTER] Błąd podczas automatycznego sprawdzania wygasłych ról: ${error.message}`);
      logger.error(`📊 [STARTER] Stack trace: ${error.stack}`);
    }
  };
  
  // Uruchom od razu po 30 sekundach (daj czas botowi na pełne uruchomienie)
  setTimeout(() => {
    logger.info('🏁 [STARTER] Uruchamianie pierwszego sprawdzania ról czasowych po starcie bota');
    runCheck();
  }, 30000);
  
  // Następnie uruchamiaj co określony interwał
  globalExpiredRoleCheckerInterval = setInterval(runCheck, intervalMs);
  
  logger.info(`✅ [STARTER] Checker ról czasowych został uruchomiony (ID: ${globalExpiredRoleCheckerInterval}). Następne sprawdzenie za ${intervalMinutes} ${intervalMinutes === 1 ? 'minutę' : 'minut'}`);
  
  return globalExpiredRoleCheckerInterval;
}

// Funkcja do zatrzymania sprawdzania
function stopExpiredRoleChecker() {
  if (globalExpiredRoleCheckerInterval) {
    clearInterval(globalExpiredRoleCheckerInterval);
    const intervalId = globalExpiredRoleCheckerInterval;
    globalExpiredRoleCheckerInterval = null;
    logger.info(`🛑 [STOPPER] Zatrzymano automatyczne sprawdzanie wygasłych ról (ID: ${intervalId})`);
    return true;
  }
  logger.warn('⚠️ [STOPPER] Nie można zatrzymać checker - nie był uruchomiony');
  return false;
}

// Funkcja do sprawdzenia statusu
function getExpiredRoleCheckerStatus() {
  const status = {
    isRunning: globalExpiredRoleCheckerInterval !== null,
    intervalId: globalExpiredRoleCheckerInterval
  };
  logger.debug(`🔍 [STATUS] Checker status: ${JSON.stringify(status)}`);
  return status;
}

module.exports = { 
  checkExpiredRoles, 
  startExpiredRoleChecker, 
  stopExpiredRoleChecker,
  getExpiredRoleCheckerStatus
};