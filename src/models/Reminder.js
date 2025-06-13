// src/models/Reminder.js
const mongoose = require('mongoose');

const ReminderSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  guildId: {
    type: String,
    required: true
  },
  channelId: {
    type: String,
    required: true
  },
  messageId: {
    type: String,
    required: true
  },
  reminderText: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  remindAt: {
    type: Date,
    required: true,
    index: true
  },
  isCompleted: {
    type: Boolean,
    default: false
  },
  // Opcjonalne pole do przechowywania oryginalnej komendy
  originalCommand: {
    type: String
  }
}, { timestamps: true });

// Indeks do znajdowania przypomnień do wykonania
ReminderSchema.index({ remindAt: 1, isCompleted: 1 });

// Indeks dla użytkownika
ReminderSchema.index({ userId: 1, isCompleted: 1 });

module.exports = mongoose.model('Reminder', ReminderSchema);