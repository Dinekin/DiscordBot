// src/models/TempRoleReplace.js
const mongoose = require('mongoose');

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
    default: true // Czy usunąć rolę czasową po zamianie
  }
}, { timestamps: true });

// Złożony indeks dla szybszego wyszukiwania
TempRoleReplaceSchema.index({ guildId: 1, userId: 1, tempRoleId: 1 }, { unique: true });

// Indeks do znajdowania wygasłych ról
TempRoleReplaceSchema.index({ expiresAt: 1 });

module.exports = mongoose.model('TempRoleReplace', TempRoleReplaceSchema);