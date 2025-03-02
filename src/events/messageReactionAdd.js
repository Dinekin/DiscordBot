const { Events } = require('discord.js');
const MessageLog = require('../models/MessageLog');
const Guild = require('../models/Guild');
const logger = require('../utils/logger');

module.exports = {
  name: Events.MessageReactionAdd,
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
      
// Znajdź reakcję w bazie danych
const messageLog = await MessageLog.findOne({ messageId: reaction.message.id });
      
if (messageLog) {
  // Pobierz informacje o emoji
  const emoji = reaction.emoji;
  const emojiId = emoji.id;
  const emojiName = emoji.name;
  
  // Sprawdź, czy ta reakcja już istnieje w logu
  const existingReactionIndex = messageLog.reactions.findIndex(r => 
    (emojiId && r.id === emojiId) || (!emojiId && r.name === emojiName)
  );
  
  if (existingReactionIndex !== -1) {
    // Aktualizuj istniejącą reakcję
    const existingReaction = messageLog.reactions[existingReactionIndex];
    existingReaction.count = (existingReaction.count || 0) + 1;
    
    // Dodaj użytkownika do listy, jeśli jeszcze go tam nie ma
    if (!existingReaction.users) {
      existingReaction.users = [];
    }
    
    if (!existingReaction.users.includes(user.id)) {
      existingReaction.users.push(user.id);
      logger.debug(`Dodano użytkownika ${user.id} do listy dla reakcji ${emojiName} na wiadomość ${reaction.message.id}`);
    }
  } else {
    // Dodaj nową reakcję
    messageLog.reactions.push({
      name: emojiName,
      id: emojiId,
      count: 1,
      isCustom: !!emojiId,
      animated: emoji.animated || false,
      url: emojiId ? `https://cdn.discordapp.com/emojis/${emojiId}.${emoji.animated ? 'gif' : 'png'}` : null,
      users: [user.id]
    });
  }
        
        await messageLog.save();
        logger.debug(`Zaktualizowano log dla reakcji na wiadomość ${reaction.message.id}`);
        
        // Opcjonalnie wysyłanie logu na wyznaczony kanał
        if (guildSettings.messageLogChannel) {
          const logChannel = await reaction.message.guild.channels.fetch(guildSettings.messageLogChannel).catch(() => null);
          
          if (logChannel && logChannel.id !== reaction.message.channel.id) {
            // Twórz logowanie tylko w określonych przypadkach, aby nie zaśmiecać kanału logów
            // Na przykład: pierwszy użytkownik dodający daną reakcję lub co 5 reakcja tego samego typu
            const currentCount = messageLog.reactions.find(r => 
              (emojiId && r.id === emojiId) || (!emojiId && r.name === emojiName)
            )?.count || 1;
            
            if (currentCount === 1 || currentCount % 5 === 0) {
              const emojiDisplay = emojiId 
                ? `<${emoji.animated ? 'a' : ''}:${emojiName}:${emojiId}>`
                : emojiName;
              
              const logEmbed = {
                color: 0x3498db,
                author: {
                  name: user.tag,
                  icon_url: user.displayAvatarURL({ dynamic: true })
                },
                description: `**Reakcja dodana do [wiadomości](${reaction.message.url}) w <#${reaction.message.channel.id}>**\n${emojiDisplay} (${currentCount})`,
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
      } else {
        // Jeśli log nie istnieje, możemy go stworzyć, ale tylko jeśli mamy dostęp do pełnej wiadomości
        // Uproszczona wersja tworzenia logu, bo głównie interesują nas reakcje
        if (!reaction.message.partial) {
          const message = reaction.message;
          
          // Stwórz uproszczony log wiadomości
          const newMessageLog = new MessageLog({
            guildId: message.guild.id,
            channelId: message.channel.id,
            messageId: message.id,
            authorId: message.author?.id || 'unknown',
            authorTag: message.author?.tag || 'Unknown User',
            content: message.content || '',
            attachments: [],  // Puste dla uproszczenia
            reactions: [{
              name: reaction.emoji.name,
              id: reaction.emoji.id,
              count: reaction.count,
              isCustom: !!reaction.emoji.id,
              animated: reaction.emoji.animated || false,
              url: reaction.emoji.id ? `https://cdn.discordapp.com/emojis/${reaction.emoji.id}.${reaction.emoji.animated ? 'gif' : 'png'}` : null,
              users: [user.id]
            }],
            createdAt: message.createdAt || new Date()
          });
          
          await newMessageLog.save();
          logger.debug(`Utworzono nowy log dla reakcji na wiadomość ${message.id}`);
        }
      }
    } catch (error) {
      logger.error(`Błąd podczas logowania dodania reakcji: ${error.stack}`);
    }
  }
};