// src/models/LiveFeed.js
const mongoose = require('mongoose');

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
    function findNext(current, allowed, max, rollover = false) {
      // Znajdź pierwszą wartość większą od current
      const next = allowed.find(v => v > current);
      if (next !== undefined) return next;
      
      // Jeśli nie znaleziono, zwróć pierwszą wartość z tablicy (przejdź do następnego cyklu)
      return rollover && allowed.length > 0 ? allowed[0] : null;
    }
    
    // Najpierw sprawdź, czy obecna minuta jest dozwolona
    let currentMinute = now.getMinutes();
    let currentHour = now.getHours();
    let currentDay = now.getDate();
    let currentMonth = now.getMonth() + 1; // +1 bo JS ma miesiące 0-11
    
    // Znajdź następną dozwoloną minutę
    let nextMinute = findNext(currentMinute, allowedMinutes, 59, true);
    
    // Jeśli nie znaleziono następnej minuty w bieżącej godzinie
    if (nextMinute === null || nextMinute <= currentMinute) {
      // Przejdź do następnej godziny
      nextMinute = allowedMinutes[0] || 0;
      currentHour++;
    }
    
    // Znajdź następną dozwoloną godzinę
    let nextHour = currentHour;
    if (currentHour >= 24 || !allowedHours.includes(currentHour)) {
      nextHour = findNext(currentHour % 24, allowedHours, 23, true);
      if (nextHour === null || nextHour <= currentHour % 24) {
        // Przejdź do następnego dnia
        nextHour = allowedHours[0] || 0;
        currentDay++;
      }
    }
    
    // Ustaw obliczone wartości
    nextRun.setMinutes(nextMinute);
    nextRun.setHours(nextHour);
    
    // Sprawdź czy dzień/miesiąc/dzień tygodnia też są zgodne z harmonogramem
    // (Dla uproszczenia pomijamy pełną weryfikację dni/miesięcy)
    
    // Jeśli obliczony czas jest w przeszłości, dodaj jeden dzień
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
    
    // Zapisz obliczony następny czas uruchomienia
    this.nextRun = nextRun;
    
    // Dodaj log debugowania
    console.log(`Obliczono następny czas uruchomienia dla "${this.name}": ${nextRun.toISOString()}`);
    console.log(`Harmonogram: ${this.schedule.minute} ${this.schedule.hour} ${this.schedule.dayOfMonth} ${this.schedule.month} ${this.schedule.dayOfWeek}`);
    
    return this.nextRun;
  };
  
// Metoda do sprawdzania, czy feed powinien zostać uruchomiony
LiveFeedSchema.methods.shouldRun = function(currentTime) {
  // Sprawdza czy bieżący czas pasuje do harmonogramu
  const date = currentTime || new Date();
  
  // Sprawdź minutę
  if (this.schedule.minute !== '*') {
    const minutes = this.schedule.minute.split(',').map(m => parseInt(m.trim()));
    if (!minutes.includes(date.getMinutes())) return false;
  }
  
  // Sprawdź godzinę
  if (this.schedule.hour !== '*') {
    const hours = this.schedule.hour.split(',').map(h => parseInt(h.trim()));
    if (!hours.includes(date.getHours())) return false;
  }
  
  // Sprawdź dzień miesiąca
  if (this.schedule.dayOfMonth !== '*') {
    const days = this.schedule.dayOfMonth.split(',').map(d => parseInt(d.trim()));
    if (!days.includes(date.getDate())) return false;
  }
  
  // Sprawdź miesiąc (JavaScript używa miesięcy 0-11, więc dodajemy 1)
  if (this.schedule.month !== '*') {
    const months = this.schedule.month.split(',').map(m => parseInt(m.trim()));
    if (!months.includes(date.getMonth() + 1)) return false;
  }
  
  // Sprawdź dzień tygodnia
  if (this.schedule.dayOfWeek !== '*') {
    const daysOfWeek = this.schedule.dayOfWeek.split(',').map(d => parseInt(d.trim()));
    if (!daysOfWeek.includes(date.getDay())) return false;
  }
  
  return true;
};

module.exports = mongoose.model('LiveFeed', LiveFeedSchema);