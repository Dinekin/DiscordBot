// src/utils/initAllowlist.js
// Inicjalizacja systemu listy dozwolonych serwerów
const logger = require('./logger');
const { getAllowedGuilds, getVerificationMode } = require('./allowlistConfig');

/**
 * Inicjalizuje system listy dozwolonych serwerów
 * @param {Client} client Klient Discord.js
 */
function initAllowlist(client) {
  // Pobierz konfigurację
  const allowedGuilds = getAllowedGuilds();
  const verificationMode = getVerificationMode();
  
  // Logowanie konfiguracji
  logger.info(`Inicjalizacja systemu listy dozwolonych serwerów...`);
  logger.info(`Tryb weryfikacji: ${verificationMode}`);
  
  if (allowedGuilds.length > 0) {
    logger.info(`Znaleziono ${allowedGuilds.length} serwerów na liście dozwolonych.`);
  } else {
    logger.warn(`Lista dozwolonych serwerów jest pusta. Wszystkie serwery będą akceptowane.`);
  }
  
  // Sprawdź, czy bot jest już na nieautoryzowanych serwerach
  if (verificationMode === 'STRICT' && allowedGuilds.length > 0) {
    checkExistingGuilds(client, allowedGuilds);
  }
  
  return {
    allowedGuilds,
    verificationMode
  };
}

/**
 * Sprawdza czy bot jest już na nieautoryzowanych serwerach
 * @param {Client} client Klient Discord.js
 * @param {string[]} allowedGuilds Lista ID dozwolonych serwerów
 */
async function checkExistingGuilds(client, allowedGuilds) {
  const currentGuilds = client.guilds.cache;
  const unauthorizedGuilds = [];
  
  // Znajdź wszystkie nieautoryzowane serwery
  currentGuilds.forEach(guild => {
    if (!allowedGuilds.includes(guild.id)) {
      unauthorizedGuilds.push(guild);
    }
  });
  
  // Jeśli znaleziono nieautoryzowane serwery, wyloguj informację
  if (unauthorizedGuilds.length > 0) {
    logger.warn(`Bot jest na ${unauthorizedGuilds.length} nieautoryzowanych serwerach:`);
    
    // Opuść nieautoryzowane serwery
    for (const guild of unauthorizedGuilds) {
      logger.warn(`Serwer nieautoryzowany: ${guild.name} (ID: ${guild.id})`);
      
      try {
        // Próba wysłania wiadomości o braku autoryzacji
        const defaultChannel = guild.channels.cache.find(
          channel => channel.type === 0 && 
                   channel.permissionsFor(guild.members.me).has('SendMessages')
        );
        
        // Przygotuj treść wiadomości
        const contactInfo = process.env.BOT_OWNER_CONTACT 
          ? `\n\nSkontaktuj się z właścicielem bota: ${process.env.BOT_OWNER_CONTACT}`
          : '';
          
        const message = `**UWAGA:** Ten bot jest prywatny i działa tylko na autoryzowanych serwerach. Bot zostanie usunięty z tego serwera.${contactInfo}`;
        
        // Wyślij wiadomość na kanał, jeśli znaleziono odpowiedni kanał
        if (defaultChannel) {
          await defaultChannel.send(message);
        }
        
        // Opuść serwer
        await guild.leave();
        logger.info(`Bot opuścił nieautoryzowany serwer: ${guild.name} (ID: ${guild.id})`);
      } catch (error) {
        logger.error(`Błąd podczas opuszczania nieautoryzowanego serwera ${guild.id}: ${error.message}`);
      }
    }
  } else {
    logger.info(`Bot jest tylko na autoryzowanych serwerach.`);
  }
}

module.exports = { initAllowlist };