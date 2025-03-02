const { Events } = require('discord.js');
const MessageLog = require('../models/MessageLog');
const Guild = require('../models/Guild');
const logger = require('../utils/logger');

module.exports = {
  name: Events.MessageReactionRemoveAll,
  async execute(message) {
    try {
      // Sprawdzenie czy funkcja logowania wiadomości jest włączona na serwerze
      const guildSettings = await Guild.findOne({ guildId: message.guild?.id });
      
      // Jeśli nie ma guildSettings lub funkcja nie jest włączona, zakończ
      if (!message.guild || !guildSettings || !guildSettings.modules?.messageLog) return;
      
      // Znajdź log wiadomości
      const messageLog = await MessageLog.findOne({ messageId: message.id });
      
      if (messageLog) {
        // Zapisz ilość usuniętych reakcji
        const removedReactionsCount = messageLog.reactions.reduce((total, reaction) => total + (reaction.count || 0), 0);
        
        // Wyczyść listę reakcji
        messageLog.reactions = [];
        
        await messageLog.save();
        logger.debug(`Wyczyszczono wszystkie reakcje z logu wiadomości ${message.id}`);
        
        // Opcjonalnie wysyłanie logu na wyznaczony kanał
        if (guildSettings.messageLogChannel && removedReactionsCount > 0) {
          const logChannel = await message.guild.channels.fetch(guildSettings.messageLogChannel).catch(() => null);
          
          if (logChannel && logChannel.id !== message.channel.id) {
            const logEmbed = {
              color: 0xe74c3c,
              description: `**Usunięto wszystkie reakcje z [wiadomości](${message.url}) w <#${message.channel.id}>**\nŁącznie usunięto: ${removedReactionsCount} reakcji`,
              footer: {
                text: `Wiadomość ID: ${message.id}`
              },
              timestamp: new Date()
            };
            
            await logChannel.send({ embeds: [logEmbed] });
          }
        }
      }
    } catch (error) {
      logger.error(`Błąd podczas logowania usunięcia wszystkich reakcji: ${error.stack}`);
    }
  }
};