// src/utils/checkExpiredRoles.js
const TempRole = require('../models/TempRole');
const logger = require('./logger');

async function checkExpiredRoles(client) {
  try {
    logger.info('🔄 Rozpoczęcie sprawdzania wygasłych ról czasowych');
    
    // Znajdź wszystkie wygasłe role czasowe
    const now = new Date();
    logger.debug(`⏰ Sprawdzanie ról wygasłych przed: ${now.toISOString()}`);
    
    const expiredRoles = await TempRole.find({
      expiresAt: { $lte: now }
    }).sort({ expiresAt: 1 });
    
    logger.info(`📋 Znaleziono ${expiredRoles.length} wygasłych ról czasowych`);
    
    if (expiredRoles.length === 0) {
      logger.info('✅ Brak wygasłych ról do usunięcia');
      return { processed: 0, removed: 0, errors: 0 };
    }
    
    let removed = 0;
    let errors = 0;
    let processed = 0;
    
    // Przetwórz każdą wygasłą rolę
    for (const tempRole of expiredRoles) {
      processed++;
      
      try {
        logger.info(`🔍 Przetwarzanie ${processed}/${expiredRoles.length}: Rola ${tempRole.roleId} dla użytkownika ${tempRole.userId} (wygasła: ${tempRole.expiresAt.toISOString()})`);
        
        // Pobierz serwer
        const guild = client.guilds.cache.get(tempRole.guildId);
        if (!guild) {
          logger.warn(`⚠️ Nie znaleziono serwera ${tempRole.guildId}, usuwam wpis z bazy`);
          await TempRole.deleteOne({ _id: tempRole._id });
          removed++;
          continue;
        }
        
        logger.debug(`🏠 Znaleziono serwer: ${guild.name}`);
        
        // Pobierz członka serwera
        let member;
        try {
          member = await guild.members.fetch(tempRole.userId);
          logger.debug(`👤 Znaleziono użytkownika: ${member.user.tag}`);
        } catch (fetchError) {
          logger.warn(`⚠️ Użytkownik ${tempRole.userId} nie jest na serwerze ${guild.name}, usuwam wpis z bazy`);
          await TempRole.deleteOne({ _id: tempRole._id });
          removed++;
          continue;
        }
        
        // Pobierz rolę
        const role = guild.roles.cache.get(tempRole.roleId);
        if (!role) {
          logger.warn(`⚠️ Nie znaleziono roli ${tempRole.roleId} na serwerze ${guild.name}, usuwam wpis z bazy`);
          await TempRole.deleteOne({ _id: tempRole._id });
          removed++;
          continue;
        }
        
        logger.debug(`🎭 Znaleziono rolę: ${role.name}`);
        
        // Sprawdź, czy użytkownik nadal ma tę rolę
        if (member.roles.cache.has(role.id)) {
          logger.info(`🗑️ Usuwam rolę ${role.name} użytkownikowi ${member.user.tag}`);
          
          try {
            // Usuń rolę
            await member.roles.remove(role, `Wygasła rola czasowa (wygasła: ${tempRole.expiresAt.toISOString()})`);
            logger.info(`✅ Pomyślnie usunięto rolę ${role.name} użytkownikowi ${member.user.tag} na serwerze ${guild.name}`);
            
            // Opcjonalnie: wysyłanie powiadomienia do użytkownika
            try {
              await member.send({
                content: `⏰ Twoja rola **${role.name}** na serwerze **${guild.name}** wygasła i została usunięta.`
              });
              logger.debug(`📨 Wysłano powiadomienie DM do ${member.user.tag}`);
            } catch (dmError) {
              logger.debug(`📭 Nie można wysłać DM do ${member.user.tag}: ${dmError.message}`);
            }
          } catch (roleRemoveError) {
            logger.error(`❌ Błąd podczas usuwania roli ${role.name} użytkownikowi ${member.user.tag}: ${roleRemoveError.message}`);
            errors++;
            continue; // Nie usuwaj z bazy danych jeśli nie udało się usunąć roli
          }
        } else {
          logger.info(`ℹ️ Użytkownik ${member.user.tag} już nie ma roli ${role.name}, usuwam tylko wpis z bazy`);
        }
        
        // Usuń z bazy danych
        await TempRole.deleteOne({ _id: tempRole._id });
        logger.debug(`🗄️ Usunięto wpis z bazy danych dla ${member.user.tag}`);
        removed++;
        
      } catch (roleError) {
        logger.error(`❌ Błąd podczas usuwania wygasłej roli: ${roleError.message}`);
        logger.error(`📊 Stack trace: ${roleError.stack}`);
        errors++;
      }
      
      // Dodaj małe opóźnienie między usuwaniem ról, aby nie przeciążyć API
      if (processed % 5 === 0) {
        logger.debug(`⏸️ Pauza po ${processed} przetworzonych ról`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    logger.info(`🏁 Zakończono sprawdzanie wygasłych ról czasowych. Przetworzono: ${processed}, Usunięto: ${removed}, Błędów: ${errors}`);
    return { processed, removed, errors };
  } catch (error) {
    logger.error(`💥 Krytyczny błąd podczas sprawdzania wygasłych ról czasowych: ${error.stack}`);
    throw error;
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
    logger.info('🛑 Zatrzymano poprzedni checker ról czasowych');
  }
  
  logger.info(`🚀 Uruchamianie automatycznego sprawdzania wygasłych ról co ${intervalMinutes} ${intervalMinutes === 1 ? 'minutę' : 'minut'}`);
  
  // Funkcja sprawdzająca z error handling
  const runCheck = async () => {
    try {
      logger.debug(`⏰ Uruchamianie automatycznego sprawdzania ról czasowych - ${new Date().toISOString()}`);
      const result = await checkExpiredRoles(client);
      if (result.processed > 0 || result.removed > 0 || result.errors > 0) {
        logger.info(`📈 Wynik automatycznego sprawdzania: Przetworzono: ${result.processed}, Usunięto: ${result.removed}, Błędów: ${result.errors}`);
      } else {
        logger.debug(`📈 Wynik automatycznego sprawdzania: Brak ról do usunięcia`);
      }
    } catch (error) {
      logger.error(`💥 Błąd podczas automatycznego sprawdzania wygasłych ról: ${error.message}`);
    }
  };
  
  // Uruchom od razu po 30 sekundach (daj czas botowi na pełne uruchomienie)
  setTimeout(() => {
    logger.info('🏁 Uruchamianie pierwszego sprawdzania ról czasowych po starcie bota');
    runCheck();
  }, 30000);
  
  // Następnie uruchamiaj co określony interwał
  globalExpiredRoleCheckerInterval = setInterval(runCheck, intervalMs);
  
  logger.info(`✅ Checker ról czasowych został uruchomiony. Następne sprawdzenie za ${intervalMinutes} ${intervalMinutes === 1 ? 'minutę' : 'minut'}`);
  
  return globalExpiredRoleCheckerInterval;
}

// Funkcja do zatrzymania sprawdzania
function stopExpiredRoleChecker() {
  if (globalExpiredRoleCheckerInterval) {
    clearInterval(globalExpiredRoleCheckerInterval);
    globalExpiredRoleCheckerInterval = null;
    logger.info('🛑 Zatrzymano automatyczne sprawdzanie wygasłych ról');
    return true;
  }
  logger.warn('⚠️ Nie można zatrzymać checker - nie był uruchomiony');
  return false;
}

// Funkcja do sprawdzenia statusu
function getExpiredRoleCheckerStatus() {
  return {
    isRunning: globalExpiredRoleCheckerInterval !== null,
    intervalId: globalExpiredRoleCheckerInterval
  };
}

module.exports = { 
  checkExpiredRoles, 
  startExpiredRoleChecker, 
  stopExpiredRoleChecker,
  getExpiredRoleCheckerStatus
};