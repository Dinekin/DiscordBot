// src/utils/checkExpiredRoles.js
const TempRole = require('../models/TempRole');
const logger = require('./logger');

async function checkExpiredRoles(client) {
  try {
    logger.info('Rozpoczęcie sprawdzania wygasłych ról czasowych');
    
    // Znajdź wszystkie wygasłe role czasowe
    const now = new Date();
    const expiredRoles = await TempRole.find({
      expiresAt: { $lte: now }
    });
    
    logger.info(`Znaleziono ${expiredRoles.length} wygasłych ról czasowych`);
    
    let removed = 0;
    let errors = 0;
    
    // Przetwórz każdą wygasłą rolę
    for (const tempRole of expiredRoles) {
      try {
        // Pobierz serwer
        const guild = client.guilds.cache.get(tempRole.guildId);
        if (!guild) {
          logger.warn(`Nie znaleziono serwera ${tempRole.guildId} dla wygasłej roli`);
          continue;
        }
        
        // Pobierz członka serwera
        const member = await guild.members.fetch(tempRole.userId).catch(() => null);
        if (!member) {
          logger.debug(`Użytkownik ${tempRole.userId} nie jest na serwerze ${guild.name}`);
          // Usuń z bazy danych pomimo braku użytkownika
          await TempRole.deleteOne({ _id: tempRole._id });
          removed++;
          continue;
        }
        
        // Pobierz rolę
        const role = guild.roles.cache.get(tempRole.roleId);
        if (!role) {
          logger.warn(`Nie znaleziono roli ${tempRole.roleId} na serwerze ${guild.name}`);
          // Usuń z bazy danych pomimo braku roli
          await TempRole.deleteOne({ _id: tempRole._id });
          removed++;
          continue;
        }
        
        // Sprawdź, czy użytkownik nadal ma tę rolę
        if (member.roles.cache.has(role.id)) {
          // Usuń rolę
          await member.roles.remove(role, 'Wygasła rola czasowa');
          logger.info(`Usunięto wygasłą rolę ${role.name} użytkownikowi ${member.user.tag} na serwerze ${guild.name}`);
        }
        
        // Usuń z bazy danych
        await TempRole.deleteOne({ _id: tempRole._id });
        removed++;
        
        // Opcjonalnie: wysyłanie powiadomienia do użytkownika
        try {
          await member.send({
            content: `Twoja rola **${role.name}** na serwerze **${guild.name}** wygasła i została usunięta.`
          }).catch(() => {}); // Ignoruj błędy, jeśli użytkownik ma wyłączone DM
        } catch (dmError) {
          // Ignoruj błędy związane z DM
        }
      } catch (roleError) {
        logger.error(`Błąd podczas usuwania wygasłej roli: ${roleError.message}`);
        errors++;
      }
    }
    
    logger.info(`Zakończono sprawdzanie wygasłych ról czasowych. Usunięto: ${removed}, błędów: ${errors}`);
    return { removed, errors };
  } catch (error) {
    logger.error(`Błąd podczas sprawdzania wygasłych ról czasowych: ${error.stack}`);
    throw error;
  }
}

module.exports = { checkExpiredRoles };