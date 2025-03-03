// Zaktualizuj model MessageLog, aby obsługiwał informacje o moderacji
// Plik: src/models/MessageLog.js

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

// Schemat dla logowania akcji moderacyjnych
const ModActionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['ban', 'unban', 'kick', 'timeout', 'remove_timeout', 'warn'],
    required: true
  },
  targetId: String,       // ID użytkownika, który jest celem akcji
  targetTag: String,      // Tag użytkownika (np. Username#1234)
  moderatorId: String,    // ID moderatora, który wykonał akcję
  moderatorTag: String,   // Tag moderatora
  reason: String,         // Powód akcji
  duration: String,       // Czas trwania (dla timeoutów, banów tymczasowych)
  expiresAt: Date,        // Data wygaśnięcia (dla timeoutów, banów tymczasowych)
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

// Schemat dla logowania zmian nicku
const NicknameChangeSchema = new mongoose.Schema({
  userId: String,         // ID użytkownika
  userTag: String,        // Tag użytkownika
  oldNickname: String,    // Poprzedni pseudonim
  newNickname: String,    // Nowy pseudonim
  changedById: String,    // ID osoby zmieniającej (null jeśli sam użytkownik)
  changedByTag: String,   // Tag osoby zmieniającej
  reason: String,         // Powód zmiany (jeśli podano)
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

// Schemat dla logowania przypisania/usunięcia roli
const RoleChangeSchema = new mongoose.Schema({
  userId: String,         // ID użytkownika
  userTag: String,        // Tag użytkownika
  roleId: String,         // ID roli
  roleName: String,       // Nazwa roli
  type: {
    type: String,
    enum: ['add', 'remove'],
    required: true
  },
  changedById: String,    // ID osoby zmieniającej
  changedByTag: String,   // Tag osoby zmieniającej
  reason: String,         // Powód zmiany (jeśli podano)
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

// Schemat dla logowania kanałów i forów
const ChannelLogSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['create', 'delete', 'update'],
    required: true
  },
  channelId: String,      // ID kanału
  channelName: String,    // Nazwa kanału
  channelType: String,    // Typ kanału
  moderatorId: String,    // ID moderatora wykonującego akcję
  moderatorTag: String,   // Tag moderatora
  reason: String,         // Powód akcji
  changes: [{             // Lista zmian (dla update)
    field: String,        // Nazwa pola
    oldValue: String,     // Stara wartość
    newValue: String      // Nowa wartość
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

// Schemat dla logowania nitek/wątków
const ThreadLogSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['create', 'delete', 'update', 'archive', 'unarchive'],
    required: true
  },
  threadId: String,       // ID nitki
  threadName: String,     // Nazwa nitki
  parentId: String,       // ID kanału nadrzędnego
  parentName: String,     // Nazwa kanału nadrzędnego
  authorId: String,       // ID autora nitki
  authorTag: String,      // Tag autora
  moderatorId: String,    // ID moderatora wykonującego akcję (jeśli inna niż autor)
  moderatorTag: String,   // Tag moderatora
  isForumPost: Boolean,   // Czy nitka jest postem forum
  tags: [String],         // Tagi aplikowane do postu forum
  changes: [{             // Lista zmian (dla update)
    field: String,        // Nazwa pola
    oldValue: String,     // Stara wartość
    newValue: String      // Nowa wartość
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
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
  },
  
  // Nowe pola dla rozszerzonych funkcji logowania
  
  // Logi akcji moderacyjnych
  modActions: [ModActionSchema],
  
  // Logi zmian nicku
  nicknameChanges: [NicknameChangeSchema],
  
  // Logi zmian ról
  roleChanges: [RoleChangeSchema],
  
  // Logi kanałów
  channelLogs: [ChannelLogSchema],
  
  // Logi nitek/wątków
  threadLogs: [ThreadLogSchema]
}, { timestamps: true });

// Złożony indeks dla szybszego wyszukiwania
MessageLogSchema.index({ guildId: 1, channelId: 1, createdAt: -1 });

module.exports = mongoose.model('MessageLog', MessageLogSchema);