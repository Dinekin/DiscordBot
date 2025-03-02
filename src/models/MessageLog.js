const mongoose = require('mongoose');

// Schemat reakcji
const ReactionSchema = new mongoose.Schema({
  name: String,           // Nazwa emoji/reakcji
  id: String,             // ID (dla customowych emoji)
  count: Number,          // Liczba reakcji tego typu
  isCustom: Boolean,      // Czy to jest customowa reakcja
  animated: Boolean,      // Czy reakcja jest animowana
  url: String,            // URL dla customowych emoji (opcjonalny)
  users: [String]         // Lista ID użytkowników, którzy dodali tę reakcję
}, { _id: false });

// Schemat naklejki
const StickerSchema = new mongoose.Schema({
  id: String,             // ID naklejki
  name: String,           // Nazwa naklejki
  description: String,    // Opis naklejki (jeśli dostępny)
  format: String,         // Format naklejki (PNG, APNG, LOTTIE)
  url: String,            // URL naklejki (jeśli dostępny)
  packId: String,         // ID paczki naklejek (jeśli dostępny)
  packName: String        // Nazwa paczki naklejek (jeśli dostępna)
}, { _id: false });

// Główny schemat logów wiadomości
const MessageLogSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    index: true
  },
  channelId: {
    type: String,
    required: true
  },
  messageId: {
    type: String,
    required: true,
    unique: true
  },
  authorId: {
    type: String,
    required: true
  },
  authorTag: {
    type: String,
    required: true
  },
  content: {
    type: String,
    default: ""
  },
  // Załączniki (pliki)
  attachments: [{
    id: String,
    url: String,
    name: String,
    contentType: String,
    size: Number,
    height: Number,
    width: Number,
    description: String,
    ephemeral: Boolean
  }],
  // Osadzenia (embedy)
  embeds: [{
    type: String,         // Typ osadzenia
    title: String,        // Tytuł
    description: String,  // Opis
    url: String,          // URL
    timestamp: Date,      // Data
    color: Number,        // Kolor
    author: {             // Informacje o autorze
      name: String,
      url: String,
      iconURL: String
    },
    thumbnail: {          // Miniaturka
      url: String,
      height: Number,
      width: Number
    },
    image: {              // Obraz
      url: String,
      height: Number,
      width: Number
    },
    footer: {             // Stopka
      text: String,
      iconURL: String
    },
    fields: [{            // Pola
      name: String,
      value: String,
      inline: Boolean
    }]
  }],
  // Reakcje
  reactions: [ReactionSchema],
  // Naklejki
  stickers: [StickerSchema],
  // Gify/Tenor
  gifAttachment: {
    url: String,          // URL gifa
    platform: String,     // Nazwa platformy (np. "Tenor")
    height: Number,
    width: Number
  },
  // Referencja do innej wiadomości (odpowiedź)
  reference: {
    messageId: String,    // ID wiadomości, na którą odpowiedziano
    channelId: String,    // ID kanału
    guildId: String,      // ID serwera
    content: String,      // Treść oryginalnej wiadomości (fragment)
    authorId: String,     // ID autora oryginalnej wiadomości
    authorTag: String     // Tag autora oryginalnej wiadomości
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  // Jeśli wiadomość została edytowana
  editedAt: {
    type: Date,
    default: null
  },
  // Oryginalna treść przed edycją
  originalContent: {
    type: String,
    default: null
  },
  // Jeśli wiadomość została usunięta
  deletedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

// Złożony indeks dla szybszego wyszukiwania
MessageLogSchema.index({ guildId: 1, channelId: 1, createdAt: -1 });

module.exports = mongoose.model('MessageLog', MessageLogSchema);