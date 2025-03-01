const mongoose = require('mongoose');
const logger = require('./logger');

// Funkcja do połączenia z bazą danych MongoDB
async function connectToDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    logger.info('Połączono z bazą danych MongoDB');
  } catch (error) {
    logger.error('Błąd podczas łączenia z bazą danych:', error);
    process.exit(1);
  }
}

module.exports = { connectToDatabase };
