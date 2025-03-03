// Nowy model do śledzenia statystyk ról
// src/models/RoleStats.js
const mongoose = require('mongoose');

const RoleStatsSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true
  },
  roleId: {
    type: String,
    required: true
  },
  total: {
    type: Number,
    default: 0
  },
  restored: {
    type: Number,
    default: 0
  },
  removed: {
    type: Number,
    default: 0
  },
  events: [{
    userId: String,
    userTag: String,
    action: {
      type: String,
      enum: ['add', 'remove', 'restore']
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }]
}, { timestamps: true });

// Złożony indeks dla szybszego wyszukiwania
RoleStatsSchema.index({ guildId: 1, roleId: 1 }, { unique: true });

module.exports = mongoose.model('RoleStats', RoleStatsSchema);