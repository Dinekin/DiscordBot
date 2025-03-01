const winston = require('winston');
const path = require('path');

// Konfiguracja logów
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.printf(info => `[${info.timestamp}] [${info.level.toUpperCase()}] ${info.message}`)
  ),
  transports: [
    // Zapisuj wszystkie logi do pliku
    new winston.transports.File({ 
      filename: path.join('logs', 'error.log'), 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: path.join('logs', 'combined.log') 
    })
  ]
});

// Jeśli nie w produkcji, wyświetlaj logi w konsoli
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(info => `[${info.timestamp}] [${info.level}] ${info.message}`)
    )
  }));
}

module.exports = logger;
