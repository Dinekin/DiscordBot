const mongoose = require('mongoose');

const GuildSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true
  },
  prefix: {
    type: String,
    default: '!'
  },
  welcomeChannel: {
    type: String,
    default: null
  },
  notificationChannel: {
    type: String,
    default: null
  },
  // Kanał do logowania wiadomości
  messageLogChannel: {
    type: String,
    default: null
  },
  // Flaga określająca czy logować tylko usunięte wiadomości
  logDeletedOnly: {
    type: Boolean,
    default: false
  },
  language: {
    type: String,
    default: 'pl'
  },
  modules: {
    reactionRoles: {
      type: Boolean,
      default: true
    },
    notifications: {
      type: Boolean,
      default: true
    },
    messageLog: {
      type: Boolean,
      default: false
    }
  }
}, { timestamps: true });

module.exports = mongoose.model('Guild', GuildSchema);