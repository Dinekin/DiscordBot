// Skrypt do sprawdzenia i rejestracji wszystkich plików zdarzeń
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const logger = require('./src/utils/logger');

const eventsPath = path.join(__dirname, 'src', 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

console.log('Znaleziono następujące pliki zdarzeń:');
eventFiles.forEach(file => {
  console.log(`- ${file}`);
  
  try {
    const event = require(path.join(eventsPath, file));
    console.log(`  Event name: ${event.name}`);
  } catch (error) {
    console.error(`  BŁĄD podczas ładowania: ${error.message}`);
  }
});

console.log('\nAby zarejestrować te zdarzenia, zrestartuj bota lub uruchom "npm start"');