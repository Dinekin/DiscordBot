// src/utils/tempRoleTracker.js - nowy plik diagnostyczny
const logger = require('./logger');

// Mapa chronionych ról (z checkExpiredRoles.js)
const protectedRoles = new Map();

// Funkcja do ochrony roli
function protectRole(guildId, userId, roleId, reason = 'Nieznany', duration = 120000) {
  const key = `${guildId}-${userId}-${roleId}`;
  const protection = {
    guildId,
    userId,
    roleId,
    reason,
    protectedAt: new Date(),
    protectedUntil: new Date(Date.now() + duration)
  };
  
  protectedRoles.set(key, protection);
  
  // Usuń ochronę po czasie
  setTimeout(() => {
    protectedRoles.delete(key);
    logger.info(`🛡️ Zakończono ochronę roli ${roleId} dla użytkownika ${userId} (powód: ${reason})`);
  }, duration);
  
  logger.warn(`🛡️ CHRONIĘ ROLĘ ${roleId} dla użytkownika ${userId} przez ${duration/1000}s (powód: ${reason})`);
  
  return protection;
}

// Funkcja do sprawdzania czy rola jest chroniona
function isRoleProtected(guildId, userId, roleId) {
  const key = `${guildId}-${userId}-${roleId}`;
  const protection = protectedRoles.get(key);
  
  if (protection && protection.protectedUntil > new Date()) {
    logger.error(`🚫 BLOKADA: Próba dodania chronionej roli ${roleId} dla użytkownika ${userId} (powód ochrony: ${protection.reason})`);
    return true;
  }
  
  return false;
}

// Funkcja do logowania próby dodania roli czasowej
function logTempRoleCreation(guildId, userId, roleId, source, stackTrace) {
  logger.error(`🚨 WYKRYTO DODAWANIE ROLI CZASOWEJ:`);
  logger.error(`   Serwer: ${guildId}`);
  logger.error(`   Użytkownik: ${userId}`);
  logger.error(`   Rola: ${roleId}`);
  logger.error(`   Źródło: ${source}`);
  logger.error(`   Stack trace: ${stackTrace}`);
  
  // Sprawdź czy rola jest chroniona
  if (isRoleProtected(guildId, userId, roleId)) {
    logger.error(`🚫 BLOKOWANIE DODANIA CHRONIONEJ ROLI!`);
    return false; // Blokuj
  }
  
  return true; // Pozwól
}

// Funkcja do monitorowania wszystkich operacji na TempRole
function monitorTempRoleOperations() {
  const TempRole = require('../models/TempRole');
  
  // Przechwytujemy wszystkie operacje create
  const originalCreate = TempRole.create;
  TempRole.create = async function(...args) {
    const data = args[0];
    const stack = new Error().stack;
    
    logger.error(`🚨 TempRole.create wywołane dla roli ${data.roleId} użytkownika ${data.userId}`);
    logger.error(`🚨 Stack: ${stack}`);
    
    // Sprawdź czy rola jest chroniona
    if (isRoleProtected(data.guildId, data.userId, data.roleId)) {
      logger.error(`🚫 BLOKOWANIE TempRole.create dla chronionej roli!`);
      throw new Error(`Rola ${data.roleId} jest chroniona przed dodaniem jako czasowa`);
    }
    
    return originalCreate.apply(this, args);
  };
  
  // Przechwytujemy findOneAndUpdate
  const originalFindOneAndUpdate = TempRole.findOneAndUpdate;
  TempRole.findOneAndUpdate = async function(...args) {
    const filter = args[0];
    const update = args[1];
    const stack = new Error().stack;
    
    logger.warn(`🔍 TempRole.findOneAndUpdate wywołane:`);
    logger.warn(`🔍 Filter: ${JSON.stringify(filter)}`);
    logger.warn(`🔍 Update: ${JSON.stringify(update)}`);
    logger.warn(`🔍 Stack: ${stack}`);
    
    return originalFindOneAndUpdate.apply(this, args);
  };
  
  logger.info(`🔍 Rozpoczęto monitorowanie operacji TempRole`);
}

module.exports = {
  protectRole,
  isRoleProtected,
  logTempRoleCreation,
  monitorTempRoleOperations
};