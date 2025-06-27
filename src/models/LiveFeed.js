// src/models/LiveFeed.js
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const cronParser = require('cron-parser');

// Definiujemy zmienną LiveFeedSchema w kontekście globalnym dla pliku
const LiveFeedSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    index: true
  },
  channelId: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  category: {
    type: String,
    default: 'Inne'
  },
  message: {
    type: String,
    required: true
  },
  // Harmonogram według CRON
  schedule: {
    minute: {
      type: String,
      default: '*' // każda minuta (0-59, * dla wszystkich)
    },
    hour: {
      type: String,
      default: '*' // każda godzina (0-23, * dla wszystkich)
    },
    dayOfMonth: {
      type: String,
      default: '*' // dzień miesiąca (1-31, * dla wszystkich)
    },
    month: {
      type: String,
      default: '*' // miesiąc (1-12, * dla wszystkich)
    },
    dayOfWeek: {
      type: String,
      default: '*' // dzień tygodnia (0-6, niedziela to 0, * dla wszystkich)
    }
  },
  // Dodatkowe właściwości
  embed: {
    type: Boolean,
    default: false
  },
  embedColor: {
    type: String,
    default: '#3498db'
  },
  createdBy: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastRun: {
    type: Date
  },
  nextRun: {
    type: Date
  }
}, { timestamps: true });

// Metoda do generowania następnego czasu uruchomienia
LiveFeedSchema.methods.calculateNextRun = function() {
    // Zbuduj wyrażenie CRON z harmonogramu feeda
    const cronExp = `${this.schedule.minute || '*'} ${this.schedule.hour || '*'} ${this.schedule.dayOfMonth || '*'} ${this.schedule.month || '*'} ${this.schedule.dayOfWeek || '*'}`;
    try {
        const options = { currentDate: new Date(), tz: 'Europe/Warsaw' };
        const interval = cronParser.parseExpression(cronExp, options);
        this.nextRun = interval.next().toDate();
        logger.info(`Obliczono następny czas uruchomienia dla "${this.name}": ${this.nextRun.toISOString()}`);
        logger.debug(`Harmonogram (CRON): ${cronExp}`);
        return this.nextRun;
    } catch (err) {
        logger.error(`Błąd CRON przy obliczaniu nextRun dla "${this.name}": ${err.message}`);
        this.nextRun = null;
        return null;
    }
};

// Metoda do sprawdzania, czy feed powinien zostać uruchomiony
LiveFeedSchema.methods.shouldRun = function(currentTime) {
  // Sprawdza czy bieżący czas pasuje do harmonogramu
  const date = currentTime || new Date();
  
  // Funkcja do sprawdzania czy wartość pasuje do wzorca CRON
  function matchesCronPattern(value, pattern) {
    if (pattern === '*') return true;
    
    // Obsługa wielu wartości oddzielonych przecinkiem
    if (pattern.includes(',')) {
      const values = pattern.split(',').map(v => parseInt(v.trim()));
      return values.includes(value);
    }
    
    // Dopasowanie pojedynczej wartości
    return parseInt(pattern) === value;
  }
  
  // Sprawdź minutę
  if (!matchesCronPattern(date.getMinutes(), this.schedule.minute)) return false;
  
  // Sprawdź godzinę
  if (!matchesCronPattern(date.getHours(), this.schedule.hour)) return false;
  
  // Sprawdź dzień miesiąca
  if (!matchesCronPattern(date.getDate(), this.schedule.dayOfMonth)) return false;
  
  // Sprawdź miesiąc (JavaScript używa miesięcy 0-11, więc dodajemy 1)
  if (!matchesCronPattern(date.getMonth() + 1, this.schedule.month)) return false;
  
  // Sprawdź dzień tygodnia
  if (!matchesCronPattern(date.getDay(), this.schedule.dayOfWeek)) return false;
  
  return true;
};

// Na końcu pliku eksportujemy model
module.exports = mongoose.model('LiveFeed', LiveFeedSchema);