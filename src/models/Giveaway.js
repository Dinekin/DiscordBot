// Dodaj ten plik jako src/models/Giveaway.js
const mongoose = require('mongoose');

const GiveawaySchema = new mongoose.Schema({
    messageId: {
        type: String,
        required: true
    },
    channelId: {
        type: String,
        required: true
    },
    guildId: {
        type: String,
        required: true
    },
    startAt: {
        type: Number,
        required: true
    },
    endAt: {
        type: Number,
        required: true
    },
    ended: {
        type: Boolean,
        required: true,
        default: false
    },
    winnerCount: {
        type: Number,
        required: true
    },
    prize: {
        type: String,
        required: true
    },
    messages: {
        giveaway: {
            type: String,
            required: false
        },
        giveawayEnded: {
            type: String,
            required: false
        },
        inviteToParticipate: {
            type: String,
            required: false
        },
        drawing: {
            type: String,
            required: false
        },
        dropMessage: {
            type: String,
            required: false
        },
        winMessage: {
            type: mongoose.Schema.Types.Mixed,
            required: false
        },
        embedFooter: {
            type: mongoose.Schema.Types.Mixed,
            required: false
        },
        noWinner: {
            type: String,
            required: false
        },
        winners: {
            type: String,
            required: false
        },
        endedAt: {
            type: String,
            required: false
        },
        hostedBy: {
            type: String,
            required: false
        }
    },
    thumbnail: {
        type: String,
        required: false
    },
    image: {
        type: String,
        required: false
    },
    hostedBy: {
        type: String,
        required: false
    },
    winnerIds: {
        type: [String],
        required: false,
        default: []
    },
    reaction: {
        type: mongoose.Schema.Types.Mixed,
        required: false
    },
    botsCanWin: {
        type: Boolean,
        required: false,
        default: false
    },
    embedColor: {
        type: String,
        required: false
    },
    embedColorEnd: {
        type: String,
        required: false
    },
    extraData: {
        type: mongoose.Schema.Types.Mixed,
        required: false
    },
    lastChance: {
        type: mongoose.Schema.Types.Mixed,
        required: false
    },
    pauseOptions: {
        type: mongoose.Schema.Types.Mixed,
        required: false
    },
    isDrop: {
        type: Boolean,
        required: false,
        default: false
    },
    allowedMentions: {
        type: mongoose.Schema.Types.Mixed,
        required: false
    }
}, { 
    id: false,
    timestamps: true
});

// Compound index to ensure each message has only one giveaway
GiveawaySchema.index({ messageId: 1, guildId: 1 }, { unique: true });

module.exports = mongoose.model('Giveaway', GiveawaySchema);