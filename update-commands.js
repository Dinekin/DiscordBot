// Skrypt do aktualizacji komend Slash
require('dotenv').config();
const { deployCommands } = require('./src/deploy-commands');

console.log('Rozpoczynam aktualizację komend slash...');

deployCommands()
  .then(() => {
    console.log('Komendy zostały zaktualizowane pomyślnie!');
    console.log('Może być konieczne odczekanie kilku minut, aż Discord je zaktualizuje.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Wystąpił błąd podczas aktualizacji komend:', error);
    process.exit(1);
  });
