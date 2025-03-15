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
  // Implementacja obliczania następnego czasu uruchomienia na podstawie harmonogramu
  const now = new Date();
  
  // Prosty przypadek dla początkowej implementacji - dodajemy jedną minutę
  this.nextRun = new Date(now.getTime() + 60000);
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