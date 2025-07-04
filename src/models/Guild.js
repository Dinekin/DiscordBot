// Poprawiony model Guild.js
const mongoose = require('mongoose');

// Pierwszy zdefiniuj schemat dla modułów jako oddzielny schemat
const ModulesSchema = new mongoose.Schema({
  messageLog: {
    type: Boolean,
    default: false
  },
  reactionRoles: {
    type: Boolean,
    default: true
  },
  notifications: {
    type: Boolean,
    default: true
  }
}, { _id: false });  // Ważne: _id: false zapobiega tworzeniu ID dla subdokumentów

const GuildSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true
  },
  restoreRoles: {
    type: Boolean,
    default: true
  },
  
  roleExpiryDays: {
    type: Number,
    default: 0
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
    // Lista wykluczonych kanałów z logowania
  excludedChannels: [{
    type: String,
    default: null
  }],
  language: {
    type: String,
    default: 'pl'
  },
  // Używamy predefiniowanego schematu ModulesSchema
  modules: {
    type: ModulesSchema,
    default: () => ({
      messageLog: false,
      reactionRoles: true,
      notifications: true
    })
  },
  categories: {
    type: [String],
    default: ['Ogłoszenia', 'Przypomnienia', 'Cykliczne', 'Inne']
  },
  livefeedCategoryOrder: {
    type: [String],
    default: []
  },
  livefeedOrder: {
    type: Map,
    of: [String],
    default: {}
  },
  livefeedCategoryCollapse: {
    type: Map,
    of: Boolean,
    default: {}
  }
}, { timestamps: true });

// Funkcja wykonywana przed zapisem
GuildSchema.pre('save', function(next) {
  // Upewnij się, że modules istnieje
  if (!this.modules) {
    this.modules = {
      messageLog: false,
      reactionRoles: true,
      notifications: true
    };
  }
  next();
});

module.exports = mongoose.model('Guild', GuildSchema);