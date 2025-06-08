// src/models/TempRole.js - z systemem ochrony
const mongoose = require('mongoose');
const logger = require('../utils/logger');

const TempRoleSchema = new mongoose.Schema({
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
  roleId: {
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
  }
}, { timestamps: true });

// Złożony indeks dla szybszego wyszukiwania
TempRoleSchema.index({ guildId: 1, userId: 1, roleId: 1 }, { unique: true });

// Indeks do znajdowania wygasłych ról
TempRoleSchema.index({ expiresAt: 1 });

// Middleware do sprawdzania przed zapisem
TempRoleSchema.pre('save', async function(next) {
  try {
    // Sprawdź czy rola jest chroniona
    const { isRoleProtected } = require('../utils/tempRoleTracker');
    
    if (isRoleProtected(this.guildId, this.userId, this.roleId)) {
      const error = new Error(`🚫 BLOKADA: Rola ${this.roleId} jest chroniona przed dodaniem jako czasowa dla użytkownika ${this.userId}`);
      logger.error(`🚨 MIDDLEWARE BLOKADA: ${error.message}`);
      logger.error(`🚨 Stack trace: ${new Error().stack}`);
      return next(error);
    }
    
    // Log dla debugowania
    logger.warn(`📝 TempRole.pre('save'): Dodawanie roli ${this.roleId} jako czasowa dla użytkownika ${this.userId}`);
    logger.warn(`📝 Stack: ${new Error().stack.split('\n').slice(0, 5).join('\n')}`);
    
    next();
  } catch (error) {
    logger.error(`❌ Błąd w middleware pre-save TempRole: ${error.message}`);
    next(error);
  }
});

// Middleware przed tworzeniem dokumentu
TempRoleSchema.pre('insertMany', async function(next) {
  try {
    const { isRoleProtected } = require('../utils/tempRoleTracker');
    
    // Sprawdź każdy dokument
    for (const doc of this) {
      if (isRoleProtected(doc.guildId, doc.userId, doc.roleId)) {
        const error = new Error(`🚫 BLOKADA insertMany: Rola ${doc.roleId} jest chroniona dla użytkownika ${doc.userId}`);
        logger.error(`🚨 MIDDLEWARE BLOKADA insertMany: ${error.message}`);
        return next(error);
      }
      
      logger.warn(`📝 TempRole.pre('insertMany'): Dodawanie roli ${doc.roleId} dla użytkownika ${doc.userId}`);
    }
    
    next();
  } catch (error) {
    logger.error(`❌ Błąd w middleware pre-insertMany TempRole: ${error.message}`);
    next(error);
  }
});

// Statyczna metoda do bezpiecznego tworzenia
TempRoleSchema.statics.createSafe = async function(data) {
  try {
    const { isRoleProtected } = require('../utils/tempRoleTracker');
    
    if (isRoleProtected(data.guildId, data.userId, data.roleId)) {
      logger.error(`🚫 TempRole.createSafe BLOKADA: Rola ${data.roleId} jest chroniona dla użytkownika ${data.userId}`);
      throw new Error(`Rola ${data.roleId} jest chroniona przed dodaniem jako czasowa`);
    }
    
    logger.info(`✅ TempRole.createSafe: Tworzenie roli czasowej ${data.roleId} dla użytkownika ${data.userId}`);
    return this.create(data);
  } catch (error) {
    logger.error(`❌ TempRole.createSafe error: ${error.message}`);
    throw error;
  }
};

// Hook post-save do debugowania
TempRoleSchema.post('save', function(doc, next) {
  logger.warn(`📋 TempRole zapisana: ${doc.roleId} dla użytkownika ${doc.userId} (ID: ${doc._id})`);
  next();
});

// Hook post-remove do debugowania
TempRoleSchema.post('deleteOne', function(result) {
  logger.info(`🗑️ TempRole usunięta: ${JSON.stringify(result)}`);
});

module.exports = mongoose.model('TempRole', TempRoleSchema);