const { Events } = require('discord.js');
const ReactionRole = require('../models/ReactionRole');
const Guild = require('../models/Guild');
const logger = require('../utils/logger'); // Upewnij się, że masz importowany logger

module.exports = {
  name: Events.MessageReactionAdd,
  async execute(reaction, user) {
    // Ignoruj reakcje od botów
    if (user.bot) return;
    
    try {
      logger.debug(`Reakcja otrzymana: ${user.tag} dodał emoji ${reaction.emoji.name || reaction.emoji.id} do wiadomości ${reaction.message.id}`);
      
      // Sprawdź, czy reakcja jest częściowa i załaduj ją w całości
      if (reaction.partial) {
        try {
          await reaction.fetch();
          logger.debug('Reakcja częściowa została pobrana w całości');
        } catch (error) {
          logger.error(`Błąd podczas pobierania reakcji: ${error.message}`);
          return;
        }
      }
      
      // Pobierz informacje o serwerze
      const guildSettings = await Guild.findOne({ guildId: reaction.message.guildId });
      logger.debug(`Ustawienia serwera: ${JSON.stringify(guildSettings ? guildSettings.modules : 'brak')}`);
      
      // Sprawdź czy moduł reaction roles jest włączony
      if (guildSettings && guildSettings.modules && guildSettings.modules.reactionRoles === false) {
        logger.debug('Moduł reaction roles jest wyłączony, przerywam');
        return;
      }
      
      // Znajdź reakcję w bazie danych
      const reactionRole = await ReactionRole.findOne({ 
        guildId: reaction.message.guildId,
        messageId: reaction.message.id 
      });
      
      if (!reactionRole) {
        logger.debug(`Nie znaleziono konfiguracji reaction role dla wiadomości ${reaction.message.id}`);
        return;
      }
      
      logger.debug(`Znaleziono konfigurację: ${JSON.stringify(reactionRole)}`);
      
      // Sprawdź, czy emoji jest w bazie danych
      const emojiIdentifier = reaction.emoji.id || reaction.emoji.name;
      logger.debug(`Szukam emoji: ${emojiIdentifier} w konfiguracji ról`);
      
      // Wypisz wszystkie dostępne emoji w konfiguracji
      logger.debug(`Dostępne emoji w konfiguracji: ${reactionRole.roles.map(r => r.emoji).join(', ')}`);
      
      const roleInfo = reactionRole.roles.find(r => r.emoji === emojiIdentifier);
      
      if (!roleInfo) {
        logger.debug(`Nie znaleziono roli dla emoji ${emojiIdentifier}`);
        return;
      }
      
      logger.debug(`Znaleziono rolę: ${JSON.stringify(roleInfo)}`);
      
      // Dodaj rolę użytkownikowi
      const guild = reaction.message.guild;
      
      if (!guild) {
        logger.error('Nie można uzyskać dostępu do obiektu serwera');
        return;
      }
      
      try {
        const member = await guild.members.fetch(user.id);
        logger.debug(`Pobrano członka serwera: ${member.user.tag}`);
        
        // Pobierz rolę, aby sprawdzić czy istnieje
        const role = await guild.roles.fetch(roleInfo.roleId).catch(err => {
          logger.error(`Nie można znaleźć roli ${roleInfo.roleId}: ${err.message}`);
          return null;
        });
        
        if (!role) {
          logger.error(`Rola o ID ${roleInfo.roleId} nie istnieje na serwerze`);
          return;
        }
        
        // Sprawdź, czy bot ma uprawnienia do zarządzania rolami
        const botMember = guild.members.cache.get(guild.client.user.id);
        if (!botMember.permissions.has('ManageRoles')) {
          logger.error('Bot nie ma uprawnień do zarządzania rolami');
          return;
        }
        
        // Sprawdź, czy rola jest wyżej w hierarchii niż rola bota
        if (role.position >= botMember.roles.highest.position) {
          logger.error(`Rola ${role.name} jest wyżej w hierarchii niż najwyższa rola bota`);
          return;
        }
        
        // Dodaj rolę
        await member.roles.add(roleInfo.roleId);
        logger.info(`Dodano rolę ${role.name} użytkownikowi ${member.user.tag}`);
        
        // Sprawdź, czy powiadomienia są włączone
        if (roleInfo.notificationEnabled && guildSettings && guildSettings.notificationChannel) {
          try {
            const notificationChannel = await guild.channels.fetch(guildSettings.notificationChannel);
            
            if (notificationChannel) {
              await notificationChannel.send(
                `Użytkownik ${user} otrzymał rolę ${role.name} poprzez reakcję w kanale <#${reaction.message.channel.id}>`
              );
              logger.debug('Wysłano powiadomienie o przyznaniu roli');
            } else {
              logger.warn(`Kanał powiadomień ${guildSettings.notificationChannel} nie istnieje`);
            }
          } catch (notifError) {
            logger.error(`Błąd podczas wysyłania powiadomienia: ${notifError.message}`);
          }
        }
      } catch (memberError) {
        logger.error(`Błąd podczas pobierania członka serwera: ${memberError.message}`);
      }
    } catch (error) {
      logger.error(`Ogólny błąd podczas obsługi reakcji: ${error.stack}`);
    }
  },
};