const mongoose = require('mongoose');
const UserRole = require('../models/UserRole');
const Guild = require('../models/Guild');
const logger = require('./logger');

async function cleanupExpiredRoles() {
  try {
    logger.info('Rozpoczęcie czyszczenia nieaktualnych zapisanych ról');
    
    // Pobierz wszystkie serwery, które mają ustawiony czas wygaśnięcia
    const guilds = await Guild.find({ roleExpiryDays: { $gt: 0 } });
    
    let totalRemoved = 0;
    
    for (const guild of guilds) {
      // Oblicz datę graniczną dla każdego serwera
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() - guild.roleExpiryDays);
      
      // Usuń role użytkowników, które są starsze niż data graniczna
      const result = await UserRole.deleteMany({
        guildId: guild.guildId,
        leftAt: { $lt: expirationDate }
      });
      
      logger.info(`Usunięto ${result.deletedCount} nieaktualnych zapisów ról dla serwera ${guild.guildId} (próg: ${guild.roleExpiryDays} dni)`);
      totalRemoved += result.deletedCount;
    }
    
    logger.info(`Zakończono czyszczenie nieaktualnych zapisanych ról. Łącznie usunięto ${totalRemoved} zapisów.`);
    return totalRemoved;
  } catch (error) {
    logger.error(`Błąd podczas czyszczenia nieaktualnych ról: ${error.stack}`);
    throw error;
  }
}

// Eksportuj funkcję do użycia w skryptach
module.exports = { cleanupExpiredRoles };

// Jeśli skrypt jest uruchamiany bezpośrednio, wykonaj czyszczenie
if (require.main === module) {
  require('dotenv').config();
  
  // Połącz z bazą danych
  mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => {
    logger.info('Połączono z bazą danych MongoDB');
    return cleanupExpiredRoles();
  })
  .then((count) => {
    logger.info(`Usunięto ${count} nieaktualnych zapisów ról`);
    process.exit(0);
  })
  .catch(err => {
    logger.error(`Błąd: ${err.stack}`);
    process.exit(1);
  });
}