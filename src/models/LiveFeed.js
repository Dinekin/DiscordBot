// src/models/LiveFeed.js
const mongoose = require('mongoose');
const logger = require('../utils/logger');

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
    const now = new Date();
    let nextRun = new Date(now);
    
    // Resetuj sekundy i milisekundy
    nextRun.setSeconds(0);
    nextRun.setMilliseconds(0);
    
    // Przygotuj tablice dozwolonych wartości dla każdego elementu harmonogramu
    let allowedMinutes = this.schedule.minute === '*' 
      ? Array.from({length: 60}, (_, i) => i) 
      : this.schedule.minute.split(',').map(m => parseInt(m.trim()));
      
    let allowedHours = this.schedule.hour === '*'
      ? Array.from({length: 24}, (_, i) => i)
      : this.schedule.hour.split(',').map(h => parseInt(h.trim()));
      
    let allowedDays = this.schedule.dayOfMonth === '*'
      ? Array.from({length: 31}, (_, i) => i + 1)
      : this.schedule.dayOfMonth.split(',').map(d => parseInt(d.trim()));
      
    let allowedMonths = this.schedule.month === '*'
      ? Array.from({length: 12}, (_, i) => i + 1)
      : this.schedule.month.split(',').map(m => parseInt(m.trim()));
      
    let allowedDaysOfWeek = this.schedule.dayOfWeek === '*'
      ? Array.from({length: 7}, (_, i) => i)
      : this.schedule.dayOfWeek.split(',').map(d => parseInt(d.trim()));
    
    // Funkcja pomocnicza do znalezienia następnej dozwolonej wartości
    function findNext(current, allowed, max) {
      // Znajdź pierwszą wartość większą od current
      for (let i = 0; i < allowed.length; i++) {
        if (allowed[i] > current) {
          return allowed[i];
        }
      }
      // Jeśli nie znaleziono, zwróć pierwszą wartość z tablicy (przejdź do następnego cyklu)
      return allowed.length > 0 ? allowed[0] : null;
    }
    
    // Pobierz aktualne wartości czasu
    let currentMinute = now.getMinutes();
    let currentHour = now.getHours();
    let currentDay = now.getDate();
    let currentMonth = now.getMonth() + 1; // +1 bo JS ma miesiące 0-11
    let currentDayOfWeek = now.getDay(); // 0-6, gdzie 0 to niedziela
    
    // Znajdź następną dozwoloną minutę
    let nextMinute = findNext(currentMinute, allowedMinutes, 59);
    
    if (nextMinute === null || nextMinute <= currentMinute) {
      // Jeśli nie znaleziono następnej minuty w bieżącej godzinie (musimy przejść do następnej godziny)
      nextMinute = allowedMinutes[0];
      currentHour++;
      
      // Sprawdź czy ta godzina jest dozwolona
      if (currentHour >= 24 || !allowedHours.includes(currentHour % 24)) {
        // Znajdź następną dozwoloną godzinę
        let nextHour = findNext(currentHour % 24, allowedHours, 23);
        
        if (nextHour === null || nextHour < currentHour % 24) {
          // Jeśli nie znaleziono w obecnym dniu, przechodzimy do następnego dnia
          nextHour = allowedHours[0];
          nextRun.setDate(nextRun.getDate() + 1);
        }
        
        nextRun.setHours(nextHour);
        nextRun.setMinutes(allowedMinutes[0]);
      } else {
        // Ustaw na następną godzinę i pierwszą dozwoloną minutę
        nextRun.setHours(currentHour);
        nextRun.setMinutes(allowedMinutes[0]);
      }
    } else {
      // Ustaw minutę, a godzina zostaje ta sama
      nextRun.setMinutes(nextMinute);
    }
    
    // Dodatkowe sprawdzenie: jeśli obliczony czas jest w przeszłości, dodaj jeszcze minutę
    if (nextRun <= now) {
      nextRun = new Date(nextRun.getTime() + 60000); // +1 minuta
    }
    
    // Zapisz obliczony następny czas uruchomienia
    this.nextRun = nextRun;
    
    logger.info(`Obliczono następny czas uruchomienia dla "${this.name}": ${nextRun.toISOString()}`);
    logger.debug(`Harmonogram: ${this.schedule.minute} ${this.schedule.hour} ${this.schedule.dayOfMonth} ${this.schedule.month} ${this.schedule.dayOfWeek}`);
    
    return this.nextRun;
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