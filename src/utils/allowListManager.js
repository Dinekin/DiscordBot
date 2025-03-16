// src/utils/guildAllowlistManager.js
// Zarządzanie listą dozwolonych serwerów

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class GuildAllowlistManager {
  constructor() {
    this.allowlistPath = path.join(__dirname, '../../config/allowed-guilds.json');
    this.allowedGuilds = this.loadAllowlist();
    this.verificationMode = process.env.INVITE_VERIFICATION_MODE || 'STRICT';
  }

  // Ładuje listę dozwolonych serwerów
  loadAllowlist() {
    try {
      // Priorytet 1: Plik konfiguracyjny
      if (fs.existsSync(this.allowlistPath)) {
        const data = fs.readFileSync(this.allowlistPath, 'utf8');
        const allowedGuilds = JSON.parse(data);
        logger.info(`Załadowano ${allowedGuilds.length} serwerów z pliku konfiguracyjnego`);
        return allowedGuilds;
      }
      
      // Priorytet 2: Zmienne środowiskowe
      if (process.env.ALLOWED_GUILD_IDS) {
        const envGuildIds = process.env.ALLOWED_GUILD_IDS.split(',').map(id => id.trim());
        logger.info(`Załadowano ${envGuildIds.length} serwerów ze zmiennych środowiskowych`);
        return envGuildIds;
      }
      
      // Brak zdefiniowanych serwerów
      logger.warn('Nie znaleziono listy dozwolonych serwerów. Bot będzie działał na wszystkich serwerach.');
      return [];
    } catch (error) {
      logger.error(`Błąd podczas ładowania listy dozwolonych serwerów: ${error.message}`);
      return [];
    }
  }

  // Sprawdza czy serwer jest na liście dozwolonych
  isGuildAllowed(guildId) {
    // Jeśli lista jest pusta, wszystkie serwery są dozwolone
    if (this.allowedGuilds.length === 0) {
      return true;
    }
    
    return this.allowedGuilds.includes(guildId);
  }

  // Dodaje serwer do listy dozwolonych
  async addGuild(guildId, guildName = 'Nieznana nazwa') {
    if (this.isGuildAllowed(guildId)) {
      return { success: false, message: 'Serwer jest już na liście dozwolonych' };
    }
    
    try {
      this.allowedGuilds.push(guildId);
      
      // Jeśli katalog config nie istnieje, utwórz go
      const configDir = path.dirname(this.allowlistPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      // Zapisz zaktualizowaną listę
      fs.writeFileSync(this.allowlistPath, JSON.stringify(this.allowedGuilds, null, 2));
      logger.info(`Dodano serwer ${guildName} (${guildId}) do listy dozwolonych`);
      
      return { success: true, message: `Dodano serwer ${guildName} (${guildId}) do listy dozwolonych` };
    } catch (error) {
      logger.error(`Błąd podczas dodawania serwera do listy dozwolonych: ${error.message}`);
      return { success: false, message: `Błąd: ${error.message}` };
    }
  }

  // Usuwa serwer z listy dozwolonych
  async removeGuild(guildId) {
    if (!this.isGuildAllowed(guildId)) {
      return { success: false, message: 'Serwer nie jest na liście dozwolonych' };
    }
    
    try {
      // Filtruj listę, aby usunąć serwer
      this.allowedGuilds = this.allowedGuilds.filter(id => id !== guildId);
      
      // Zapisz zaktualizowaną listę
      fs.writeFileSync(this.allowlistPath, JSON.stringify(this.allowedGuilds, null, 2));
      logger.info(`Usunięto serwer ${guildId} z listy dozwolonych`);
      
      return { success: true, message: `Usunięto serwer ${guildId} z listy dozwolonych` };
    } catch (error) {
      logger.error(`Błąd podczas usuwania serwera z listy dozwolonych: ${error.message}`);
      return { success: false, message: `Błąd: ${error.message}` };
    }
  }

  // Zwraca listę dozwolonych serwerów
  getallowedGuilds() {
    return [...this.allowedGuilds];
  }

  // Zwraca tryb weryfikacji
  getVerificationMode() {
    return this.verificationMode;
  }

  // Ustawia tryb weryfikacji
  setVerificationMode(mode) {
    const validModes = ['STRICT', 'WARN', 'OFF'];
    if (!validModes.includes(mode)) {
      logger.error(`Nieprawidłowy tryb weryfikacji: ${mode}. Dozwolone wartości: ${validModes.join(', ')}`);
      return false;
    }
    
    this.verificationMode = mode;
    logger.info(`Ustawiono tryb weryfikacji na: ${mode}`);
    return true;
  }
}

// Eksportuj singleton
module.exports = new GuildAllowlistManager();