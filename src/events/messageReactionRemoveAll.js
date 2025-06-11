// src/events/messageReactionRemoveAll.js - ulepszona wersja z kompletnym logowaniem
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
      
      // Sprawdź czy kanał logów istnieje i czy to nie jest kanał logów
      if (!guildSettings.messageLogChannel) return;
      
      const logChannel = await message.guild.channels.fetch(guildSettings.messageLogChannel).catch(() => null);
      if (!logChannel || logChannel.id === message.channel.id) return;
      
      // Sprawdź, czy mamy logować tylko usunięte wiadomości
      if (guildSettings.logDeletedOnly) return;
      
      // Znajdź log wiadomości
      const messageLog = await MessageLog.findOne({ messageId: message.id });
      
      let removedReactionsCount = 0;
      let removedReactionsInfo = [];
      
      if (messageLog && messageLog.reactions && messageLog.reactions.length > 0) {
        // Zapisz informacje o usuniętych reakcjach przed wyczyszczeniem
        removedReactionsInfo = messageLog.reactions.map(r => {
          const emojiDisplay = r.id 
            ? `<${r.animated ? 'a' : ''}:${r.name}:${r.id}>`
            : r.name;
          return `${emojiDisplay} (${r.count || 0})`;
        });
        
        removedReactionsCount = messageLog.reactions.reduce((total, reaction) => total + (reaction.count || 0), 0);
        
        // Wyczyść listę reakcji
        messageLog.reactions = [];
        await messageLog.save();
        
        logger.debug(`Wyczyszczono wszystkie reakcje z logu wiadomości ${message.id}`);
      } else {
        // Jeśli nie ma logu wiadomości, spróbuj pobrać reaktcje bezpośrednio z message cache
        if (message.reactions && message.reactions.cache.size > 0) {
          removedReactionsInfo = message.reactions.cache.map(r => {
            const emojiDisplay = r.emoji.id 
              ? `<${r.emoji.animated ? 'a' : ''}:${r.emoji.name}:${r.emoji.id}>`
              : r.emoji.name;
            return `${emojiDisplay} (${r.count || 0})`;
          });
          
          removedReactionsCount = message.reactions.cache.reduce((total, reaction) => total + (reaction.count || 0), 0);
        }
      }
      
      // Wyślij log na kanał tylko jeśli były jakieś reakcje do usunięcia
      if (removedReactionsCount > 0) {
        const logEmbed = {
          color: 0xe74c3c,
          title: '🧹 Usunięto wszystkie reakcje',
          description: `**Usunięto wszystkie reakcje z [wiadomości](${message.url}) w <#${message.channel.id}>**`,
          fields: [
            {
              name: '📊 Statystyki',
              value: `**Łącznie usunięto:** ${removedReactionsCount} reakcji\n**Rodzajów reakcji:** ${removedReactionsInfo.length}`,
              inline: false
            }
          ],
          footer: {
            text: `Wiadomość ID: ${message.id}`
          },
          timestamp: new Date()
        };
        
        // Dodaj szczegółowe informacje o usuniętych reakcjach (jeśli nie za dużo)
        if (removedReactionsInfo.length > 0 && removedReactionsInfo.length <= 25) {
          // Podziel na grupy po maksymalnie 10 reakcji na pole (limit Discord)
          const maxPerField = 10;
          const reactionGroups = [];
          
          for (let i = 0; i < removedReactionsInfo.length; i += maxPerField) {
            reactionGroups.push(removedReactionsInfo.slice(i, i + maxPerField));
          }
          
          reactionGroups.forEach((group, index) => {
            const fieldName = reactionGroups.length === 1 
              ? '🗑️ Usunięte reakcje'
              : `🗑️ Usunięte reakcje (${index + 1}/${reactionGroups.length})`;
            
            logEmbed.fields.push({
              name: fieldName,
              value: group.join('\n'),
              inline: false
            });
          });
        } else if (removedReactionsInfo.length > 25) {
          // Jeśli za dużo reakcji, pokaż tylko pierwsze kilka i info o reszcie
          const firstReactions = removedReactionsInfo.slice(0, 15);
          const remainingCount = removedReactionsInfo.length - 15;
          
          logEmbed.fields.push({
            name: '🗑️ Usunięte reakcje (próbka)',
            value: `${firstReactions.join('\n')}\n\n... i ${remainingCount} więcej`,
            inline: false
          });
        }
        
        // Dodaj informacje o autorze wiadomości jeśli dostępne
        if (message.author) {
          logEmbed.fields.push({
            name: '👤 Autor wiadomości',
            value: `${message.author.tag} (${message.author})`,
            inline: true
          });
        }
        
        // Dodaj fragment treści wiadomości jeśli dostępna
        if (message.content && message.content.trim()) {
          const contentPreview = message.content.length > 100 
            ? message.content.substring(0, 97) + '...' 
            : message.content;
          
          logEmbed.fields.push({
            name: '💬 Fragment wiadomości',
            value: contentPreview,
            inline: false
          });
        }
        
        await logChannel.send({ embeds: [logEmbed] });
        
        logger.info(`Zalogowano usunięcie wszystkich reakcji z wiadomości ${message.id} - usuniętych reakcji: ${removedReactionsCount}`);
      } else {
        logger.debug(`Nie znaleziono reakcji do usunięcia z wiadomości ${message.id}`);
      }
    } catch (error) {
      logger.error(`Błąd podczas logowania usunięcia wszystkich reakcji: ${error.stack}`);
    }
  }
};