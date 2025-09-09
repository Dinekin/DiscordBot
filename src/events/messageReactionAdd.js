// src/events/messageReactionAdd.js - naprawiona wersja z lepszym logowaniem
const { Events } = require('discord.js');
const ReactionRole = require('../models/ReactionRole');
const MessageLog = require('../models/MessageLog');
const Guild = require('../models/Guild');
const { canAddAsTempRole } = require('../utils/checkExpiredRoles');
const logger = require('../utils/logger');

module.exports = {
  name: Events.MessageReactionAdd,
  async execute(reaction, user) {
    // Ignoruj reakcje od botów
    if (user.bot) return;
    
    try {
      logger.debug(`Dodano reakcję: ${user.tag} dodał emoji ${reaction.emoji.name || reaction.emoji.id} do wiadomości ${reaction.message.id}`);
      
      // Sprawdź, czy reakcja jest częściowa i załaduj ją w całości
      if (reaction.partial) {
        try {
          await reaction.fetch();
          logger.debug('Częściowa reakcja została pobrana w całości');
        } catch (error) {
          logger.error(`Błąd podczas pobierania reakcji: ${error.message}`);
          return;
        }
      }

      // Sprawdź, czy wiadomość jest częściowa i załaduj ją
      if (reaction.message.partial) {
        try {
          await reaction.message.fetch();
          logger.debug('Częściowa wiadomość została pobrana w całości');
        } catch (error) {
          logger.error(`Błąd podczas pobierania wiadomości: ${error.message}`);
          return;
        }
      }

      // Pobierz ustawienia serwera
      const guildSettings = await Guild.findOne({ guildId: reaction.message.guildId });
      
      // === LOGOWANIE REAKCJI ===
      if (guildSettings && guildSettings.modules?.messageLog) {
        await logReactionAdd(reaction, user, guildSettings);
      } else {
        logger.debug(`Logowanie reakcji wyłączone lub brak ustawień serwera dla ${reaction.message.guildId}`);
      }
      
      // === SYSTEM RÓL REAKCJI ===
      logger.debug(`Ustawienia serwera: ${JSON.stringify(guildSettings ? guildSettings.modules : 'brak')}`);
      
      // Sprawdź czy moduł reaction roles jest włączony
      if (guildSettings && guildSettings.modules && guildSettings.modules.reactionRoles === false) {
        logger.debug('Moduł reaction roles jest wyłączony, przerywam obsługę ról');
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
      let emojiIdentifier;

      if (reaction.emoji.id) {
        // Dla niestandardowych emoji, skonstruuj pełny format
        emojiIdentifier = `<${reaction.emoji.animated ? 'a' : ''}:${reaction.emoji.name}:${reaction.emoji.id}>`;
      } else {
        // Dla standardowych emoji, użyj nazwy
        emojiIdentifier = reaction.emoji.name;
      }

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
        
        // WAŻNE: Sprawdź czy rola nie jest chroniona przed dodaniem jako czasowa
        if (!canAddAsTempRole(guild.id, user.id, role.id)) {
          logger.warn(`🚫 Reaction role: Blokuję dodanie chronionej roli ${role.name} użytkownikowi ${user.tag}`);
          // Usuń reakcję żeby użytkownik wiedział, że nie może teraz otrzymać tej roli
          try {
            await reaction.users.remove(user.id);
            logger.info(`Usunięto reakcję użytkownika ${user.tag} dla chronionej roli ${role.name}`);
          } catch (removeError) {
            logger.error(`Nie można usunąć reakcji: ${removeError.message}`);
          }
          return;
        }

        // NOWA FUNKCJONALNOŚĆ: Sprawdź czy użytkownik ma rolę blokującą dostęp do tej roli
        if (roleInfo.blockedByRoleId && member.roles.cache.has(roleInfo.blockedByRoleId)) {
          logger.warn(`🚫 Reaction role: Użytkownik ${user.tag} posiada rolę blokującą ${roleInfo.blockedByRoleId}, blokuję dodanie roli ${role.name}`);

          // Pobierz nazwę roli blokującej
          const blockingRole = await guild.roles.fetch(roleInfo.blockedByRoleId).catch(() => null);
          const blockingRoleName = blockingRole ? blockingRole.name : 'nieznana rola';

          // Usuń reakcję i wyślij prywatną wiadomość użytkownikowi
          try {
            await reaction.users.remove(user.id);
            logger.info(`Usunięto reakcję użytkownika ${user.tag} - posiada rolę blokującą`);

            // Wyślij prywatną wiadomość użytkownikowi z informacją
            try {
              await user.send(`Nie możesz otrzymać roli ${role.name}, ponieważ posiadasz rolę "${blockingRoleName}", która blokuje dostęp do tej roli na serwerze ${guild.name}.`);
              logger.info(`Wysłano prywatną wiadomość o blokadzie roli do ${user.tag}`);
            } catch (dmError) {
              logger.warn(`Nie można wysłać DM do użytkownika ${user.tag}: ${dmError.message}`);
            }
          } catch (removeError) {
            logger.error(`Nie można usunąć reakcji: ${removeError.message}`);
          }
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
        logger.info(`Dodano rolę ${role.name} użytkownikowi ${member.user.tag} przez reaction role`);
        
        // UWAGA: TU NIE DODAJEMY AUTOMATYCZNIE ROLI JAKO CZASOWEJ!
        // Jeśli wcześniej była tutaj logika dodawania ról jako czasowych, została usunięta
        
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

// Funkcja pomocnicza do logowania dodania reakcji - ulepszona wersja
async function logReactionAdd(reaction, user, guildSettings) {
  try {
    // Sprawdź czy kanał logów istnieje
    if (!guildSettings.messageLogChannel) {
      logger.debug('Brak kanału logów w ustawieniach serwera');
      return;
    }
    
    const logChannel = await reaction.message.guild.channels.fetch(guildSettings.messageLogChannel).catch(() => null);
    if (!logChannel) {
      logger.warn(`Kanał logów ${guildSettings.messageLogChannel} nie istnieje`);
      return;
    }
    
    // Nie loguj jeśli to jest ten sam kanał
    if (logChannel.id === reaction.message.channel.id) {
      logger.debug('Pomijam logowanie - to jest kanał logów');
      return;
    }
    
    // Sprawdź, czy mamy logować tylko usunięte wiadomości
    if (guildSettings.logDeletedOnly) {
      logger.debug('Logowanie tylko usuniętych wiadomości - pomijam reakcje');
      return;
    }
    
    // Znajdź lub utwórz log wiadomości
    let messageLog = await MessageLog.findOne({ messageId: reaction.message.id });
    
    if (!messageLog) {
      // Jeśli nie ma logu wiadomości, stwórz podstawowy
      messageLog = await MessageLog.create({
        guildId: reaction.message.guild.id,
        channelId: reaction.message.channel.id,
        messageId: reaction.message.id,
        authorId: reaction.message.author?.id || 'unknown',
        authorTag: reaction.message.author?.tag || 'Unknown User',
        content: reaction.message.content || '',
        reactions: [],
        attachments: [],
        embeds: [],
        stickers: [],
        gifAttachment: null,
        createdAt: reaction.message.createdAt || new Date(),
        modActions: [],
        nicknameChanges: [],
        roleChanges: [],
        channelLogs: [],
        threadLogs: []
      });
      logger.debug(`Utworzono nowy log wiadomości dla ${reaction.message.id}`);
    }
    
    // Przygotuj informacje o emoji
    const emoji = reaction.emoji;
    const emojiInfo = {
      name: emoji.name,
      id: emoji.id,
      count: reaction.count,
      isCustom: !!emoji.id,
      animated: emoji.animated || false,
      url: emoji.id ? `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}` : null,
      users: []
    };
    
    // Znajdź istniejącą reakcję lub dodaj nową
    const existingReactionIndex = messageLog.reactions.findIndex(r => 
      (r.id && r.id === emoji.id) || (!r.id && r.name === emoji.name)
    );
    
    if (existingReactionIndex !== -1) {
      // Aktualizuj istniejącą reakcję
      messageLog.reactions[existingReactionIndex].count = reaction.count;
      if (!messageLog.reactions[existingReactionIndex].users.includes(user.id)) {
        messageLog.reactions[existingReactionIndex].users.push(user.id);
      }
    } else {
      // Dodaj nową reakcję
      emojiInfo.users.push(user.id);
      messageLog.reactions.push(emojiInfo);
    }
    
    await messageLog.save();
    logger.debug(`Zaktualizowano log reakcji dla wiadomości ${reaction.message.id}`);
    
    // Przygotuj informacje o emoji do wyświetlenia
    const emojiDisplay = emoji.id 
      ? `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`
      : emoji.name;
    
    // Przygotuj embed z logiem
    const logEmbed = {
      color: 0x2ecc71, // Zielony dla dodania
      author: {
        name: user.tag,
        icon_url: user.displayAvatarURL({ dynamic: true })
      },
      description: `**Dodał reakcję ${emojiDisplay} do [wiadomości](${reaction.message.url}) w <#${reaction.message.channel.id}>**`,
      fields: [
        {
          name: '🔢 Łączna liczba tej reakcji',
          value: reaction.count.toString(),
          inline: true
        }
      ],
      footer: {
        text: `Wiadomość ID: ${reaction.message.id} | User ID: ${user.id}`
      },
      timestamp: new Date()
    };
    
    // Dodaj informacje o autorze oryginalnej wiadomości jeśli dostępne
    if (reaction.message.author) {
      logEmbed.fields.push({
        name: '👤 Autor wiadomości',
        value: `${reaction.message.author.tag}`,
        inline: true
      });
    }
    
    // Dodaj fragment treści wiadomości jeśli dostępna
    if (reaction.message.content && reaction.message.content.trim()) {
      const contentPreview = reaction.message.content.length > 100 
        ? reaction.message.content.substring(0, 97) + '...' 
        : reaction.message.content;
      
      logEmbed.fields.push({
        name: '💬 Fragment wiadomości',
        value: contentPreview,
        inline: false
      });
    }
    
    // Wyślij log
    await logChannel.send({ embeds: [logEmbed] });
    
    logger.info(`✅ Zalogowano dodanie reakcji ${emojiDisplay} przez ${user.tag} do wiadomości ${reaction.message.id}`);
    
  } catch (error) {
    logger.error(`❌ Błąd podczas logowania dodania reakcji: ${error.stack}`);
  }
}
