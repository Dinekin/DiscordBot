const mongoose = require('mongoose');

const ReactionRoleSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true
  },
  messageId: {
    type: String,
    required: true
  },
  channelId: {
    type: String,
    required: true
  },
  roles: [{
    emoji: String,
    roleId: String,
    notificationEnabled: {
      type: Boolean,
      default: false
    }
  }],
  title: {
    type: String,
    default: 'Role Reaction'
  },
  description: {
    type: String,
    default: 'Kliknij na reakcję, aby otrzymać rolę!'
  }
}, { timestamps: true });

// Compound index to ensure each message has only one reaction role setup
ReactionRoleSchema.index({ messageId: 1, guildId: 1 }, { unique: true });

module.exports = mongoose.model('ReactionRole', ReactionRoleSchema);
