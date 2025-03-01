const { Events } = require('discord.js');
const ReactionRole = require('../models/ReactionRole');
const Guild = require('../models/Guild');

module.exports = {
  name: Events.MessageReactionAdd,
  async execute(reaction, user) {
    // Ignoruj reakcje od botów
    if (user.bot) return;
    
    // Sprawdź, czy reakcja jest częściowa i załaduj ją w całości
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (error) {
        console.error('Błąd podczas pobierania reakcji:', error);
        return;
      }
    }
    
    // Pobierz informacje o serwerze
    const guildSettings = await Guild.findOne({ guildId: reaction.message.guildId });
    
    // Sprawdź czy moduł reaction roles jest włączony
    if (guildSettings && !guildSettings.modules.reactionRoles) return;
    
    // Znajdź reakcję w bazie danych
    const reactionRole = await ReactionRole.findOne({ 
      guildId: reaction.message.guildId,
      messageId: reaction.message.id 
    });
    
    if (!reactionRole) return;
    
    // Sprawdź, czy emoji jest w bazie danych
    const emojiIdentifier = reaction.emoji.id || reaction.emoji.name;
    const roleInfo = reactionRole.roles.find(r => r.emoji === emojiIdentifier);
    
    if (!roleInfo) return;
    
    try {
      // Dodaj rolę użytkownikowi
      const guild = reaction.message.guild;
      const member = await guild.members.fetch(user.id);
      await member.roles.add(roleInfo.roleId);
      
      // Sprawdź, czy powiadomienia są włączone
      if (roleInfo.notificationEnabled && guildSettings.notificationChannel) {
        const notificationChannel = await guild.channels.fetch(guildSettings.notificationChannel);
        const role = await guild.roles.fetch(roleInfo.roleId);
        
        await notificationChannel.send(
          `Użytkownik ${user} otrzymał rolę ${role.name} poprzez reakcję w kanale <#${reaction.message.channel.id}>`
        );
      }
    } catch (error) {
      console.error('Błąd podczas dodawania roli:', error);
    }
  },
};
