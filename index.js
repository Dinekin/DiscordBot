// Główny plik uruchamiający bota i serwer web
require('dotenv').config();
const { startBot } = require('./src/bot');
const { startWebServer } = require('./src/web/server');

// Uruchomienie bota Discord
startBot();

// Uruchomienie serwera web dla panelu administracyjnego
startWebServer();

// Obsługa zamknięcia
process.on('SIGINT', () => {
  console.log('Zamykanie aplikacji...');
  process.exit(0);
});
