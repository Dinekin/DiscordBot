const { Events } = require('discord.js');
const MessageLog = require('../models/MessageLog');
const Guild = require('../models/Guild');
const logger = require('../utils/logger');

module.exports = {
  name: Events.MessageReactionRemove,
  async execute(reaction, user) {
    // Ignoruj reakcje botów
    if (user.bot) return;
    
    // Sprawdź, czy reakcja jest częściowa i załaduj ją w całości
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (error) {
        logger.error('Błąd podczas pobierania reakcji:', error);
        return;
      }
    }
    
    try {
      // Sprawdzenie czy funkcja logowania wiadomości jest włączona na serwerze
      const guildSettings = await Guild.findOne({ guildId: reaction.message.guild?.id });
      
      // Jeśli nie ma guildSettings lub funkcja nie jest włączona, zakończ
      if (!reaction.message.guild || !guildSettings || !guildSettings.modules?.messageLog) return;
      
// Znajdź log wiadomości
const messageLog = await MessageLog.findOne({ messageId: reaction.message.id });
      
if (messageLog) {
  // Pobierz informacje o emoji
  const emoji = reaction.emoji;
  const emojiId = emoji.id;
  const emojiName = emoji.name;
  
  // Sprawdź, czy ta reakcja istnieje w logu
  const existingReactionIndex = messageLog.reactions.findIndex(r => 
    (emojiId && r.id === emojiId) || (!emojiId && r.name === emojiName)
  );
  
  if (existingReactionIndex !== -1) {
    // Aktualizuj istniejącą reakcję
    const existingReaction = messageLog.reactions[existingReactionIndex];
    
    // Zmniejsz licznik reakcji
    existingReaction.count = Math.max(0, (existingReaction.count || 1) - 1);
    
    // Inicjalizuj tablicę users jeśli nie istnieje
    if (!existingReaction.users) {
      existingReaction.users = [];
    }
    
    // Usuń użytkownika z listy
    existingReaction.users = existingReaction.users.filter(id => id !== user.id);
    logger.debug(`Usunięto użytkownika ${user.id} z listy dla reakcji ${emojiName} na wiadomość ${reaction.message.id}`);
    
    // Jeśli nie ma już reakcji tego typu, usuń ją z listy
    if (existingReaction.count === 0) {
      messageLog.reactions.splice(existingReactionIndex, 1);
      logger.debug(`Usunięto reakcję ${emojiName} z listy dla wiadomości ${reaction.message.id}`);
    }
  }
        
        await messageLog.save();
        logger.debug(`Zaktualizowano log dla usunięcia reakcji z wiadomości ${reaction.message.id}`);
        
        // Opcjonalnie wysyłanie logu na wyznaczony kanał
        if (guildSettings.messageLogChannel) {
          const logChannel = await reaction.message.guild.channels.fetch(guildSettings.messageLogChannel).catch(() => null);
          
          if (logChannel && logChannel.id !== reaction.message.channel.id) {
            // Loguj tylko ważniejsze zmiany, np. gdy nie ma już żadnej reakcji tego typu
            // lub co 5 usuniętych reakcji
            const currentCount = existingReactionIndex !== -1 
              ? messageLog.reactions[existingReactionIndex]?.count || 0
              : 0;
              
            const wasRemoved = existingReactionIndex !== -1 && currentCount === 0;
            const isSignificantChange = currentCount % 5 === 0;
            
            if (wasRemoved || isSignificantChange) {
              const emojiDisplay = emojiId 
                ? `<${emoji.animated ? 'a' : ''}:${emojiName}:${emojiId}>`
                : emojiName;
              
              const logEmbed = {
                color: 0xe74c3c,
                author: {
                  name: user.tag,
                  icon_url: user.displayAvatarURL({ dynamic: true })
                },
                description: `**Reakcja usunięta z [wiadomości](${reaction.message.url}) w <#${reaction.message.channel.id}>**\n${emojiDisplay} (pozostało: ${currentCount})`,
                fields: [],
                footer: {
                  text: `Wiadomość ID: ${reaction.message.id}`
                },
                timestamp: new Date()
              };
              
              // Jeśli to customowa emoji, dodaj jej obraz
              if (emojiId) {
                logEmbed.thumbnail = {
                  url: `https://cdn.discordapp.com/emojis/${emojiId}.${emoji.animated ? 'gif' : 'png'}`
                };
              }
              
              await logChannel.send({ embeds: [logEmbed] });
            }
          }
        }
      }
    } catch (error) {
      logger.error(`Błąd podczas logowania usunięcia reakcji: ${error.stack}`);
    }
  }
};