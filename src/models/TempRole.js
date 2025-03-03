// Nowy model do śledzenia ról czasowych
// src/models/TempRole.js
const mongoose = require('mongoose');

const TempRoleSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true
  },
  userId: {
    type: String,
    required: true
  },
  roleId: {
    type: String,
    required: true
  },
  addedAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: true
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
TempRoleSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('TempRole', TempRoleSchema);