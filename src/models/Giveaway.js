// src/models/Giveaway.js
const mongoose = require('mongoose');

const GiveawaySchema = new mongoose.Schema({
    messageId: String,
    channelId: String,
    guildId: String,
    startAt: Number,
    endAt: Number,
    ended: Boolean,
    winnerCount: Number,
    prize: String,
    messages: {
        giveaway: String,
        giveawayEnded: String,
        inviteToParticipate: String,
        drawing: String,
        dropMessage: String,
        winMessage: mongoose.Schema.Types.Mixed,
        embedFooter: mongoose.Schema.Types.Mixed,
        noWinner: String,
        winners: String,
        endedAt: String,
        hostedBy: String
    },
    thumbnail: String,
    image: String,
    // Przechowujmy tylko ID zamiast całego obiektu
    hostedById: String,
    hostedByUsername: String,
    hostedByDiscriminator: String,
    winnerIds: [String],
    reaction: mongoose.Schema.Types.Mixed,
    botsCanWin: Boolean,
    embedColor: String,
    embedColorEnd: String,
    extraData: mongoose.Schema.Types.Mixed,
    lastChance: mongoose.Schema.Types.Mixed,
    pauseOptions: mongoose.Schema.Types.Mixed,
    isDrop: Boolean,
    allowedMentions: mongoose.Schema.Types.Mixed
}, { 
    id: false,
    timestamps: true
});

module.exports = mongoose.model('Giveaway', GiveawaySchema);