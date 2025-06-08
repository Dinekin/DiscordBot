// src/models/TempRoleReplace.js - z systemem ochrony
const mongoose = require('mongoose');
const logger = require('../utils/logger');

const TempRoleReplaceSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  tempRoleId: {
    type: String,
    required: true,
    index: true
  },
  finalRoleId: {
    type: String,
    required: true,
    index: true
  },
  addedAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  addedBy: {
    type: String,
    required: true
  },
  reason: {
    type: String,
    default: 'Nie podano powodu'
  },
  removeTempRole: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

// Złożony indeks dla szybszego wyszukiwania
TempRoleReplaceSchema.index({ guildId: 1, userId: 1, tempRoleId: 1 }, { unique: true });

// Indeks do znajdowania wygasłych ról
TempRoleReplaceSchema.index({ expiresAt: 1 });

// Middleware do sprawdzania przed zapisem
TempRoleReplaceSchema.pre('save', async function(next) {
  try {
    const { isRoleProtected } = require('../utils/tempRoleTracker');
    
    // Sprawdź czy rola czasowa jest chroniona
    if (isRoleProtected(this.guildId, this.userId, this.tempRoleId)) {
      const error = new Error(`🚫 BLOKADA TempRoleReplace: Rola czasowa ${this.tempRoleId} jest chroniona dla użytkownika ${this.userId}`);
      logger.error(`🚨 MIDDLEWARE BLOKADA TempRoleReplace: ${error.message}`);
      return next(error);
    }
    
    // Sprawdź czy rola końcowa jest chroniona (nie powinna być używana jako rola czasowa)
    if (isRoleProtected(this.guildId, this.userId, this.finalRoleId)) {
      const error = new Error(`🚫 BLOKADA TempRoleReplace: Rola końcowa ${this.finalRoleId} jest chroniona dla użytkownika ${this.userId}`);
      logger.error(`🚨 MIDDLEWARE BLOKADA TempRoleReplace (rola końcowa): ${error.message}`);
      return next(error);
    }
    
    // Log dla debugowania
    logger.info(`📝 TempRoleReplace.pre('save'): ${this.tempRoleId} → ${this.finalRoleId} dla użytkownika ${this.userId}`);
    
    next();
  } catch (error) {
    logger.error(`❌ Błąd w middleware pre-save TempRoleReplace: ${error.message}`);
    next(error);
  }
});

// Hook post-save do debugowania
TempRoleReplaceSchema.post('save', function(doc, next) {
  logger.info(`📋 TempRoleReplace zapisana: ${doc.tempRoleId} → ${doc.finalRoleId} dla użytkownika ${doc.userId} (ID: ${doc._id})`);
  next();
});

// Hook post-remove do debugowania
TempRoleReplaceSchema.post('deleteOne', function(result) {
  logger.info(`🗑️ TempRoleReplace usunięta: ${JSON.stringify(result)}`);
});

module.exports = mongoose.model('TempRoleReplace', TempRoleReplaceSchema);