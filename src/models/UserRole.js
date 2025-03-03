const mongoose = require('mongoose');

const UserRoleSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true
  },
  userId: {
    type: String,
    required: true
  },
  roles: [{
    type: String
  }],
  nickname: {
    type: String,
    default: null
  },
  leftAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Złożony indeks dla szybszego wyszukiwania
UserRoleSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('UserRole', UserRoleSchema);