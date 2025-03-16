// src/events/guildCreate.js
// Event handler for when the bot is added to a new guild (server)

const logger = require('../utils/logger');
const guildAllowlistManager = require('../utils/guildAllowlistManager');

module.exports = {
  name: 'guildCreate',
  once: false,
  async execute(guild, client) {
    logger.info(`Bot został dodany do serwera: ${guild.name} (${guild.id})`);
    
    // Pobierz tryb weryfikacji
    const verificationMode = guildAllowlistManager.getVerificationMode();
    
    // Jeśli weryfikacja jest wyłączona, akceptuj wszystkie serwery
    if (verificationMode === 'OFF') {
      logger.info(`Weryfikacja zaproszeń wyłączona. Bot dołączył do serwera ${guild.name} (${guild.id})`);
      return;
    }
    
    // Sprawdź czy serwer jest na liście dozwolonych
    if (!guildAllowlistManager.isGuildAllowed(guild.id)) {
      // Tryb WARN tylko loguje
      if (verificationMode === 'WARN') {
        logger.warn(`Bot dołączył do nieautoryzowanego serwera: ${guild.name} (${guild.id}), ale pozostaje ze względu na tryb WARN`);
        return;
      }
      
      // Tryb STRICT - opuść serwer
      logger.warn(`Bot opuszcza niedozwolony serwer: ${guild.name} (${guild.id})`);
      
      try {
        // Przygotuj treść wiadomości
        const ownerMessage = process.env.BOT_OWNER_CONTACT 
          ? `\nSkontaktuj się z właścicielem bota: ${process.env.BOT_OWNER_CONTACT}`
          : '';
        
        // Wyślij wiadomość do kanału ogólnego przed opuszczeniem
        const defaultChannel = guild.channels.cache.find(
          channel => 
            channel.type === 0 && // Kanał tekstowy
            channel.permissionsFor(guild.members.me).has('SendMessages')
        );
        
        if (defaultChannel) {
          await defaultChannel.send({
            content: `**UWAGA**: Ten bot jest prywatny i może być używany tylko na autoryzowanych serwerach. Bot opuszcza ten serwer.${ownerMessage}`
          });
        }
        
        // Wyślij prywatną wiadomość do właściciela serwera, jeśli to możliwe
        try {
          const owner = await guild.fetchOwner();
          await owner.send({
            content: `Przepraszam, ale mój bot został skonfigurowany tak, aby działał tylko na wybranych serwerach. Bot właśnie opuścił twój serwer "${guild.name}".${ownerMessage}`
          });
        } catch (dmError) {
          logger.warn(`Nie można wysłać wiadomości do właściciela serwera: ${dmError.message}`);
        }
        
        // Opuść serwer
        await guild.leave();
        logger.info(`Bot opuścił niedozwolony serwer: ${guild.name} (${guild.id})`);
      } catch (error) {
        logger.error(`Błąd podczas opuszczania niedozwolonego serwera: ${error.stack}`);
      }
    } else {
      logger.info(`Serwer ${guild.name} (${guild.id}) jest autoryzowany.`);
    }
  }
};