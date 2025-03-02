// Skrypt do weryfikacji poprawności importów
require('dotenv').config();
const mongoose = require('mongoose');

async function verifyImports() {
  console.log('Weryfikacja poprawności importów...');
  
  try {
    // Próba importu modeli
    const Guild = require('./src/models/Guild');
    console.log('✓ Model Guild zaimportowany poprawnie');
    
    const ReactionRole = require('./src/models/ReactionRole');
    console.log('✓ Model ReactionRole zaimportowany poprawnie');
    
    const MessageLog = require('./src/models/MessageLog');
    console.log('✓ Model MessageLog zaimportowany poprawnie');
    
    // Próba importu eventów
    const messageCreate = require('./src/events/messageCreate');
    console.log('✓ Event messageCreate zaimportowany poprawnie');
    
    const messageUpdate = require('./src/events/messageUpdate');
    console.log('✓ Event messageUpdate zaimportowany poprawnie');
    
    const messageDelete = require('./src/events/messageDelete');
    console.log('✓ Event messageDelete zaimportowany poprawnie');
    
    const interactionCreate = require('./src/events/interactionCreate');
    console.log('✓ Event interactionCreate zaimportowany poprawnie');
    
    // Próba importu komend
    const messagelogCommand = require('./src/commands/messagelog');
    console.log('✓ Komenda messagelog zaimportowana poprawnie');
    
    console.log('\nWszystkie importy działają poprawnie.');
  } catch (error) {
    console.error(`\nBłąd importu: ${error.message}`);
    console.error(`Ścieżka: ${error.stack.split('\n')[1].trim()}`);
  }
}

verifyImports()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));