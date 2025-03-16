// src/utils/allowlistConfig.js
// Zarządzanie konfiguracją dozwolonych serwerów
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// Ścieżka do pliku konfiguracyjnego z listą dozwolonych serwerów
const CONFIG_PATH = path.join(__dirname, '../../config/allowed-guilds.json');

// Domyślne wartości
let cachedAllowedGuilds = null;
let cachedVerificationMode = null;

/**
 * Ładuje listę dozwolonych serwerów
 * @returns {string[]} Lista ID dozwolonych serwerów
 */
function getAllowedGuilds() {
  // Jeśli lista jest już w pamięci podręcznej, zwróć ją
  if (cachedAllowedGuilds !== null) {
    return cachedAllowedGuilds;
  }
  
  try {
    // Pierwszeństwo ma plik konfiguracyjny
    if (fs.existsSync(CONFIG_PATH)) {
      const fileData = fs.readFileSync(CONFIG_PATH, 'utf8');
      const guildIds = JSON.parse(fileData);
      
      if (Array.isArray(guildIds)) {
        logger.info(`Załadowano ${guildIds.length} serwerów z pliku konfiguracyjnego`);
        cachedAllowedGuilds = guildIds;
        return guildIds;
      }
    }
    
    // Jeśli nie ma pliku lub jest nieprawidłowy, sprawdź zmienne środowiskowe
    if (process.env.ALLOWED_GUILD_IDS) {
      const guildIds = process.env.ALLOWED_GUILD_IDS
        .split(',')
        .map(id => id.trim())
        .filter(id => id.length > 0);
      
      logger.info(`Załadowano ${guildIds.length} serwerów ze zmiennych środowiskowych`);
      cachedAllowedGuilds = guildIds;
      return guildIds;
    }
    
    // Jeśli nie ma ani pliku, ani zmiennych środowiskowych, zwróć pustą tablicę
    logger.warn('Nie znaleziono konfiguracji dozwolonych serwerów. Wszystkie serwery będą akceptowane.');
    cachedAllowedGuilds = [];
    return [];
  } catch (error) {
    logger.error(`Błąd podczas ładowania dozwolonych serwerów: ${error.message}`);
    cachedAllowedGuilds = [];
    return [];
  }
}

/**
 * Zapisuje listę dozwolonych serwerów do pliku konfiguracyjnego
 * @param {string[]} guildIds Lista ID serwerów do zapisania
 * @returns {boolean} Czy operacja się powiodła
 */
function saveAllowedGuilds(guildIds) {
  if (!Array.isArray(guildIds)) {
    logger.error('saveAllowedGuilds: Nieprawidłowy format danych. Oczekiwano tablicy.');
    return false;
  }
  
  try {
    // Utwórz katalog config, jeśli nie istnieje
    const configDir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    // Zapisz do pliku
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(guildIds, null, 2));
    
    // Zaktualizuj pamięć podręczną
    cachedAllowedGuilds = [...guildIds];
    
    logger.info(`Zapisano ${guildIds.length} serwerów do pliku konfiguracyjnego`);
    return true;
  } catch (error) {
    logger.error(`Błąd podczas zapisywania dozwolonych serwerów: ${error.message}`);
    return false;
  }
}

/**
 * Dodaje serwer do listy dozwolonych
 * @param {string} guildId ID serwera do dodania
 * @returns {Object} Rezultat operacji
 */
function addAllowedGuild(guildId) {
  if (!guildId || typeof guildId !== 'string') {
    return { success: false, message: 'Nieprawidłowe ID serwera' };
  }
  
  // Pobierz aktualną listę
  const currentGuilds = getAllowedGuilds();
  
  // Sprawdź, czy serwer już jest na liście
  if (currentGuilds.includes(guildId)) {
    return { success: false, message: 'Serwer jest już na liście dozwolonych' };
  }
  
  // Dodaj serwer do listy
  const newGuilds = [...currentGuilds, guildId];
  
  // Zapisz zaktualizowaną listę
  if (saveAllowedGuilds(newGuilds)) {
    return { 
      success: true, 
      message: `Dodano serwer ${guildId} do listy dozwolonych`,
      allowedGuilds: newGuilds
    };
  } else {
    return { success: false, message: 'Nie udało się zapisać zaktualizowanej listy' };
  }
}

/**
 * Usuwa serwer z listy dozwolonych
 * @param {string} guildId ID serwera do usunięcia
 * @returns {Object} Rezultat operacji
 */
function removeAllowedGuild(guildId) {
  if (!guildId || typeof guildId !== 'string') {
    return { success: false, message: 'Nieprawidłowe ID serwera' };
  }
  
  // Pobierz aktualną listę
  const currentGuilds = getAllowedGuilds();
  
  // Sprawdź, czy serwer jest na liście
  if (!currentGuilds.includes(guildId)) {
    return { success: false, message: 'Serwer nie jest na liście dozwolonych' };
  }
  
  // Usuń serwer z listy
  const newGuilds = currentGuilds.filter(id => id !== guildId);
  
  // Zapisz zaktualizowaną listę
  if (saveAllowedGuilds(newGuilds)) {
    return { 
      success: true, 
      message: `Usunięto serwer ${guildId} z listy dozwolonych`,
      allowedGuilds: newGuilds
    };
  } else {
    return { success: false, message: 'Nie udało się zapisać zaktualizowanej listy' };
  }
}

/**
 * Sprawdza, czy serwer jest na liście dozwolonych
 * @param {string} guildId ID serwera do sprawdzenia
 * @returns {boolean} Czy serwer jest dozwolony
 */
function isGuildAllowed(guildId) {
  const allowedGuilds = getAllowedGuilds();
  
  // Jeśli lista jest pusta, wszystkie serwery są dozwolone
  if (allowedGuilds.length === 0) {
    return true;
  }
  
  return allowedGuilds.includes(guildId);
}

/**
 * Pobiera tryb weryfikacji
 * @returns {string} Tryb weryfikacji (STRICT, WARN lub OFF)
 */
function getVerificationMode() {
  // Jeśli tryb jest już w pamięci podręcznej, zwróć go
  if (cachedVerificationMode !== null) {
    return cachedVerificationMode;
  }
  
  // Pobierz tryb ze zmiennych środowiskowych lub ustaw domyślny
  const mode = process.env.INVITE_VERIFICATION_MODE || 'STRICT';
  
  // Walidacja trybu
  const validModes = ['STRICT', 'WARN', 'OFF'];
  if (!validModes.includes(mode)) {
    logger.warn(`Nieprawidłowy tryb weryfikacji: ${mode}. Użyto domyślnego: STRICT`);
    cachedVerificationMode = 'STRICT';
    return 'STRICT';
  }
  
  cachedVerificationMode = mode;
  return mode;
}

/**
 * Ustawia tryb weryfikacji
 * @param {string} mode Tryb weryfikacji (STRICT, WARN lub OFF)
 * @returns {boolean} Czy operacja się powiodła
 */
function setVerificationMode(mode) {
  const validModes = ['STRICT', 'WARN', 'OFF'];
  
  if (!validModes.includes(mode)) {
    logger.error(`Nieprawidłowy tryb weryfikacji: ${mode}. Dozwolone wartości: ${validModes.join(', ')}`);
    return false;
  }
  
  // Zmiana trybu działa tylko w pamięci (nie w .env, bo nie możemy jej zmodyfikować)
  cachedVerificationMode = mode;
  logger.info(`Ustawiono tryb weryfikacji na: ${mode}`);
  return true;
}

module.exports = {
  getAllowedGuilds,
  addAllowedGuild,
  removeAllowedGuild,
  isGuildAllowed,
  getVerificationMode,
  setVerificationMode
};