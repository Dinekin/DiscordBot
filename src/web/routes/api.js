const express = require('express');
const router = express.Router();
const { client } = require('../../bot');
const Guild = require('../../models/Guild');
const ReactionRole = require('../../models/ReactionRole');
const MessageLog = require('../../models/MessageLog');
const { EmbedBuilder } = require('discord.js');
const logger = require('../../utils/logger');

// Uprawnienia moderatora
const PERMISSIONS = {
  ADMIN: 0x8,              // ADMINISTRATOR
  MANAGE_GUILD: 0x20,      // MANAGE_GUILD
  MANAGE_ROLES: 0x10000000, // MANAGE_ROLES
  MANAGE_MESSAGES: 0x2000   // MANAGE_MESSAGES
};

// Funkcja pomocnicza do sprawdzania uprawnień moderatora
function hasModeratorPermissions(permissions) {
  return (permissions & PERMISSIONS.ADMIN) === PERMISSIONS.ADMIN ||
         (permissions & PERMISSIONS.MANAGE_GUILD) === PERMISSIONS.MANAGE_GUILD ||
         (permissions & PERMISSIONS.MANAGE_ROLES) === PERMISSIONS.MANAGE_ROLES ||
         (permissions & PERMISSIONS.MANAGE_MESSAGES) === PERMISSIONS.MANAGE_MESSAGES;
}

// Middleware do sprawdzania uprawnień na serwerze
function hasGuildPermission(req, res, next) {
  try {
    if (!req.params.guildId) {
      return res.status(400).json({ error: 'Brak ID serwera' });
    }
    
    const guild = req.user.guilds.find(g => g.id === req.params.guildId);
    
    if (!guild) {
      return res.status(403).json({ error: 'Nie masz dostępu do tego serwera' });
    }
    
    // Sprawdź czy użytkownik ma uprawnienia moderatora
    const hasPermission = hasModeratorPermissions(guild.permissions);
    
    if (!hasPermission) {
      return res.status(403).json({ error: 'Nie masz wystarczających uprawnień na tym serwerze' });
    }
    
    // Dodaj informacje o uprawnieniach do obiektu req
    req.userPermissions = {
      isAdmin: (guild.permissions & PERMISSIONS.ADMIN) === PERMISSIONS.ADMIN,
      canManageGuild: (guild.permissions & PERMISSIONS.MANAGE_GUILD) === PERMISSIONS.MANAGE_GUILD,
      canManageRoles: (guild.permissions & PERMISSIONS.MANAGE_ROLES) === PERMISSIONS.MANAGE_ROLES,
      canManageMessages: (guild.permissions & PERMISSIONS.MANAGE_MESSAGES) === PERMISSIONS.MANAGE_MESSAGES
    };
    
    next();
  } catch (error) {
    logger.error(`Błąd w middleware API hasGuildPermission: ${error.stack}`);
    return res.status(500).json({ error: 'Wewnętrzny błąd serwera' });
  }
}

router.get('/', async (req, res) => {
  // Kod filtrowania uprawnień (istniejący kod)...
  
  // Filtrowanie serwerów na podstawie listy autoryzowanych
  const allowedServers = process.env.ALLOWED_GUILD_IDS 
    ? process.env.ALLOWED_GUILD_IDS.split(',').map(id => id.trim())
    : [];
  
  // Sprawdź, które serwery mają bota
  const botGuilds = client.guilds.cache.map(g => g.id);
  
  // Filtruj wyświetlane serwery - jeśli lista autoryzowanych nie jest pusta
  const filteredGuilds = allowedServers.length > 0
    ? allowedGuilds.filter(g => allowedServers.includes(g.id))
    : allowedGuilds;
  
  // Oznacz serwery
  const guilds = filteredGuilds.map(g => ({
    ...g,
    hasBot: botGuilds.includes(g.id),
    isAuthorized: true
  }));
  
  res.render('dashboard/index', {
    user: req.user,
    guilds: guilds,
    ownerContact: process.env.BOT_OWNER_CONTACT || null
  });
});

// Endpoint do włączania/wyłączania logowania wiadomości
router.get('/guilds/:guildId/toggle-message-log/:state', hasGuildPermission, async (req, res) => {
  const { guildId, state } = req.params;
  const enabled = state === 'on';
  
  try {
    logger.info(`Próba ręcznego ${enabled ? 'włączenia' : 'wyłączenia'} logowania wiadomości dla serwera ${guildId}`);
    
    // Pobierz lub utwórz ustawienia serwera
    let guildSettings = await Guild.findOne({ guildId });
    
    if (!guildSettings) {
      guildSettings = new Guild({
        guildId,
        modules: {
          messageLog: false,
          reactionRoles: true,
          notifications: true
        },
        logDeletedOnly: false
      });
      logger.info(`Utworzono nowe ustawienia dla serwera ${guildId}`);
    }
    
    // Upewnij się, że struktura modułów istnieje
    if (!guildSettings.modules) {
      guildSettings.modules = {
        messageLog: false,
        reactionRoles: true,
        notifications: true
      };
      logger.info(`Zainicjalizowano brakującą strukturę modułów dla serwera ${guildId}`);
    }
    
    // Ustaw wartość i zapisz
    guildSettings.modules.messageLog = enabled;
    await guildSettings.save();
    
    logger.info(`Logowanie wiadomości zostało ${enabled ? 'włączone' : 'wyłączone'} dla serwera ${guildId}`);
    logger.debug(`Stan modułów po aktualizacji: ${JSON.stringify(guildSettings.modules)}`);
    
    res.json({
      success: true,
      message: `Logowanie wiadomości zostało ${enabled ? 'włączone' : 'wyłączone'} dla serwera ${guildId}`,
      settings: {
        guildId: guildSettings.guildId,
        modules: guildSettings.modules,
        logDeletedOnly: guildSettings.logDeletedOnly
      }
    });
  } catch (error) {
    logger.error(`Błąd podczas przełączania logowania wiadomości: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas zmiany ustawień'
    });
  }
});
// Endpoint do przełączania trybu logowania tylko usuniętych wiadomości
router.get('/guilds/:guildId/toggle-log-deleted-only/:state', hasGuildPermission, async (req, res) => {
  const { guildId, state } = req.params;
  const deletedOnly = state === 'on';
  
  try {
    logger.info(`Próba ręcznego ${deletedOnly ? 'włączenia' : 'wyłączenia'} trybu logowania tylko usuniętych wiadomości dla serwera ${guildId}`);
    
    // Pobierz lub utwórz ustawienia serwera
    let guildSettings = await Guild.findOne({ guildId });
    
    if (!guildSettings) {
      guildSettings = new Guild({
        guildId,
        modules: {
          messageLog: true,  // Włączamy moduł logowania
          reactionRoles: true,
          notifications: true
        },
        logDeletedOnly: false
      });
    }
    
    // Upewnij się, że struktura modułów istnieje
    if (!guildSettings.modules) {
      guildSettings.modules = {
        messageLog: true,
        reactionRoles: true,
        notifications: true
      };
    }
    
    // Ustaw wartość
    guildSettings.logDeletedOnly = deletedOnly;
    
    // Jeśli włączamy logowanie tylko usuniętych, upewnijmy się że sam moduł logowania jest włączony
    if (deletedOnly && !guildSettings.modules.messageLog) {
      guildSettings.modules.messageLog = true;
      logger.info(`Automatyczne włączenie modułu logowania przy włączaniu trybu "tylko usunięte"`);
    }
    
    await guildSettings.save();
    
    res.json({
      success: true,
      message: `Tryb logowania tylko usuniętych wiadomości został ${deletedOnly ? 'włączony' : 'wyłączony'} dla serwera ${guildId}`,
      settings: {
        guildId: guildSettings.guildId,
        modules: guildSettings.modules,
        logDeletedOnly: guildSettings.logDeletedOnly
      }
    });
  } catch (error) {
    logger.error(`Błąd podczas przełączania trybu logowania tylko usuniętych wiadomości: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas zmiany ustawień'
    });
  }
});

// Wyszukiwanie użytkowników na serwerze
router.get('/guilds/:guildId/search-users', hasGuildPermission, async (req, res) => {
  const { guildId } = req.params;
  const { query } = req.query;
  
  if (!query || query.length < 2) {
    return res.json({
      success: true,
      users: []
    });
  }
  
  try {
    const guild = client.guilds.cache.get(guildId);
    
    if (!guild) {
      return res.status(404).json({
        success: false,
        error: 'Serwer nie został znaleziony'
      });
    }
    
    // Pobierz wszystkich członków
    await guild.members.fetch();
    
    // Wyszukaj użytkowników po nazwie (case-insensitive) lub ID
    const members = guild.members.cache.filter(member => {
      const isIdMatch = member.id.includes(query);
      const isUsernameMatch = member.user.username.toLowerCase().includes(query.toLowerCase());
      const isNicknameMatch = member.nickname?.toLowerCase().includes(query.toLowerCase());
      const isTagMatch = member.user.discriminator.includes(query);
      
      return isIdMatch || isUsernameMatch || isNicknameMatch || isTagMatch;
    });
    
    // Limit do 10 wyników dla wydajności
    const limitedResults = Array.from(members.values()).slice(0, 10);
    
    // Przekształć wyniki do prostszej struktury
    const users = limitedResults.map(member => ({
      id: member.id,
      username: member.user.username,
      displayName: member.nickname || member.user.username,
      discriminator: member.user.discriminator,
      tag: member.user.tag,
      avatar: member.user.displayAvatarURL({ dynamic: true })
    }));
    
    res.json({
      success: true,
      users
    });
  } catch (error) {
    logger.error(`Błąd podczas wyszukiwania użytkowników: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas wyszukiwania użytkowników'
    });
  }
});

// Zaktualizuj ustawienia serwera
router.post('/guilds/:guildId/settings', hasGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  
  try {
    // Logowanie pełnych danych wejściowych dla celów diagnostycznych
    logger.debug(`Aktualizacja ustawień serwera ${guildId}, dane: ${JSON.stringify(req.body)}`);
    
    // Pobierz aktualne ustawienia
    let guildSettings = await Guild.findOne({ guildId: guildId });
    
    // Jeśli nie ma, utwórz nowe
    if (!guildSettings) {
      guildSettings = new Guild({ 
        guildId: guildId,
        modules: {
          reactionRoles: true,
          notifications: true,
          messageLog: false
        },
        logDeletedOnly: false
      });
      logger.info(`Utworzono nowe ustawienia dla serwera ${guildId}`);
    }
    
    // Upewnij się, że struktura modułów istnieje
    if (!guildSettings.modules) {
      guildSettings.modules = {
        reactionRoles: true,
        notifications: true,
        messageLog: false
      };
    }
    
    // Aktualizuj ustawienia podstawowe
    if (req.body.prefix !== undefined) guildSettings.prefix = req.body.prefix;
    if (req.body.welcomeChannel !== undefined) guildSettings.welcomeChannel = req.body.welcomeChannel;
    if (req.body.notificationChannel !== undefined) guildSettings.notificationChannel = req.body.notificationChannel;
    if (req.body.messageLogChannel !== undefined) guildSettings.messageLogChannel = req.body.messageLogChannel;
    if (req.body.language !== undefined) guildSettings.language = req.body.language;
    
    // UWAGA: Kluczowa poprawka - prawidłowa konwersja i przypisanie do zagnieżdżonych pól
    
    // Dodaj obsługę ustawień przywracania ról
    if (req.body.restoreRoles !== undefined) {
      guildSettings.restoreRoles = safelyConvertToBoolean(req.body.restoreRoles);
      logger.debug(`Ustawiono restoreRoles na ${guildSettings.restoreRoles}`);
    }

    if (req.body.roleExpiryDays !== undefined) {
      guildSettings.roleExpiryDays = parseInt(req.body.roleExpiryDays, 10) || 0;
      logger.debug(`Ustawiono roleExpiryDays na ${guildSettings.roleExpiryDays}`);
    }
    // Funkcja do bezpiecznej konwersji na wartość boolean
    function safelyConvertToBoolean(value) {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') return value.toLowerCase() === 'true';
      if (typeof value === 'number') return value !== 0;
      return false;
    }
    
    // Obsługa modułu messageLog - kluczowa poprawka!
    if (req.body.messageLog !== undefined) {
      // Konwertuj wartość i przypisz do właściwej zagnieżdżonej ścieżki
      const messageLogEnabled = safelyConvertToBoolean(req.body.messageLog);
      guildSettings.modules.messageLog = messageLogEnabled;
      logger.debug(`Ustawiono modules.messageLog na ${messageLogEnabled} (z pola messageLog: ${req.body.messageLog})`);
    }
    
    // Dodatkowa obsługa dla alternatywnej nazwy pola (dla kompatybilności)
    if (req.body['modules.messageLog'] !== undefined) {
      const messageLogEnabled = safelyConvertToBoolean(req.body['modules.messageLog']);
      guildSettings.modules.messageLog = messageLogEnabled;
      logger.debug(`Ustawiono modules.messageLog na ${messageLogEnabled} (z pola 'modules.messageLog': ${req.body['modules.messageLog']})`);
    }
    
    // Obsługa reactionRoles
    if (req.body.reactionRoles !== undefined) {
      guildSettings.modules.reactionRoles = safelyConvertToBoolean(req.body.reactionRoles);
      logger.debug(`Ustawiono modules.reactionRoles na ${guildSettings.modules.reactionRoles}`);
    }
    
    // Alternatywna nazwa dla reactionRoles
    if (req.body['modules.reactionRoles'] !== undefined) {
      guildSettings.modules.reactionRoles = safelyConvertToBoolean(req.body['modules.reactionRoles']);
      logger.debug(`Ustawiono modules.reactionRoles na ${guildSettings.modules.reactionRoles}`);
    }
    
    // Obsługa notifications
    if (req.body.notifications !== undefined) {
      guildSettings.modules.notifications = safelyConvertToBoolean(req.body.notifications);
    }
    
    // Alternatywna nazwa dla notifications
    if (req.body.notificationsEnabled !== undefined) {
      guildSettings.modules.notifications = safelyConvertToBoolean(req.body.notificationsEnabled);
    }
    
    if (req.body['modules.notifications'] !== undefined) {
      guildSettings.modules.notifications = safelyConvertToBoolean(req.body['modules.notifications']);
    }
    
    // Obsługa logDeletedOnly
    if (req.body.logDeletedOnly !== undefined) {
      guildSettings.logDeletedOnly = safelyConvertToBoolean(req.body.logDeletedOnly);
      logger.debug(`Ustawiono logDeletedOnly na ${guildSettings.logDeletedOnly}`);
    }
    
    // Zapisz zmiany
    await guildSettings.save();
    
    // Loguj finalne ustawienia
    logger.info(`Zaktualizowano ustawienia serwera ${guildId}`);
    logger.debug(`Stan modułów po aktualizacji: ${JSON.stringify(guildSettings.modules)}`);
    
    res.json({
      success: true,
      message: 'Ustawienia zostały zaktualizowane',
      settings: guildSettings
    });
  } catch (error) {
    logger.error(`Błąd podczas aktualizacji ustawień: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas aktualizacji ustawień'
    });
  }
});

// Zastąp również endpoint toggle-message-log

router.get('/guilds/:guildId/toggle-message-log/:state', hasGuildPermission, async (req, res) => {
  const { guildId, state } = req.params;
  const enabled = state === 'on';
  
  try {
    logger.info(`Próba ręcznego ${enabled ? 'włączenia' : 'wyłączenia'} logowania wiadomości dla serwera ${guildId}`);
    
    // Pobierz lub utwórz ustawienia serwera
    let guildSettings = await Guild.findOne({ guildId });
    
    if (!guildSettings) {
      guildSettings = new Guild({
        guildId,
        modules: {
          messageLog: false,
          reactionRoles: true,
          notifications: true
        },
        logDeletedOnly: false
      });
    }
    
    // Upewnij się, że struktura modułów istnieje
    if (!guildSettings.modules) {
      guildSettings.modules = {};
    }
    
    // Ustaw wartość bezpośrednio na zagnieżdżonym polu
    guildSettings.modules.messageLog = enabled;
    
    // Zapisz zmiany
    await guildSettings.save();
    
    // Sprawdź czy ustawienia zostały zapisane prawidłowo
    const updatedSettings = await Guild.findOne({ guildId });
    logger.debug(`Sprawdzenie po zapisie - messageLog=${updatedSettings.modules.messageLog}`);
    
    res.json({
      success: true,
      message: `Logowanie wiadomości zostało ${enabled ? 'włączone' : 'wyłączone'} dla serwera ${guildId}`,
      settings: {
        guildId: guildSettings.guildId,
        modules: guildSettings.modules,
        logDeletedOnly: guildSettings.logDeletedOnly
      }
    });
  } catch (error) {
    logger.error(`Błąd podczas przełączania logowania wiadomości: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas zmiany ustawień'
    });
  }
});

// Endpoint do pobierania statystyk logów wiadomości
router.get('/guilds/:guildId/message-logs/stats', hasGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  
  try {
    // Pobierz statystyki z bazy danych
    const totalMessages = await MessageLog.countDocuments({ guildId });
    const deletedMessages = await MessageLog.countDocuments({ guildId, deletedAt: { $ne: null } });
    const editedMessages = await MessageLog.countDocuments({ guildId, editedAt: { $ne: null } });
    
    // Oblicz liczbę załączników
    const logsWithAttachments = await MessageLog.find({ 
      guildId, 
      'attachments.0': { $exists: true } 
    });
    
    let attachmentsCount = 0;
    for (const log of logsWithAttachments) {
      attachmentsCount += log.attachments.length;
    }
    
    res.json({
      success: true,
      stats: {
        totalMessages,
        deletedMessages,
        editedMessages,
        attachmentsCount
      }
    });
  } catch (error) {
    logger.error(`Błąd podczas pobierania statystyk logów: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas pobierania statystyk logów'
    });
  }
});

// Endpoint do usuwania reakcji z wiadomości
router.delete('/guilds/:guildId/messages/:messageId/reactions/:emojiName', hasGuildPermission, async (req, res) => {
  const { guildId, messageId, emojiName } = req.params;
  const emojiId = req.query.id;
  
  try {
    // Znajdź wiadomość w logach
    const messageLog = await MessageLog.findOne({ guildId, messageId });
    
    if (!messageLog) {
      return res.status(404).json({ success: false, error: 'Wiadomość nie została znaleziona' });
    }
    
    // Znajdź reakcję do usunięcia
    const reactionIndex = messageLog.reactions.findIndex(r => 
      (emojiId && r.id === emojiId) || (!emojiId && r.name === emojiName)
    );
    
    if (reactionIndex === -1) {
      return res.status(404).json({ success: false, error: 'Reakcja nie została znaleziona' });
    }
    
    // Usuń reakcję
    messageLog.reactions.splice(reactionIndex, 1);
    await messageLog.save();
    
    // Spróbuj usunąć reakcję na Discordzie
    try {
      const guild = client.guilds.cache.get(guildId);
      if (guild) {
        const channel = guild.channels.cache.get(messageLog.channelId);
        if (channel) {
          const message = await channel.messages.fetch(messageId).catch(() => null);
          if (message) {
            // Znajdź odpowiednią reakcję
            const emojiToRemove = emojiId ? `${emojiName}:${emojiId}` : emojiName;
            const reaction = message.reactions.cache.get(emojiToRemove);
            if (reaction) {
              await reaction.remove();
            }
          }
        }
      }
    } catch (discordError) {
      logger.warn(`Nie można usunąć reakcji na Discordzie: ${discordError.message}`);
      // Kontynuuj, reakcja została usunięta z bazy danych
    }
    
    res.json({
      success: true,
      message: 'Reakcja została usunięta'
    });
  } catch (error) {
    logger.error(`Błąd podczas usuwania reakcji: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas usuwania reakcji'
    });
  }
});


router.post('/guilds/:guildId/reaction-roles/:messageId/reset', hasGuildPermission, async (req, res) => {
  const { guildId, messageId } = req.params;
  
  try {
    // Znajdź konfigurację w bazie danych
    const reactionRole = await ReactionRole.findOne({
      guildId: guildId,
      messageId: messageId
    });
    
    if (!reactionRole) {
      return res.status(404).json({
        success: false,
        error: 'Nie znaleziono konfiguracji reaction roles dla tej wiadomości'
      });
    }
    
    // Pobierz wiadomość i usuń wszystkie reakcje
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({
        success: false,
        error: 'Nie znaleziono serwera'
      });
    }
    
    const channel = guild.channels.cache.get(reactionRole.channelId);
    if (!channel) {
      return res.status(404).json({
        success: false,
        error: 'Nie znaleziono kanału'
      });
    }
    
    // Pobierz wiadomość
    const message = await channel.messages.fetch(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Nie znaleziono wiadomości'
      });
    }
    
    // Usuń wszystkie reakcje
    await message.reactions.removeAll();
    
    // Dodaj ponownie wszystkie reakcje
    for (const role of reactionRole.roles) {
      await message.react(role.emoji);
    }
    
    res.json({
      success: true,
      message: 'Zresetowano reakcje dla wiadomości'
    });
  } catch (error) {
    logger.error(`Błąd podczas resetowania reakcji: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas resetowania reakcji'
    });
  }
});

// Endpoint testowy do włączania/wyłączania logowania wiadomości
router.get('/guilds/:guildId/toggle-message-log/:state', hasGuildPermission, async (req, res) => {
  const { guildId, state } = req.params;
  const enabled = state === 'on';
  
  try {
    logger.info(`Próba ręcznego ${enabled ? 'włączenia' : 'wyłączenia'} logowania wiadomości dla serwera ${guildId}`);
    
    // Pobierz lub utwórz ustawienia serwera
    let guildSettings = await Guild.findOne({ guildId });
    
    if (!guildSettings) {
      guildSettings = new Guild({
        guildId,
        modules: {
          messageLog: false
        }
      });
    }
    
    // Upewnij się, że struktura modułów istnieje
    if (!guildSettings.modules) {
      guildSettings.modules = {};
    }
    
    // Ustaw wartość
    guildSettings.modules.messageLog = enabled;
    await guildSettings.save();
    
    res.json({
      success: true,
      message: `Logowanie wiadomości zostało ${enabled ? 'włączone' : 'wyłączone'} dla serwera ${guildId}`,
      settings: {
        guildId: guildSettings.guildId,
        modules: guildSettings.modules
      }
    });
  } catch (error) {
    logger.error(`Błąd podczas przełączania logowania wiadomości: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas zmiany ustawień'
    });
  }
});

module.exports = router;

// Tworzenie nowej wiadomości z reaction roles
router.post('/guilds/:guildId/reaction-roles', hasGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const { channelId, title, description } = req.body;
  
  try {
    // Sprawdź, czy kanał istnieje
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({ success: false, error: 'Serwer nie został znaleziony' });
    }
    
    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      return res.status(404).json({ success: false, error: 'Kanał nie został znaleziony' });
    }
    
    // Stwórz embed
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor('#3498db')
      .setFooter({ text: 'Kliknij na reakcję, aby otrzymać rolę!' });
    
    // Wyślij wiadomość
    const message = await channel.send({ embeds: [embed] });
    
    // Zapisz w bazie danych
    const reactionRole = await ReactionRole.create({
      guildId: guildId,
      messageId: message.id,
      channelId: channelId,
      title: title,
      description: description,
      roles: []
    });
    
    logger.info(`Utworzono nową wiadomość reaction roles na serwerze ${guildId}, kanał ${channelId}`);
    
    res.json({
      success: true,
      message: 'Wiadomość z rolami reakcji została utworzona',
      reactionRole: reactionRole
    });
  } catch (error) {
    logger.error(`Błąd podczas tworzenia reaction roles: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas tworzenia reaction roles'
    });
  }
});

// Ten kod zastępuje funkcję obsługi zapisywania ustawień w src/web/routes/api.js

// Zaktualizuj endpoint do zapisywania ustawień serwera
router.post('/guilds/:guildId/settings', hasGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  
  try {
    // Logowanie pełnych danych wejściowych dla celów diagnostycznych
    logger.debug(`Aktualizacja ustawień serwera ${guildId}, dane: ${JSON.stringify(req.body)}`);
    
    // Pobierz aktualne ustawienia
    let guildSettings = await Guild.findOne({ guildId: guildId });
    
    // Jeśli nie ma, utwórz nowe
    if (!guildSettings) {
      guildSettings = new Guild({ 
        guildId: guildId,
        modules: {
          reactionRoles: true,
          notifications: true,
          messageLog: false
        },
        logDeletedOnly: false
      });
      logger.info(`Utworzono nowe ustawienia dla serwera ${guildId}`);
    }
    
    // Upewnij się, że struktura modułów istnieje
    if (!guildSettings.modules) {
      guildSettings.modules = {
        reactionRoles: true,
        notifications: true,
        messageLog: false
      };
      logger.debug("Utworzono domyślną strukturę modułów, bo nie istniała");
    }
    
    // Aktualizuj ustawienia podstawowe
    if (req.body.prefix !== undefined) guildSettings.prefix = req.body.prefix;
    if (req.body.welcomeChannel !== undefined) guildSettings.welcomeChannel = req.body.welcomeChannel;
    if (req.body.notificationChannel !== undefined) guildSettings.notificationChannel = req.body.notificationChannel;
    if (req.body.messageLogChannel !== undefined) guildSettings.messageLogChannel = req.body.messageLogChannel;
    if (req.body.language !== undefined) guildSettings.language = req.body.language;
    
    // Funkcja do bezpiecznej konwersji na wartość boolean
    function safelyConvertToBoolean(value) {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') return value.toLowerCase() === 'true';
      if (typeof value === 'number') return value !== 0;
      return false;
    }
    
    // KLUCZOWA POPRAWKA: Bezpośrednia aktualizacja pól zagnieżdżonych
    // Obsługa messageLog
    if (req.body.messageLog !== undefined) {
      const messageLogEnabled = safelyConvertToBoolean(req.body.messageLog);
      // Upewnij się, że obiekt modules istnieje przed przypisaniem
      if (!guildSettings.modules) guildSettings.modules = {};
      guildSettings.modules.messageLog = messageLogEnabled;
      logger.debug(`Ustawiono modules.messageLog=${messageLogEnabled} (typ: ${typeof messageLogEnabled})`);
    }
    
    // Obsługa reactionRoles
    if (req.body.reactionRoles !== undefined) {
      const reactionRolesEnabled = safelyConvertToBoolean(req.body.reactionRoles);
      // Upewnij się, że obiekt modules istnieje przed przypisaniem
      if (!guildSettings.modules) guildSettings.modules = {};
      guildSettings.modules.reactionRoles = reactionRolesEnabled;
      logger.debug(`Ustawiono modules.reactionRoles=${reactionRolesEnabled} (typ: ${typeof reactionRolesEnabled})`);
    }
    
    // Obsługa notifications
    if (req.body.notifications !== undefined || req.body.notificationsEnabled !== undefined) {
      const notificationsEnabled = safelyConvertToBoolean(
        req.body.notifications !== undefined ? req.body.notifications : req.body.notificationsEnabled
      );
      // Upewnij się, że obiekt modules istnieje przed przypisaniem
      if (!guildSettings.modules) guildSettings.modules = {};
      guildSettings.modules.notifications = notificationsEnabled;
      logger.debug(`Ustawiono modules.notifications=${notificationsEnabled} (typ: ${typeof notificationsEnabled})`);
    }
    
    // Obsługa logDeletedOnly
    if (req.body.logDeletedOnly !== undefined) {
      guildSettings.logDeletedOnly = safelyConvertToBoolean(req.body.logDeletedOnly);
      logger.debug(`Ustawiono logDeletedOnly=${guildSettings.logDeletedOnly} (typ: ${typeof guildSettings.logDeletedOnly})`);
    }
    
    // DODAJ TU DODATKOWE SPRAWDZENIA DEBUGOWANIA
    logger.debug("Stan modułów przed zapisem:", JSON.stringify(guildSettings.modules));
    logger.debug("Pełne ustawienia przed zapisem:", JSON.stringify(guildSettings.toObject()));
    
    // Dodaj sprawdzenie czy obiekt jest valid przed zapisem
    const validationError = guildSettings.validateSync();
    if (validationError) {
      logger.error(`Błąd walidacji modelu: ${JSON.stringify(validationError)}`);
      return res.status(400).json({
        success: false,
        error: 'Nieprawidłowe dane: ' + validationError.message
      });
    }
    
    // Zapisz zmiany - używając metody markModified dla zagnieżdżonych obiektów
    guildSettings.markModified('modules');
    await guildSettings.save();
    
    // Zweryfikuj zapisane dane
    const verifiedSettings = await Guild.findOne({ guildId: guildId });
    logger.debug(`Zweryfikowane dane po zapisie: ${JSON.stringify(verifiedSettings)}`);
    
    // Loguj finalne ustawienia
    logger.info(`Zaktualizowano ustawienia serwera ${guildId}`);
    logger.debug(`Stan modułów po aktualizacji: ${JSON.stringify(verifiedSettings?.modules)}`);
    
    res.json({
      success: true,
      message: 'Ustawienia zostały zaktualizowane',
      settings: guildSettings
    });
  } catch (error) {
    logger.error(`Błąd podczas aktualizacji ustawień: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas aktualizacji ustawień: ' + error.message
    });
  }
});

// Dodawanie roli do istniejącej wiadomości
router.post('/guilds/:guildId/reaction-roles/:messageId/roles', hasGuildPermission, async (req, res) => {
  const { guildId, messageId } = req.params;
  const { roleId, emoji, notificationEnabled } = req.body;
  
  try {
    // Znajdź reaction role w bazie danych
    const reactionRole = await ReactionRole.findOne({
      guildId: guildId,
      messageId: messageId
    });
    
    if (!reactionRole) {
      return res.status(404).json({ success: false, error: 'Wiadomość nie została znaleziona' });
    }
    
    // Sprawdź, czy emoji jest już używane
    if (reactionRole.roles.some(r => r.emoji === emoji)) {
      return res.status(400).json({ success: false, error: 'To emoji jest już używane w tej wiadomości' });
    }
    
    // Sprawdź, czy rola istnieje
    const guild = client.guilds.cache.get(guildId);
    const role = guild.roles.cache.get(roleId);
    
    if (!role) {
      return res.status(404).json({ success: false, error: 'Rola nie została znaleziona' });
    }
    
    // Dodaj rolę do bazy danych
    reactionRole.roles.push({
      emoji: emoji,
      roleId: roleId,
      notificationEnabled: notificationEnabled === 'true'
    });
    
    await reactionRole.save();
    
    // Dodaj reakcję do wiadomości i zaktualizuj embed
    const channel = guild.channels.cache.get(reactionRole.channelId);
    const message = await channel.messages.fetch(messageId);
    
    await message.react(emoji);
    
    // Aktualizuj embed
    const embed = EmbedBuilder.from(message.embeds[0]);
    
    // Dodaj lub zaktualizuj pole z rolami
    const rolesList = reactionRole.roles.map(r => 
      `${r.emoji} - <@&${r.roleId}>${r.notificationEnabled ? ' (z powiadomieniem)' : ''}`
    ).join('\n');
    
    if (embed.data.fields && embed.data.fields.find(f => f.name === 'Dostępne role')) {
      const fieldIndex = embed.data.fields.findIndex(f => f.name === 'Dostępne role');
      embed.data.fields[fieldIndex] = { name: 'Dostępne role', value: rolesList };
    } else {
      embed.addFields({ name: 'Dostępne role', value: rolesList });
    }
    
    await message.edit({ embeds: [embed] });
    
    logger.info(`Dodano rolę ${roleId} z emoji ${emoji} do wiadomości ${messageId} na serwerze ${guildId}`);
    
    res.json({
      success: true,
      message: 'Rola została dodana',
      role: {
        emoji: emoji,
        roleId: roleId,
        roleName: role.name,
        notificationEnabled: notificationEnabled === 'true'
      }
    });
  } catch (error) {
    logger.error(`Błąd podczas dodawania roli: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas dodawania roli'
    });
  }
});

router.get('/guilds/:guildId/toggle-message-log/:state', hasGuildPermission, async (req, res) => {
  const { guildId, state } = req.params;
  const enabled = state === 'on';
  
  try {
    logger.info(`Próba ręcznego ${enabled ? 'włączenia' : 'wyłączenia'} logowania wiadomości dla serwera ${guildId}`);
    
    // Pobierz lub utwórz ustawienia serwera
    let guildSettings = await Guild.findOne({ guildId });
    
    if (!guildSettings) {
      guildSettings = new Guild({
        guildId,
        modules: {
          messageLog: false,
          reactionRoles: true,
          notifications: true
        },
        logDeletedOnly: false
      });
      logger.info(`Utworzono nowe ustawienia dla serwera ${guildId}`);
    }
    
    // Upewnij się, że struktura modułów istnieje
    if (!guildSettings.modules) {
      guildSettings.modules = {
        messageLog: false,
        reactionRoles: true,
        notifications: true
      };
      logger.info(`Zainicjalizowano brakującą strukturę modułów dla serwera ${guildId}`);
    }
    
    // KLUCZOWA POPRAWKA: Bezpośrednia aktualizacja pola messageLog w obiekcie modules
    guildSettings.modules.messageLog = enabled;
    
    // Oznacz obiekt modules jako zmodyfikowany dla mongoose
    guildSettings.markModified('modules');
    
    // Zapisz zmiany
    await guildSettings.save();
    
    // Sprawdź czy ustawienia zostały zapisane prawidłowo
    const updatedSettings = await Guild.findOne({ guildId });
    logger.debug(`Sprawdzenie po zapisie - messageLog=${updatedSettings.modules?.messageLog}`);
    
    res.json({
      success: true,
      message: `Logowanie wiadomości zostało ${enabled ? 'włączone' : 'wyłączone'} dla serwera ${guildId}`,
      settings: {
        guildId: guildSettings.guildId,
        modules: guildSettings.modules,
        logDeletedOnly: guildSettings.logDeletedOnly
      }
    });
  } catch (error) {
    logger.error(`Błąd podczas przełączania logowania wiadomości: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas zmiany ustawień: ' + error.message
    });
  }
});

// Dodajmy nowy endpoint do przełączania trybu logowania tylko usuniętych wiadomości
router.get('/guilds/:guildId/toggle-log-deleted-only/:state', hasGuildPermission, async (req, res) => {
  const { guildId, state } = req.params;
  const deletedOnly = state === 'on';
  
  try {
    logger.info(`Próba ręcznego ${deletedOnly ? 'włączenia' : 'wyłączenia'} trybu logowania tylko usuniętych wiadomości dla serwera ${guildId}`);
    
    // Pobierz lub utwórz ustawienia serwera
    let guildSettings = await Guild.findOne({ guildId });
    
    if (!guildSettings) {
      guildSettings = new Guild({
        guildId,
        modules: {
          messageLog: false
        },
        logDeletedOnly: false
      });
    }
    
    // Ustaw wartość
    guildSettings.logDeletedOnly = deletedOnly;
    await guildSettings.save();
    
    res.json({
      success: true,
      message: `Tryb logowania tylko usuniętych wiadomości został ${deletedOnly ? 'włączony' : 'wyłączony'} dla serwera ${guildId}`,
      settings: {
        guildId: guildSettings.guildId,
        modules: guildSettings.modules,
        logDeletedOnly: guildSettings.logDeletedOnly
      }
    });
  } catch (error) {
    logger.error(`Błąd podczas przełączania trybu logowania tylko usuniętych wiadomości: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas zmiany ustawień'
    });
  }
});

// Usuwanie roli z wiadomości
router.delete('/guilds/:guildId/reaction-roles/:messageId/roles/:emoji', hasGuildPermission, async (req, res) => {
  const { guildId, messageId, emoji } = req.params;
  
  try {
    // Znajdź reaction role w bazie danych
    const reactionRole = await ReactionRole.findOne({
      guildId: guildId,
      messageId: messageId
    });
    
    if (!reactionRole) {
      return res.status(404).json({ success: false, error: 'Wiadomość nie została znaleziona' });
    }
    
    // Znajdź indeks roli z podanym emoji
    const roleIndex = reactionRole.roles.findIndex(r => r.emoji === emoji);
    
    if (roleIndex === -1) {
      return res.status(404).json({ success: false, error: 'Rola z tym emoji nie została znaleziona' });
    }
    
    // Usuń rolę z bazy danych
    const removedRole = reactionRole.roles.splice(roleIndex, 1)[0];
    await reactionRole.save();
    
    // Usuń reakcję z wiadomości i zaktualizuj embed
    const guild = client.guilds.cache.get(guildId);
    const channel = guild.channels.cache.get(reactionRole.channelId);
    const message = await channel.messages.fetch(messageId);
    
    // Znajdź i usuń reakcję
    const reaction = message.reactions.cache.find(r => r.emoji.name === emoji || r.emoji.id === emoji);
    if (reaction) await reaction.remove();
    
    // Aktualizuj embed
    const embed = EmbedBuilder.from(message.embeds[0]);
    
    // Zaktualizuj pole z rolami
    if (reactionRole.roles.length > 0) {
      const rolesList = reactionRole.roles.map(r => 
        `${r.emoji} - <@&${r.roleId}>${r.notificationEnabled ? ' (z powiadomieniem)' : ''}`
      ).join('\n');
      
      if (embed.data.fields && embed.data.fields.find(f => f.name === 'Dostępne role')) {
        const fieldIndex = embed.data.fields.findIndex(f => f.name === 'Dostępne role');
        embed.data.fields[fieldIndex] = { name: 'Dostępne role', value: rolesList };
      }
    } else {
      // Usuń pole jeśli nie ma już żadnych ról
      if (embed.data.fields) {
        const fieldIndex = embed.data.fields.findIndex(f => f.name === 'Dostępne role');
        if (fieldIndex !== -1) {
          embed.data.fields.splice(fieldIndex, 1);
        }
      }
    }
    
    await message.edit({ embeds: [embed] });
    
    logger.info(`Usunięto rolę z emoji ${emoji} z wiadomości ${messageId} na serwerze ${guildId}`);
    
    res.json({
      success: true,
      message: 'Rola została usunięta',
      removedRole: {
        emoji: removedRole.emoji,
        roleId: removedRole.roleId
      }
    });
  } catch (error) {
    logger.error(`Błąd podczas usuwania roli: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas usuwania roli'
    });
  }
});

// Usuwanie całej wiadomości z reaction roles
router.delete('/guilds/:guildId/reaction-roles/:messageId', hasGuildPermission, async (req, res) => {
  const { guildId, messageId } = req.params;
  
  try {
    // Znajdź reaction role w bazie danych
    const reactionRole = await ReactionRole.findOneAndDelete({
      guildId: guildId,
      messageId: messageId
    });
    
    if (!reactionRole) {
      return res.status(404).json({ success: false, error: 'Wiadomość nie została znaleziona' });
    }
    
    // Usuń wiadomość z Discorda
    try {
      const guild = client.guilds.cache.get(guildId);
      const channel = guild.channels.cache.get(reactionRole.channelId);
      const message = await channel.messages.fetch(messageId);
      await message.delete();
      
      logger.info(`Usunięto wiadomość reaction roles ${messageId} na serwerze ${guildId}`);
    } catch (error) {
      logger.warn(`Nie można usunąć wiadomości Discord: ${error.message}`);
      // Kontynuuj, ponieważ mogła zostać już usunięta ręcznie
    }
    
    res.json({
      success: true,
      message: 'Wiadomość z rolami reakcji została usunięta'
    });
  } catch (error) {
    logger.error(`Błąd podczas usuwania reaction roles: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas usuwania reaction roles'
    });
  }
});

// Pobieranie logów wiadomości
router.get('/guilds/:guildId/message-logs', hasGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const { userId, userQuery, channelId, status, logType, contentSearch, 
          dateRange, hasAttachments, hasReactions, page = 1, limit = 10 } = req.query;
  
  try {
    // Buduj filtr wyszukiwania
    const filter = { guildId };
    // --- POPRAWKA: Filtrowanie po użytkowniku ---
    if (userId) {
      filter.authorId = userId;
    } else if (userQuery) {
      const guild = client.guilds.cache.get(guildId);
      let found = false;
      if (guild) {
        try {
          const members = await guild.members.fetch();
          const matchingMembers = members.filter(member => 
            member.user.username.toLowerCase().includes(userQuery.toLowerCase()) ||
            (member.nickname && member.nickname.toLowerCase().includes(userQuery.toLowerCase())) ||
            member.user.tag.toLowerCase().includes(userQuery.toLowerCase()) ||
            member.id.includes(userQuery)
          );
          if (matchingMembers.size > 0) {
            const userIds = matchingMembers.map(member => member.id);
            filter.authorId = userIds.length === 1 ? userIds[0] : { $in: userIds };
            found = true;
            logger.debug(`Znaleziono ${userIds.length} użytkowników pasujących do zapytania "${userQuery}"`);
          }
        } catch (error) {
          logger.error(`Błąd podczas wyszukiwania użytkowników: ${error.message}`);
        }
      }
      // Jeśli nie znaleziono użytkownika na serwerze, spróbuj potraktować query jako ID
      if (!found) {
        filter.authorId = userQuery;
      }
    }
    // --- KONIEC POPRAWKI ---
    if (channelId) filter.channelId = channelId;
    if (status) {
      if (status === 'deleted') filter.deletedAt = { $ne: null };
      else if (status === 'edited') filter.editedAt = { $ne: null };
      else if (status === 'created') {
        filter.deletedAt = null;
        filter.editedAt = null;
      }
    }
    // --- POPRAWKA: Filtrowanie po typie logu ---
    if (logType && logType !== 'all') {
      if (logType === 'message') {
        filter.$and = [
          { $or: [ { modActions: { $exists: false } }, { modActions: { $size: 0 } } ] },
          { $or: [ { channelLogs: { $exists: false } }, { channelLogs: { $size: 0 } } ] },
          { $or: [ { threadLogs: { $exists: false } }, { threadLogs: { $size: 0 } } ] },
          { $or: [ { nicknameChanges: { $exists: false } }, { nicknameChanges: { $size: 0 } } ] },
          { $or: [ { roleChanges: { $exists: false } }, { roleChanges: { $size: 0 } } ] }
        ];
      } else if (logType === 'member') {
        filter.$or = [
          { modActions: { $exists: true, $ne: [] } },
          { nicknameChanges: { $exists: true, $ne: [] } },
          { roleChanges: { $exists: true, $ne: [] } }
        ];
      } else if (logType === 'channel') {
        filter.channelLogs = { $exists: true, $ne: [] };
      } else if (logType === 'thread') {
        filter.threadLogs = { $exists: true, $ne: [] };
      } else if (logType === 'role') {
        filter.roleChanges = { $exists: true, $ne: [] };
      }
    }
    // --- KONIEC POPRAWKI ---
    if (contentSearch) filter.content = { $regex: contentSearch, $options: 'i' };
    if (dateRange) {
      const now = new Date();
      let startDate;
      if (dateRange === 'today') startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      else if (dateRange === 'yesterday') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        filter.createdAt = { $gte: startDate, $lt: endDate };
      } else if (dateRange === 'week') startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      else if (dateRange === 'month') startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      if (startDate && dateRange !== 'yesterday') filter.createdAt = { $gte: startDate };
    }
    // --- POPRAWKA: Filtrowanie po załącznikach/reakcjach ---
    if (hasAttachments) {
      if (hasAttachments === 'yes') filter['attachments.0'] = { $exists: true };
      else if (hasAttachments === 'no') {
        filter.$or = [
          { attachments: { $exists: false } },
          { attachments: { $size: 0 } }
        ];
      }
    }
    if (hasReactions) {
      if (hasReactions === 'yes') filter['reactions.0'] = { $exists: true };
      else if (hasReactions === 'no') {
        filter.$or = [
          { reactions: { $exists: false } },
          { reactions: { $size: 0 } }
        ];
      }
    }
    logger.debug(`Filtr wyszukiwania logów: ${JSON.stringify(filter)}`);
    // --- POPRAWKA: Helper do inicjalizacji tablic ---
    function ensureArrays(log) {
      log.attachments = Array.isArray(log.attachments) ? log.attachments : [];
      log.embeds = Array.isArray(log.embeds) ? log.embeds : [];
      log.reactions = Array.isArray(log.reactions) ? log.reactions : [];
      log.stickers = Array.isArray(log.stickers) ? log.stickers : [];
      log.modActions = Array.isArray(log.modActions) ? log.modActions : [];
      log.nicknameChanges = Array.isArray(log.nicknameChanges) ? log.nicknameChanges : [];
      log.roleChanges = Array.isArray(log.roleChanges) ? log.roleChanges : [];
      log.channelLogs = Array.isArray(log.channelLogs) ? log.channelLogs : [];
      log.threadLogs = Array.isArray(log.threadLogs) ? log.threadLogs : [];
      return log;
    }
    // --- KONIEC POPRAWKI ---
    // Pobierz dane z paginacją
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const logs = await MessageLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    const totalDocs = await MessageLog.countDocuments(filter);
    const totalPages = Math.ceil(totalDocs / parseInt(limit));
    logger.debug(`Znaleziono ${logs.length} logów, totalDocs: ${totalDocs}, totalPages: ${totalPages}`);
    // Pobierz informacje o kanałach i użytkownikach dla wygodnego renderowania
    const guild = client.guilds.cache.get(guildId);
    const channels = {};
    const users = {};
    if (guild) {
      guild.channels.cache.forEach(channel => {
        if (channel.type === 0) {
          channels[channel.id] = channel.name;
        }
      });
      const uniqueUserIds = [...new Set(logs.map(log => log.authorId))];
      for (const userId of uniqueUserIds) {
        try {
          const member = await guild.members.fetch(userId).catch(() => null);
          if (member) {
            users[userId] = {
              username: member.user.tag,
              avatar: member.user.displayAvatarURL({ dynamic: true })
            };
          }
        } catch (error) {
          users[userId] = null;
        }
      }
    }
    // --- POPRAWKA: Zainicjalizuj tablice w każdym logu ---
    const safeLogs = logs.map(ensureArrays);
    // --- KONIEC POPRAWKI ---
    res.json({
      success: true,
      logs: safeLogs,
      page: parseInt(page),
      totalPages,
      totalDocs,
      channels,
      users
    });
  } catch (error) {
    logger.error(`Błąd podczas pobierania logów wiadomości: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas pobierania logów wiadomości'
    });
  }
});

// Pobieranie szczegółów konkretnego logu wiadomości
router.get('/guilds/:guildId/message-logs/:logId', hasGuildPermission, async (req, res) => {
  const { guildId, logId } = req.params;
  
  try {
    logger.debug(`Pobieranie szczegółów logu wiadomości ${logId} na serwerze ${guildId}`);
    
    // Pobierz szczegóły logu
    const log = await MessageLog.findById(logId);
    
    if (!log || log.guildId !== guildId) {
      logger.warn(`Nie znaleziono logu wiadomości ${logId} dla serwera ${guildId}`);
      return res.status(404).json({
        success: false,
        error: 'Nie znaleziono logu wiadomości'
      });
    }
    
    // Pobierz informacje o kanale i użytkowniku
    const guild = client.guilds.cache.get(guildId);
    const channels = {};
    const users = {};
    
    if (guild) {
      // Wypełnij informacje o kanałach
      guild.channels.cache.forEach(channel => {
        if (channel.type === 0) { // Tylko kanały tekstowe
          channels[channel.id] = channel.name;
        }
      });
      
      // Pobierz informacje o użytkowniku
      try {
        const user = await guild.members.fetch(log.authorId).then(member => member.user);
        users[log.authorId] = {
          username: user.tag,
          avatar: user.displayAvatarURL({ dynamic: true })
        };
      } catch (error) {
        // Użytkownik mógł opuścić serwer
        logger.debug(`Nie można znaleźć użytkownika ${log.authorId}: ${error.message}`);
        users[log.authorId] = null;
      }
    }
    
    res.json({
      success: true,
      log,
      channels,
      users
    });
  } catch (error) {
    logger.error(`Błąd podczas pobierania szczegółów logu wiadomości: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas pobierania szczegółów logu wiadomości'
    });
  }
});

// Pobieranie listy konkursów
router.get('/guilds/:guildId/giveaways', hasGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  
  try {
    const { client } = require('../../bot');
    const giveawaysManager = client.giveawaysManager;
    
    if (!giveawaysManager) {
      return res.status(500).json({
        success: false,
        error: 'Menedżer konkursów nie jest zainicjalizowany'
      });
    }
    
    // Pobierz wszystkie konkursy z serwera
    const giveaways = giveawaysManager.giveaways.filter(g => 
      g.guildId === guildId
    );
    
    res.json({
      success: true,
      giveaways: giveaways
    });
  } catch (error) {
    logger.error(`Błąd podczas pobierania konkursów: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas pobierania listy konkursów'
    });
  }
});

// Tworzenie nowego konkursu
router.post('/guilds/:guildId/giveaways', hasGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const { 
    channelId, 
    prize, 
    duration, 
    winnerCount,
    thumbnail = null,
    image = null,
    color = '3498db',
    isDrop = false
  } = req.body;
  
  try {
    const { client } = require('../../bot');
    const giveawaysManager = client.giveawaysManager;
    
    if (!giveawaysManager) {
      return res.status(500).json({
        success: false,
        error: 'Menedżer konkursów nie jest zainicjalizowany'
      });
    }
    
    // Sprawdź czy kanał istnieje
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({
        success: false,
        error: 'Serwer nie został znaleziony'
      });
    }
    
    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      return res.status(404).json({
        success: false,
        error: 'Kanał nie został znaleziony'
      });
    }
    
    // Konwersja czasu trwania na milisekundy (tylko jeśli nie jest to drop)
    let msDuration = 60000; // Minimalna wartość (1 minuta)
    if (!isDrop) {
      const ms = require('ms');
      msDuration = ms(duration);
      
      if (!msDuration) {
        return res.status(400).json({
          success: false,
          error: 'Nieprawidłowy format czasu trwania. Przykłady: 1h, 1d, 1w'
        });
      }
    }
    
    // Opcje konkursu
    const options = {
      duration: msDuration,
      winnerCount: parseInt(winnerCount),
      prize,
      hostedBy: req.user,
      messages: {
        giveaway: '🎉 **KONKURS** 🎉',
        giveawayEnded: '🎉 **KONKURS ZAKOŃCZONY** 🎉',
        title: '{this.prize}',
        drawing: 'Losowanie za: {timestamp}',
        dropMessage: 'Bądź pierwszym, który zareaguje z 🎉!',
        inviteToParticipate: 'Zareaguj z 🎉, aby wziąć udział!',
        winMessage: 'Gratulacje, {winners}! Wygrywasz **{this.prize}**!',
        embedFooter: '{this.winnerCount} zwycięzca(ów)',
        noWinner: 'Konkurs anulowany, brak ważnych zgłoszeń.',
        hostedBy: 'Organizator: {this.hostedBy}',
        winners: 'Zwycięzca(y):',
        endedAt: 'Zakończony'
      },
      embedColor: `#${color}`,
      isDrop
    };
    
    // Dodaj opcjonalne miniaturki/obrazki
    if (thumbnail) options.thumbnail = thumbnail;
    if (image) options.image = image;
    
    // Utwórz konkurs
    const giveaway = await giveawaysManager.start(channel, options);
    
    res.json({
      success: true,
      message: `Konkurs został utworzony w kanale #${channel.name}!`,
      giveaway: {
        messageId: giveaway.messageId,
        channelId: giveaway.channelId,
        prize: giveaway.prize
      }
    });
  } catch (error) {
    logger.error(`Błąd podczas tworzenia konkursu: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas tworzenia konkursu'
    });
  }
});

// Zakończenie konkursu
router.post('/guilds/:guildId/giveaways/:messageId/end', hasGuildPermission, async (req, res) => {
  const { guildId, messageId } = req.params;
  
  try {
    const { client } = require('../../bot');
    const giveawaysManager = client.giveawaysManager;
    
    if (!giveawaysManager) {
      return res.status(500).json({
        success: false,
        error: 'Menedżer konkursów nie jest zainicjalizowany'
      });
    }
    
    // Znajdź konkurs
    const giveaway = giveawaysManager.giveaways.find(g => 
      g.messageId === messageId && g.guildId === guildId
    );
    
    if (!giveaway) {
      return res.status(404).json({
        success: false,
        error: 'Nie znaleziono konkursu o podanym ID'
      });
    }
    
    if (giveaway.ended) {
      return res.status(400).json({
        success: false,
        error: 'Ten konkurs już się zakończył'
      });
    }
    
    // Zakończ konkurs
    await giveawaysManager.end(messageId);
    
    res.json({
      success: true,
      message: 'Konkurs został zakończony!'
    });
  } catch (error) {
    logger.error(`Błąd podczas kończenia konkursu: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas kończenia konkursu'
    });
  }
});

// Ponowne losowanie zwycięzców
router.post('/guilds/:guildId/giveaways/:messageId/reroll', hasGuildPermission, async (req, res) => {
  const { guildId, messageId } = req.params;
  const { winnerCount } = req.body || {};
  
  try {
    const { client } = require('../../bot');
    const giveawaysManager = client.giveawaysManager;
    
    if (!giveawaysManager) {
      return res.status(500).json({
        success: false,
        error: 'Menedżer konkursów nie jest zainicjalizowany'
      });
    }
    
    // Znajdź konkurs
    const giveaway = giveawaysManager.giveaways.find(g => 
      g.messageId === messageId && g.guildId === guildId
    );
    
    if (!giveaway) {
      return res.status(404).json({
        success: false,
        error: 'Nie znaleziono konkursu o podanym ID'
      });
    }
    
    if (!giveaway.ended) {
      return res.status(400).json({
        success: false,
        error: 'Nie można ponownie losować zwycięzców dla konkursu, który się jeszcze nie zakończył'
      });
    }
    
    // Opcje ponownego losowania
    const options = {
      messages: {
        congrat: 'Nowy zwycięzca(y): {winners}! Gratulacje, wygrywasz **{this.prize}**!',
        error: 'Nie znaleziono ważnych zgłoszeń, nie można wylosować nowych zwycięzców!'
      }
    };
    
    // Jeśli podano liczbę zwycięzców, dodaj ją do opcji
    if (winnerCount && !isNaN(winnerCount) && winnerCount > 0) {
      options.winnerCount = parseInt(winnerCount);
    }
    
    // Wykonaj ponowne losowanie
    await giveawaysManager.reroll(messageId, options);
    
    res.json({
      success: true,
      message: 'Zwycięzcy zostali ponownie wylosowani!'
    });
  } catch (error) {
    logger.error(`Błąd podczas ponownego losowania zwycięzców: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas ponownego losowania zwycięzców'
    });
  }
});

// Wstrzymanie konkursu
router.post('/guilds/:guildId/giveaways/:messageId/pause', hasGuildPermission, async (req, res) => {
  const { guildId, messageId } = req.params;
  
  try {
    const { client } = require('../../bot');
    const giveawaysManager = client.giveawaysManager;
    
    if (!giveawaysManager) {
      return res.status(500).json({
        success: false,
        error: 'Menedżer konkursów nie jest zainicjalizowany'
      });
    }
    
    // Znajdź konkurs
    const giveaway = giveawaysManager.giveaways.find(g => 
      g.messageId === messageId && g.guildId === guildId
    );
    
    if (!giveaway) {
      return res.status(404).json({
        success: false,
        error: 'Nie znaleziono konkursu o podanym ID'
      });
    }
    
    if (giveaway.ended) {
      return res.status(400).json({
        success: false,
        error: 'Nie można wstrzymać zakończonego konkursu'
      });
    }
    
    if (giveaway.pauseOptions?.isPaused) {
      return res.status(400).json({
        success: false,
        error: 'Ten konkurs jest już wstrzymany'
      });
    }
    
    // Wstrzymaj konkurs
    await giveawaysManager.pause(messageId, {
      content: '⚠️ **KONKURS WSTRZYMANY** ⚠️',
      unPauseAfter: null
    });
    
    res.json({
      success: true,
      message: 'Konkurs został wstrzymany!'
    });
  } catch (error) {
    logger.error(`Błąd podczas wstrzymywania konkursu: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas wstrzymywania konkursu'
    });
  }
});

// Wznowienie konkursu
router.post('/guilds/:guildId/giveaways/:messageId/resume', hasGuildPermission, async (req, res) => {
  const { guildId, messageId } = req.params;
  
  try {
    const { client } = require('../../bot');
    const giveawaysManager = client.giveawaysManager;
    
    if (!giveawaysManager) {
      return res.status(500).json({
        success: false,
        error: 'Menedżer konkursów nie jest zainicjalizowany'
      });
    }
    
    // Znajdź konkurs
    const giveaway = giveawaysManager.giveaways.find(g => 
      g.messageId === messageId && g.guildId === guildId
    );
    
    if (!giveaway) {
      return res.status(404).json({
        success: false,
        error: 'Nie znaleziono konkursu o podanym ID'
      });
    }
    
    if (giveaway.ended) {
      return res.status(400).json({
        success: false,
        error: 'Nie można wznowić zakończonego konkursu'
      });
    }
    
    if (!giveaway.pauseOptions?.isPaused) {
      return res.status(400).json({
        success: false,
        error: 'Ten konkurs nie jest wstrzymany'
      });
    }
    
    // Wznów konkurs
    await giveawaysManager.unpause(messageId);
    
    res.json({
      success: true,
      message: 'Konkurs został wznowiony!'
    });
  } catch (error) {
    logger.error(`Błąd podczas wznawiania konkursu: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas wznawiania konkursu'
    });
  }
});

// Pobieranie listy konkursów
router.get('/guilds/:guildId/giveaways', hasGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  
  try {
    const { client } = require('../../bot');
    const giveawaysManager = client.giveawaysManager;
    
    if (!giveawaysManager) {
      return res.status(500).json({
        success: false,
        error: 'Menedżer konkursów nie jest zainicjalizowany'
      });
    }
    
    // Pobierz dane surowe z bazy danych zamiast przez menedżera
    const Giveaway = require('../../models/Giveaway');
    const giveaways = await Giveaway.find({ guildId: guildId });
    
    res.json({
      success: true,
      giveaways: giveaways
    });
  } catch (error) {
    logger.error(`Błąd podczas pobierania konkursów: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas pobierania listy konkursów'
    });
  }
});

router.post('/guilds/:guildId/giveaways/:messageId/end', hasGuildPermission, async (req, res) => {
  const { guildId, messageId } = req.params;
  
  try {
    const { client } = require('../../bot');
    const giveawaysManager = client.giveawaysManager;
    
    if (!giveawaysManager) {
      return res.status(500).json({
        success: false,
        error: 'Menedżer konkursów nie jest zainicjalizowany'
      });
    }
    
    // Zakończ konkurs
    await giveawaysManager.end(messageId);
    
    res.json({
      success: true,
      message: 'Konkurs został zakończony!'
    });
  } catch (error) {
    logger.error(`Błąd podczas kończenia konkursu: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas kończenia konkursu'
    });
  }
});

// Pobieranie listy konkursów - tylko podstawowe informacje
router.get('/guilds/:guildId/giveaways/basic', hasGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  
  try {
    // Pobierz bezpośrednio z bazy tylko niezbędne pola
    const Giveaway = require('../../models/Giveaway');
    const giveaways = await Giveaway.find(
      { guildId: guildId },
      'messageId channelId prize winnerCount startAt endAt ended isDrop pauseOptions.isPaused'
    );
    
    res.json({
      success: true,
      giveaways: giveaways
    });
  } catch (error) {
    logger.error(`Błąd podczas pobierania podstawowych informacji o konkursach: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas pobierania listy konkursów'
    });
  }
});

// Pobieranie szczegółów pojedynczego konkursu
router.get('/guilds/:guildId/giveaways/:messageId/details', hasGuildPermission, async (req, res) => {
  const { guildId, messageId } = req.params;
  
  try {
    const Giveaway = require('../../models/Giveaway');
    const giveaway = await Giveaway.findOne({ guildId, messageId });
    
    if (!giveaway) {
      return res.status(404).json({
        success: false,
        error: 'Nie znaleziono konkursu o podanym ID'
      });
    }
    
    res.json({
      success: true,
      giveaway: giveaway
    });
  } catch (error) {
    logger.error(`Błąd podczas pobierania szczegółów konkursu: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas pobierania szczegółów konkursu'
    });
  }
});

// Dodaj te trasy do pliku src/web/routes/api.js

// Pobieranie listy wszystkich harmonogramów LiveFeed dla serwera
router.get('/guilds/:guildId/livefeeds', hasGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  
  try {
    const { client } = require('../../bot');
    
    // Sprawdź czy manager LiveFeed jest dostępny
    if (!client.liveFeedManager) {
      return res.status(500).json({
        success: false,
        error: 'System Live Feed nie jest jeszcze zainicjalizowany.'
      });
    }
    
    // Pobierz wszystkie feedy dla tego serwera
    const feeds = await client.liveFeedManager.getGuildFeeds(guildId);
    
    res.json({
      success: true,
      feeds: feeds
    });
  } catch (error) {
    logger.error(`Błąd podczas pobierania harmonogramów LiveFeed: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas pobierania harmonogramów LiveFeed'
    });
  }
});

// Pobieranie konkretnego harmonogramu
router.get('/guilds/:guildId/livefeeds/:feedId', hasGuildPermission, async (req, res) => {
  const { guildId, feedId } = req.params;
  
  try {
    const { client } = require('../../bot');
    
    // Sprawdź czy manager LiveFeed jest dostępny
    if (!client.liveFeedManager) {
      return res.status(500).json({
        success: false,
        error: 'System Live Feed nie jest jeszcze zainicjalizowany.'
      });
    }
    
    // Pobierz feed
    const feed = await client.liveFeedManager.getFeed(feedId);
    
    if (!feed) {
      return res.status(404).json({
        success: false,
        error: 'Nie znaleziono harmonogramu o podanym ID'
      });
    }
    
    // Sprawdź czy feed należy do tego serwera
    if (feed.guildId !== guildId) {
      return res.status(403).json({
        success: false,
        error: 'Ten harmonogram nie należy do tego serwera'
      });
    }
    
    res.json({
      success: true,
      feed: feed
    });
  } catch (error) {
    logger.error(`Błąd podczas pobierania harmonogramu LiveFeed: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas pobierania harmonogramu LiveFeed'
    });
  }
});

// Tworzenie nowego harmonogramu
router.post('/guilds/:guildId/livefeeds', hasGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const { 
    channelId, 
    name, 
    message, 
    minute, 
    hour, 
    day, 
    month, 
    weekday, 
    embed, 
    color,
    category
  } = req.body;
  
  try {
    const { client } = require('../../bot');
    
    // Sprawdź czy manager LiveFeed jest dostępny
    if (!client.liveFeedManager) {
      return res.status(500).json({
        success: false,
        error: 'System Live Feed nie jest jeszcze zainicjalizowany.'
      });
    }
    
    // Sprawdź czy kanał istnieje
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({
        success: false,
        error: 'Serwer nie został znaleziony'
      });
    }
    
    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      return res.status(404).json({
        success: false,
        error: 'Kanał nie został znaleziony'
      });
    }
    
    // Sprawdź czy kanał jest tekstowy
    if (channel.type !== 0) { // 0 = kanał tekstowy
      return res.status(400).json({
        success: false,
        error: 'Live Feed można utworzyć tylko dla kanału tekstowego'
      });
    }
    
    // Funkcja walidacyjna
    function validateCronValue(value, min, max) {
      if (value === '*') return true;
      
      if (value.includes(',')) {
        const parts = value.split(',').map(p => p.trim());
        return parts.every(part => {
          const num = parseInt(part);
          return !isNaN(num) && num >= min && num <= max;
        });
      }
      
      const num = parseInt(value);
      return !isNaN(num) && num >= min && num <= max;
    }
    
    // Walidacja wartości
    if (!validateCronValue(minute || '*', 0, 59) || 
        !validateCronValue(hour || '*', 0, 23) || 
        !validateCronValue(day || '*', 1, 31) || 
        !validateCronValue(month || '*', 1, 12) || 
        !validateCronValue(weekday || '*', 0, 6)) {
      return res.status(400).json({
        success: false,
        error: 'Nieprawidłowe wartości harmonogramu! Minuty (0-59), godziny (0-23), dni (1-31), miesiące (1-12), dni tygodnia (0-6).'
      });
    }
    
    // Przygotuj dane
    const feedData = {
      guildId: guildId,
      channelId: channelId,
      name: name,
      message: message,
      schedule: {
        minute: minute || '*',
        hour: hour || '*',
        dayOfMonth: day || '*',
        month: month || '*',
        dayOfWeek: weekday || '*'
      },
      embed: embed === 'true' || embed === true,
      embedColor: color || '#3498db',
      createdBy: req.user.id,
      category: category || 'Inne'
    };
    
    // Dodaj feed
    const newFeed = await client.liveFeedManager.addFeed(feedData);
    
    res.json({
      success: true,
      message: 'Harmonogram Live Feed został utworzony pomyślnie',
      feed: newFeed
    });
  } catch (error) {
    logger.error(`Błąd podczas tworzenia harmonogramu LiveFeed: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas tworzenia harmonogramu LiveFeed'
    });
  }
});

// Aktualizacja harmonogramu
router.put('/guilds/:guildId/livefeeds/:feedId', hasGuildPermission, async (req, res) => {
  const { guildId, feedId } = req.params;
  const { 
    channelId, 
    name, 
    message, 
    minute, 
    hour, 
    day, 
    month, 
    weekday, 
    embed, 
    color,
    category
  } = req.body;
  
  try {
    const { client } = require('../../bot');
    
    // Sprawdź czy manager LiveFeed jest dostępny
    if (!client.liveFeedManager) {
      return res.status(500).json({
        success: false,
        error: 'System Live Feed nie jest jeszcze zainicjalizowany.'
      });
    }
    
    // Pobierz feed
    const feed = await client.liveFeedManager.getFeed(feedId);
    
    if (!feed) {
      return res.status(404).json({
        success: false,
        error: 'Nie znaleziono harmonogramu o podanym ID'
      });
    }
    
    // Sprawdź czy feed należy do tego serwera
    if (feed.guildId !== guildId) {
      return res.status(403).json({
        success: false,
        error: 'Ten harmonogram nie należy do tego serwera'
      });
    }
    
    // Przygotuj dane do aktualizacji
    const updateData = {};
    
    // Kanał
    if (channelId) {
      const guild = client.guilds.cache.get(guildId);
      const channel = guild.channels.cache.get(channelId);
      
      if (!channel) {
        return res.status(404).json({
          success: false,
          error: 'Kanał nie został znaleziony'
        });
      }
      
      if (channel.type !== 0) { // 0 = kanał tekstowy
        return res.status(400).json({
          success: false,
          error: 'Live Feed można utworzyć tylko dla kanału tekstowego'
        });
      }
      
      updateData.channelId = channelId;
    }
    
    // Funkcja walidacyjna
    function validateCronValue(value, min, max) {
      if (value === '*') return true;
      
      if (value.includes(',')) {
        const parts = value.split(',').map(p => p.trim());
        return parts.every(part => {
          const num = parseInt(part);
          return !isNaN(num) && num >= min && num <= max;
        });
      }
      
      const num = parseInt(value);
      return !isNaN(num) && num >= min && num <= max;
    }
    
    // Pozostałe pola
    if (name) updateData.name = name;
    if (message) updateData.message = message;
    
    // Parametry harmonogramu
    const schedule = {};
    let hasScheduleChanges = false;
    
    if (minute !== undefined) {
      if (!validateCronValue(minute, 0, 59)) {
        return res.status(400).json({
          success: false,
          error: 'Nieprawidłowa wartość minuty (0-59)'
        });
      }
      schedule.minute = minute;
      hasScheduleChanges = true;
    }
    
    if (hour !== undefined) {
      if (!validateCronValue(hour, 0, 23)) {
        return res.status(400).json({
          success: false,
          error: 'Nieprawidłowa wartość godziny (0-23)'
        });
      }
      schedule.hour = hour;
      hasScheduleChanges = true;
    }
    
    if (day !== undefined) {
      if (!validateCronValue(day, 1, 31)) {
        return res.status(400).json({
          success: false,
          error: 'Nieprawidłowa wartość dnia miesiąca (1-31)'
        });
      }
      schedule.dayOfMonth = day;
      hasScheduleChanges = true;
    }
    
    if (month !== undefined) {
      if (!validateCronValue(month, 1, 12)) {
        return res.status(400).json({
          success: false,
          error: 'Nieprawidłowa wartość miesiąca (1-12)'
        });
      }
      schedule.month = month;
      hasScheduleChanges = true;
    }
    
    if (weekday !== undefined) {
      if (!validateCronValue(weekday, 0, 6)) {
        return res.status(400).json({
          success: false,
          error: 'Nieprawidłowa wartość dnia tygodnia (0-6, gdzie 0=niedziela)'
        });
      }
      schedule.dayOfWeek = weekday;
      hasScheduleChanges = true;
    }
    
    if (hasScheduleChanges) {
      updateData.schedule = schedule;
    }
    
    // Embed
    if (embed !== undefined) {
      updateData.embed = embed === 'true' || embed === true;
    }
    
    // Kolor
    if (color) updateData.embedColor = color;
    
    // Kategoria
    if (category) updateData.category = category;
    
    // Sprawdź czy są jakieś zmiany
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Nie wprowadzono żadnych zmian do harmonogramu'
      });
    }
    
    // Aktualizuj feed
    const updatedFeed = await client.liveFeedManager.updateFeed(feedId, updateData);
    
    res.json({
      success: true,
      message: 'Harmonogram Live Feed został zaktualizowany pomyślnie',
      feed: updatedFeed
    });
  } catch (error) {
    logger.error(`Błąd podczas aktualizacji harmonogramu LiveFeed: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas aktualizacji harmonogramu LiveFeed'
    });
  }
});

// Usuwanie harmonogramu
router.delete('/guilds/:guildId/livefeeds/:feedId', hasGuildPermission, async (req, res) => {
  const { guildId, feedId } = req.params;
  
  try {
    const { client } = require('../../bot');
    
    // Sprawdź czy manager LiveFeed jest dostępny
    if (!client.liveFeedManager) {
      return res.status(500).json({
        success: false,
        error: 'System Live Feed nie jest jeszcze zainicjalizowany.'
      });
    }
    
    // Pobierz feed
    const feed = await client.liveFeedManager.getFeed(feedId);
    
    if (!feed) {
      return res.status(404).json({
        success: false,
        error: 'Nie znaleziono harmonogramu o podanym ID'
      });
    }
    
    // Sprawdź czy feed należy do tego serwera
    if (feed.guildId !== guildId) {
      return res.status(403).json({
        success: false,
        error: 'Ten harmonogram nie należy do tego serwera'
      });
    }
    
    // Zapisz nazwę do odpowiedzi
    const feedName = feed.name;
    
    // Usuń feed
    await client.liveFeedManager.deleteFeed(feedId);
    
    res.json({
      success: true,
      message: `Harmonogram "${feedName}" został pomyślnie usunięty`
    });
  } catch (error) {
    logger.error(`Błąd podczas usuwania harmonogramu LiveFeed: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas usuwania harmonogramu LiveFeed'
    });
  }
});

// Wstrzymanie harmonogramu
router.post('/guilds/:guildId/livefeeds/:feedId/pause', hasGuildPermission, async (req, res) => {
  const { guildId, feedId } = req.params;
  
  try {
    const { client } = require('../../bot');
    
    // Sprawdź czy manager LiveFeed jest dostępny
    if (!client.liveFeedManager) {
      return res.status(500).json({
        success: false,
        error: 'System Live Feed nie jest jeszcze zainicjalizowany.'
      });
    }
    
    // Pobierz feed
    const feed = await client.liveFeedManager.getFeed(feedId);
    
    if (!feed) {
      return res.status(404).json({
        success: false,
        error: 'Nie znaleziono harmonogramu o podanym ID'
      });
    }
    
    // Sprawdź czy feed należy do tego serwera
    if (feed.guildId !== guildId) {
      return res.status(403).json({
        success: false,
        error: 'Ten harmonogram nie należy do tego serwera'
      });
    }
    
    // Sprawdź czy feed nie jest już wstrzymany
    if (!feed.isActive) {
      return res.status(400).json({
        success: false,
        error: `Harmonogram "${feed.name}" jest już wstrzymany`
      });
    }
    
    // Wstrzymaj feed
    await client.liveFeedManager.updateFeed(feedId, { isActive: false });
    
    res.json({
      success: true,
      message: `Harmonogram "${feed.name}" został wstrzymany`
    });
  } catch (error) {
    logger.error(`Błąd podczas wstrzymywania harmonogramu LiveFeed: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas wstrzymywania harmonogramu LiveFeed'
    });
  }
});

// Wznowienie harmonogramu
router.post('/guilds/:guildId/livefeeds/:feedId/resume', hasGuildPermission, async (req, res) => {
  const { guildId, feedId } = req.params;
  
  try {
    const { client } = require('../../bot');
    
    // Sprawdź czy manager LiveFeed jest dostępny
    if (!client.liveFeedManager) {
      return res.status(500).json({
        success: false,
        error: 'System Live Feed nie jest jeszcze zainicjalizowany.'
      });
    }
    
    // Pobierz feed
    const feed = await client.liveFeedManager.getFeed(feedId);
    
    if (!feed) {
      return res.status(404).json({
        success: false,
        error: 'Nie znaleziono harmonogramu o podanym ID'
      });
    }
    
    // Sprawdź czy feed należy do tego serwera
    if (feed.guildId !== guildId) {
      return res.status(403).json({
        success: false,
        error: 'Ten harmonogram nie należy do tego serwera'
      });
    }
    
    // Sprawdź czy feed nie jest już aktywny
    if (feed.isActive) {
      return res.status(400).json({
        success: false,
        error: `Harmonogram "${feed.name}" jest już aktywny`
      });
    }
    
    // Wznów feed
    await client.liveFeedManager.updateFeed(feedId, { isActive: true });
    
    res.json({
      success: true,
      message: `Harmonogram "${feed.name}" został wznowiony`
    });
  } catch (error) {
    logger.error(`Błąd podczas wznawiania harmonogramu LiveFeed: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas wznawiania harmonogramu LiveFeed'
    });
  }
});

// Testowanie harmonogramu
router.post('/guilds/:guildId/livefeeds/:feedId/test', hasGuildPermission, async (req, res) => {
  const { guildId, feedId } = req.params;
  
  try {
    const { client } = require('../../bot');
    
    // Sprawdź czy manager LiveFeed jest dostępny
    if (!client.liveFeedManager) {
      return res.status(500).json({
        success: false,
        error: 'System Live Feed nie jest jeszcze zainicjalizowany.'
      });
    }
    
    // Pobierz feed
    const feed = await client.liveFeedManager.getFeed(feedId);
    
    if (!feed) {
      return res.status(404).json({
        success: false,
        error: 'Nie znaleziono harmonogramu o podanym ID'
      });
    }
    
    // Sprawdź czy feed należy do tego serwera
    if (feed.guildId !== guildId) {
      return res.status(403).json({
        success: false,
        error: 'Ten harmonogram nie należy do tego serwera'
      });
    }
    
    // Wykonaj feed
    await client.liveFeedManager.executeFeed(feed);
    
    res.json({
      success: true,
      message: `Testowa wiadomość z harmonogramu "${feed.name}" została wysłana do kanału`
    });
  } catch (error) {
    logger.error(`Błąd podczas testowania harmonogramu LiveFeed: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas testowania harmonogramu LiveFeed'
    });
  }
});

module.exports = router;

// --- PATCH: DIAGNOSTICS & SAFE FALLBACK FOR REACTION USERS ---
router.get('/guilds/:guildId/messages/:messageId/reactions/:emojiName/users', hasGuildPermission, async (req, res) => {
  const { guildId, messageId, emojiName } = req.params;
  const emojiId = req.query.id; // ID emoji dla customowych emoji
  logger.info(`[REACTION USERS] guildId=${guildId}, messageId=${messageId}, emojiName=${emojiName}, emojiId=${emojiId}`);
  try {
    const messageLog = await MessageLog.findOne({ guildId, messageId });
    if (!messageLog) {
      logger.warn(`[REACTION USERS] Brak logu wiadomości w bazie: guildId=${guildId}, messageId=${messageId}`);
      return res.json({ success: true, users: [], message: 'Brak logu wiadomości w bazie' });
    }
    logger.info(`[REACTION USERS] Log znaleziony, reactions: ${JSON.stringify(messageLog.reactions)}`);
    const reaction = messageLog.reactions.find(r => (emojiId && r.id === emojiId) || (!emojiId && r.name === emojiName));
    if (!reaction) {
      logger.warn(`[REACTION USERS] Brak reakcji w logu: emojiName=${emojiName}, emojiId=${emojiId}`);
      return res.json({ success: true, users: [], message: 'Brak reakcji w logu' });
    }
    logger.info(`[REACTION USERS] Reakcja znaleziona, users: ${JSON.stringify(reaction.users)}`);
    // Jeśli nie ma listy użytkowników lub jest pusta, spróbuj pobrać z Discorda
    if (!reaction.users || reaction.users.length === 0) {
      try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
          logger.warn(`[REACTION USERS] Brak serwera w cache Discorda: ${guildId}`);
          return res.json({ success: true, users: [], message: 'Brak serwera w cache Discorda' });
        }
        const channel = guild.channels.cache.get(messageLog.channelId);
        if (!channel) {
          logger.warn(`[REACTION USERS] Brak kanału w cache Discorda: ${messageLog.channelId}`);
          return res.json({ success: true, users: [], message: 'Brak kanału w cache Discorda' });
        }
        let message;
        try {
          message = await channel.messages.fetch(messageId);
        } catch (error) {
          logger.warn(`[REACTION USERS] Nie można pobrać wiadomości z Discorda: ${error.message}`);
          return res.json({ success: true, users: [], message: 'Nie można pobrać wiadomości z Discorda' });
        }
        const emojiToUse = emojiId ? `${emojiName}:${emojiId}` : emojiName;
        const discordReaction = message.reactions.cache.get(emojiToUse);
        if (!discordReaction) {
          logger.warn(`[REACTION USERS] Brak reakcji na wiadomości Discord: ${emojiToUse}`);
          return res.json({ success: true, users: [], message: 'Brak reakcji na wiadomości Discord' });
        }
        const reactionUsers = await discordReaction.users.fetch();
        const users = [];
        reaction.users = [];
        for (const [userId, user] of reactionUsers) {
          reaction.users.push(userId);
          users.push({ id: userId, username: user.tag, avatar: user.displayAvatarURL({ dynamic: true }) });
        }
        await messageLog.save();
        logger.info(`[REACTION USERS] Pobrano użytkowników z Discorda: ${users.length}`);
        return res.json({ success: true, users, message: 'Pobrano z Discorda' });
      } catch (error) {
        logger.error(`[REACTION USERS] Błąd podczas pobierania z Discorda: ${error.stack}`);
        return res.json({ success: true, users: [], message: 'Błąd podczas pobierania z Discorda: ' + error.message });
      }
    }
    // Jeśli mamy listę użytkowników w bazie, spróbuj pobrać ich dane
    const guild = client.guilds.cache.get(guildId);
    const users = [];
    if (guild) {
      for (const userId of reaction.users) {
        try {
          const member = await guild.members.fetch(userId).catch(() => null);
          if (member) {
            users.push({ id: userId, username: member.user.tag, avatar: member.user.displayAvatarURL({ dynamic: true }) });
          } else {
            users.push({ id: userId, username: 'Nieznany użytkownik', avatar: null });
          }
        } catch (error) {
          logger.warn(`[REACTION USERS] Nie można pobrać info o użytkowniku ${userId}: ${error.message}`);
          users.push({ id: userId, username: 'Nieznany użytkownik', avatar: null });
        }
      }
    } else {
      for (const userId of reaction.users) {
        users.push({ id: userId, username: null, avatar: null });
      }
    }
    logger.info(`[REACTION USERS] Zwracam użytkowników z bazy: ${users.length}`);
    return res.json({ success: true, users, message: 'Pobrano z bazy' });
  } catch (error) {
    logger.error(`[REACTION USERS] Błąd ogólny: ${error.stack}`);
    return res.json({ success: true, users: [], message: 'Błąd ogólny: ' + error.message });
  }
});

// Edycja tytułu i opisu wiadomości reaction role
router.patch('/guilds/:guildId/reaction-roles/:messageId', hasGuildPermission, async (req, res) => {
  const { guildId, messageId } = req.params;
  const { title, description } = req.body;

  try {
    // Znajdź reaction role w bazie danych
    const reactionRole = await ReactionRole.findOne({
      guildId: guildId,
      messageId: messageId
    });

    if (!reactionRole) {
      return res.status(404).json({ success: false, error: 'Wiadomość nie została znaleziona' });
    }

    if (typeof title === 'string') reactionRole.title = title;
    if (typeof description === 'string') reactionRole.description = description;
    await reactionRole.save();

    // Spróbuj zaktualizować embed na Discordzie
    try {
      const guild = client.guilds.cache.get(guildId);
      const channel = guild.channels.cache.get(reactionRole.channelId);
      const message = await channel.messages.fetch(messageId);
      const embed = EmbedBuilder.from(message.embeds[0]);
      if (typeof title === 'string') embed.setTitle(title);
      if (typeof description === 'string') embed.setDescription(description);
      await message.edit({ embeds: [embed] });
    } catch (err) {
      logger.warn(`Nie można zaktualizować embed na Discordzie: ${err.message}`);
    }

    res.json({
      success: true,
      message: 'Wiadomość została zaktualizowana',
      reactionRole: {
        title: reactionRole.title,
        description: reactionRole.description
      }
    });
  } catch (error) {
    logger.error(`Błąd podczas edycji reaction role: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas edycji wiadomości'
    });
  }
});

// Dodawanie roli do dowolnej wiadomości (addtoany)
router.post('/guilds/:guildId/reaction-roles/addtoany', hasGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const { messageId, channelId, roleId, emoji, notificationEnabled } = req.body;

  try {
    // Sprawdź, czy kanał istnieje
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({ success: false, error: 'Serwer nie został znaleziony' });
    }

    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      return res.status(404).json({ success: false, error: 'Kanał nie został znaleziony' });
    }

    // Pobierz wiadomość
    const message = await channel.messages.fetch(messageId);
    if (!message) {
      return res.status(404).json({ success: false, error: 'Wiadomość nie została znaleziona' });
    }

    // Sprawdź, czy wiadomość należy do tego samego serwera
    if (message.guildId !== guildId) {
      return res.status(403).json({ success: false, error: 'Wiadomość nie należy do tego serwera' });
    }

    // Znajdź istniejący wpis ReactionRole lub utwórz nowy
    let reactionRole = await ReactionRole.findOne({
      guildId: guildId,
      messageId: messageId
    });

    if (!reactionRole) {
      // Utwórz nowy wpis
      reactionRole = new ReactionRole({
        guildId: guildId,
        messageId: messageId,
        channelId: channelId,
        roles: [],
        title: message.embeds[0]?.title || 'Role Reaction',
        description: message.embeds[0]?.description || 'Kliknij na reakcję, aby otrzymać rolę!'
      });
    }

    // Sprawdź, czy emoji już istnieje
    if (reactionRole.roles.some(r => r.emoji === emoji)) {
      return res.status(400).json({ success: false, error: 'To emoji jest już używane w tej wiadomości' });
    }

    // Sprawdź, czy rola istnieje
    const role = guild.roles.cache.get(roleId);
    if (!role) {
      return res.status(404).json({ success: false, error: 'Rola nie została znaleziona' });
    }

    // Dodaj rolę do bazy danych
    reactionRole.roles.push({
      emoji: emoji,
      roleId: roleId,
      notificationEnabled: notificationEnabled === 'true'
    });

    await reactionRole.save();

    // Dodaj reakcję do wiadomości
    await message.react(emoji);

    // Przygotuj lub zaktualizuj embed
    let embed;
    if (message.embeds.length > 0) {
      embed = EmbedBuilder.from(message.embeds[0]);
    } else {
      embed = new EmbedBuilder()
        .setTitle(reactionRole.title)
        .setDescription(reactionRole.description)
        .setColor('#3498db')
        .setFooter({ text: 'Kliknij na reakcję, aby otrzymać rolę!' });
    }

    // Dodaj lub zaktualizuj pole z rolami
    const rolesList = reactionRole.roles.map(r =>
      `${r.emoji} - <@&${r.roleId}>${r.notificationEnabled ? ' (z powiadomieniem)' : ''}`
    ).join('\n');

    if (embed.data.fields && embed.data.fields.find(f => f.name === 'Dostępne role')) {
      const fieldIndex = embed.data.fields.findIndex(f => f.name === 'Dostępne role');
      embed.data.fields[fieldIndex] = { name: 'Dostępne role', value: rolesList };
    } else {
      embed.addFields({ name: 'Dostępne role', value: rolesList });
    }

    // Zaktualizuj wiadomość
    await message.edit({ embeds: [embed] });

    logger.info(`Dodano rolę ${roleId} z emoji ${emoji} do dowolnej wiadomości ${messageId} na serwerze ${guildId}`);

    res.json({
      success: true,
      message: 'Rola została dodana do wiadomości',
      reactionRole: reactionRole
    });
  } catch (error) {
    logger.error(`Błąd podczas dodawania roli do dowolnej wiadomości: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas dodawania roli do wiadomości'
    });
  }
});

// SZYBKA ZMIANA KATEGORII LIVEFEED
router.put('/guilds/:guildId/livefeeds/:feedId/category', hasGuildPermission, async (req, res) => {
  const { guildId, feedId } = req.params;
  const { category } = req.body;

  if (!category || typeof category !== 'string') {
    return res.status(400).json({ success: false, error: 'Brak lub nieprawidłowa kategoria' });
  }

  try {
    const { client } = require('../../bot');
    if (!client.liveFeedManager) {
      return res.status(500).json({ success: false, error: 'System Live Feed nie jest jeszcze zainicjalizowany.' });
    }
    const feed = await client.liveFeedManager.getFeed(feedId);
    if (!feed) {
      return res.status(404).json({ success: false, error: 'Nie znaleziono harmonogramu o podanym ID' });
    }
    // Sprawdź czy feed należy do tego serwera
    if (feed.guildId !== guildId) {
      return res.status(403).json({ success: false, error: 'Ten harmonogram nie należy do tego serwera' });
    }
    // Zmień kategorię
    feed.category = category;
    await feed.save();
    // (Opcjonalnie) zaktualizuj w managerze
    if (feed.isActive && client.liveFeedManager.feeds) {
      client.liveFeedManager.feeds.set(feed._id.toString(), feed);
    }
    return res.json({ success: true, message: 'Kategoria została zaktualizowana', feed });
  } catch (error) {
    logger.error(`Błąd podczas zmiany kategorii LiveFeed: ${error.stack}`);
    return res.status(500).json({ success: false, error: 'Wystąpił błąd podczas zmiany kategorii' });
  }
});

// Wysyłanie wiadomości wiatru
router.post('/guilds/:guildId/wiatry/send', hasGuildPermission, async (req, res) => {
  const { guildId } = req.params;
  const { channelId, wiatrType } = req.body;

  try {
    // Sprawdź czy kanał istnieje
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({ success: false, error: 'Serwer nie został znaleziony' });
    }

    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      return res.status(404).json({ success: false, error: 'Kanał nie został znaleziony' });
    }

    // Sprawdź czy kanał jest tekstowy
    if (channel.type !== 0) {
      return res.status(400).json({ success: false, error: 'Wiadomości można wysyłać tylko na kanały tekstowe' });
    }

    // Pobierz role z zmiennych środowiskowych
    const roleIds = {
      boreasz: process.env.BOREASZ_ROLE_ID,
      trakiusz: process.env.TRAKIUSZ_ROLE_ID,
      iapis: process.env.IAPIS_ROLE_ID,
      skiron: process.env.SKIRON_ROLE_ID,
      kajkias: process.env.KAJKIAS_ROLE_ID,
      euros: process.env.EUROS_ROLE_ID,
      apeliotes: process.env.APELIOTES_ROLE_ID,
      euronotos: process.env.EURONOTOS_ROLE_ID,
      notos: process.env.NOTOS_ROLE_ID,
      libonotos: process.env.LIBONOTOS_ROLE_ID,
      lips: process.env.LIPS_ROLE_ID,
      zefir: process.env.ZEFIR_ROLE_ID
    };

    // Sprawdź czy wszystkie podstawowe role są zdefiniowane
    const missingRoles = Object.entries(roleIds).filter(([name, id]) => !id);
    if (missingRoles.length > 0) {
      return res.status(500).json({
        success: false,
        error: `Brakuje definicji ról: ${missingRoles.map(([name]) => name.toUpperCase()).join(', ')}`
      });
    }

    // Funkcja pomocnicza do tworzenia tagów ról
    const createRoleTag = (roleName) => {
      const roleId = roleIds[roleName];
      if (!roleId) {
        console.warn(`Brak ID roli dla: ${roleName}`);
        return `@${roleName.charAt(0).toUpperCase() + roleName.slice(1)}`;
      }

      const role = guild.roles.cache.get(roleId);
      if (!role) {
        console.warn(`Rola o ID ${roleId} nie istnieje w serwerze`);
        return `@${roleName.charAt(0).toUpperCase() + roleName.slice(1)}`;
      }

      return `<@&${roleId}>`;
    };

    // Definicje wszystkich wiatrów (skopiowane z komendy wiatr.js)
    const windPatterns = {
      boreasz: {
        roles: ['boreasz', 'trakiusz', 'iapis', 'skiron', 'kajkias'],
        pattern: (r) => `${r.boreasz} +7 \n${r.trakiusz} | ${r.iapis} +6 \n${r.skiron} | ${r.kajkias} +5`
      },
      euros: {
        roles: ['euros', 'kajkias', 'apeliotes', 'iapis', 'euronotos'],
        pattern: (r) => `${r.euros} +7 \n${r.kajkias} | ${r.apeliotes} +5 \n${r.iapis} | ${r.euronotos} +4`
      },
      notos: {
        roles: ['notos', 'libonotos', 'euronotos', 'lips', 'apeliotes'],
        pattern: (r) => `${r.notos} +7 \n${r.libonotos} | ${r.euronotos} +6 \n${r.lips} | ${r.apeliotes} +5`
      },
      zefir: {
        roles: ['zefir', 'skiron', 'lips', 'trakiusz', 'libonotos'],
        pattern: (r) => `${r.zefir} +7 \n${r.skiron} | ${r.lips} +5 \n${r.trakiusz} | ${r.libonotos} +4`
      },
      iapis: {
        roles: ['iapis', 'boreasz', 'kajkias', 'trakiusz', 'euros', 'skiron'],
        pattern: (r) => `${r.iapis} +7 \n${r.boreasz} | ${r.kajkias} +6 \n${r.trakiusz} +5 \n${r.euros} | ${r.skiron} +4`
      },
      kajkias: {
        roles: ['kajkias', 'iapis', 'boreasz', 'euros', 'trakiusz'],
        pattern: (r) => `${r.kajkias} +7 \n${r.iapis} +6 \n${r.boreasz} | ${r.euros} +5 \n${r.trakiusz} +4`
      },
      apeliotes: {
        roles: ['apeliotes', 'euronotos', 'notos', 'euros', 'libonotos'],
        pattern: (r) => `${r.apeliotes} +7 \n${r.euronotos} +6 \n${r.notos} | ${r.euros} +5 \n${r.libonotos} +4`
      },
      euronotos: {
        roles: ['euronotos', 'notos', 'apeliotes', 'libonotos', 'lips', 'euros'],
        pattern: (r) => `${r.euronotos} +7 \n${r.notos} | ${r.apeliotes} +6 \n${r.libonotos} +5 \n${r.lips} | ${r.euros} +4`
      },
      libonotos: {
        roles: ['libonotos', 'lips', 'notos', 'euronotos', 'zefir', 'apeliotes'],
        pattern: (r) => `${r.libonotos} +7 \n${r.lips} | ${r.notos} +6 \n${r.euronotos} +5 \n${r.zefir} | ${r.apeliotes} +4`
      },
      lips: {
        roles: ['lips', 'libonotos', 'zefir', 'notos', 'euronotos'],
        pattern: (r) => `${r.lips} +7 \n${r.libonotos} +6 \n${r.zefir} | ${r.notos} +5 \n${r.euronotos} +4`
      },
      skiron: {
        roles: ['skiron', 'trakiusz', 'zefir', 'boreasz', 'iapis'],
        pattern: (r) => `${r.skiron} +7 \n${r.trakiusz} +6 \n${r.zefir} | ${r.boreasz} +5 \n${r.iapis} +4`
      },
      trakiusz: {
        roles: ['trakiusz', 'skiron', 'boreasz', 'iapis', 'zefir', 'kajkias'],
        pattern: (r) => `${r.trakiusz} +7 \n${r.skiron} | ${r.boreasz} +6 \n${r.iapis} +5 \n${r.zefir} | ${r.kajkias} +4`
      },
      // Kombinacje
      ek: {
        roles: ['kajkias', 'euros', 'iapis', 'boreasz', 'apeliotes'],
        pattern: (r) => `${r.kajkias} | ${r.euros} +6 \n${r.iapis} +5 \n${r.boreasz} | ${r.apeliotes} +4`
      },
      ea: {
        roles: ['euros', 'apeliotes', 'euronotos', 'kajkias', 'notos'],
        pattern: (r) => `${r.euros} | ${r.apeliotes} +6 \n${r.euronotos} +5 \n${r.kajkias} | ${r.notos} +4`
      },
      zl: {
        roles: ['zefir', 'lips', 'libonotos', 'skiron', 'notos'],
        pattern: (r) => `${r.zefir} | ${r.lips} +6 \n${r.libonotos} +5 \n${r.skiron} | ${r.notos} +4`
      },
      zs: {
        roles: ['skiron', 'zefir', 'trakiusz', 'boreasz', 'lips'],
        pattern: (r) => `${r.skiron} | ${r.zefir} +6 \n${r.trakiusz} +5 \n${r.boreasz} | ${r.lips} +4`
      }
    };

    // Sprawdź czy wybrany wiatr istnieje
    const windConfig = windPatterns[wiatrType];
    if (!windConfig) {
      return res.status(400).json({ success: false, error: 'Nieznany typ wiatru' });
    }

    // Utwórz obiekty tagów ról
    const roleTags = {};
    windConfig.roles.forEach(roleName => {
      roleTags[roleName] = createRoleTag(roleName);
    });

    // Wygeneruj wiadomość używając wzorca
    const windMessage = windConfig.pattern(roleTags);

    // Sprawdź długość wiadomości
    if (windMessage.length > 2000) {
      return res.status(400).json({ success: false, error: 'Wiadomość jest za długa' });
    }

    // Przygotuj listę ID ról do tagowania
    const validRoleIds = [];
    for (const roleName of windConfig.roles) {
      const roleId = roleIds[roleName];
      if (roleId) {
        const role = guild.roles.cache.get(roleId);
        if (role) {
          validRoleIds.push(roleId);
        }
      }
    }

    // Opcje wiadomości
    const messageOptions = {
      content: windMessage
    };

    // Dodaj allowedMentions tylko jeśli są valide role
    if (validRoleIds.length > 0) {
      messageOptions.allowedMentions = {
        roles: validRoleIds
      };
    }

    // Wyślij wiadomość
    await channel.send(messageOptions);

    logger.info(`Wysłano wiadomość wiatru ${wiatrType} na kanał ${channel.name} (${channelId}) na serwerze ${guild.name}`);

    res.json({
      success: true,
      message: `Wiadomość wiatru została wysłana na kanał #${channel.name}`
    });

  } catch (error) {
    logger.error(`Błąd podczas wysyłania wiadomości wiatru: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas wysyłania wiadomości wiatru'
    });
  }
});

// KATEGORIE LIVEFEEDÓW
const LiveFeed = require('../../models/LiveFeed');

// Pobierz listę kategorii
router.get('/guilds/:guildId/livefeed-categories', hasGuildPermission, async (req, res) => {
  const { guildId } = req.params;
  try {
    const guild = await Guild.findOne({ guildId });
    if (!guild) return res.status(404).json({ success: false, error: 'Nie znaleziono serwera' });
    res.json({ success: true, categories: guild.categories || [] });
  } catch (error) {
    logger.error(`Błąd podczas pobierania kategorii: ${error.stack}`);
    res.status(500).json({ success: false, error: 'Wystąpił błąd podczas pobierania kategorii' });
  }
});

// Dodaj kategorię
router.post('/guilds/:guildId/livefeed-categories', hasGuildPermission, async (req, res) => {
  const { guildId } = req.params;
  const { name } = req.body;
  if (!name || typeof name !== 'string') return res.status(400).json({ success: false, error: 'Brak lub nieprawidłowa nazwa kategorii' });
  try {
    const guild = await Guild.findOne({ guildId });
    if (!guild) return res.status(404).json({ success: false, error: 'Nie znaleziono serwera' });
    if (guild.categories.includes(name)) return res.status(400).json({ success: false, error: 'Kategoria już istnieje' });
    guild.categories.push(name);
    await guild.save();
    res.json({ success: true, categories: guild.categories });
  } catch (error) {
    logger.error(`Błąd podczas dodawania kategorii: ${error.stack}`);
    res.status(500).json({ success: false, error: 'Wystąpił błąd podczas dodawania kategorii' });
  }
});

// Usuń kategorię
router.delete('/guilds/:guildId/livefeed-categories/:category', hasGuildPermission, async (req, res) => {
  const { guildId, category } = req.params;
  try {
    const guild = await Guild.findOne({ guildId });
    if (!guild) return res.status(404).json({ success: false, error: 'Nie znaleziono serwera' });
    if (!guild.categories.includes(category)) return res.status(404).json({ success: false, error: 'Kategoria nie istnieje' });
    // Nie pozwalaj usuwać domyślnej kategorii "Inne"
    if (category === 'Inne') return res.status(400).json({ success: false, error: 'Nie można usunąć domyślnej kategorii "Inne"' });
    guild.categories = guild.categories.filter(cat => cat !== category);
    await guild.save();
    // Przenieś feedy do "Inne"
    await LiveFeed.updateMany({ guildId, category }, { $set: { category: 'Inne' } });
    res.json({ success: true, categories: guild.categories });
  } catch (error) {
    logger.error(`Błąd podczas usuwania kategorii: ${error.stack}`);
    res.status(500).json({ success: false, error: 'Wystąpił błąd podczas usuwania kategorii' });
  }
});

// Layout livefeedów (kolejność i stan rozwinięcia)
router.get('/guilds/:guildId/livefeed-layout', hasGuildPermission, async (req, res) => {
  const { guildId } = req.params;
  try {
    const guild = await Guild.findOne({ guildId });
    if (!guild) return res.status(404).json({ success: false, error: 'Nie znaleziono serwera' });
    res.json({
      success: true,
      categoryOrder: guild.livefeedCategoryOrder || [],
      feedOrder: guild.livefeedOrder || {},
      categoryCollapse: guild.livefeedCategoryCollapse || {}
    });
  } catch (error) {
    logger.error(`Błąd podczas pobierania layoutu livefeedów: ${error.stack}`);
    res.status(500).json({ success: false, error: 'Wystąpił błąd podczas pobierania layoutu' });
  }
});

router.post('/guilds/:guildId/livefeed-layout', hasGuildPermission, async (req, res) => {
  const { guildId } = req.params;
  const { categoryOrder, feedOrder, categoryCollapse } = req.body;
  try {
    const guild = await Guild.findOne({ guildId });
    if (!guild) return res.status(404).json({ success: false, error: 'Nie znaleziono serwera' });
    if (Array.isArray(categoryOrder)) guild.livefeedCategoryOrder = categoryOrder;
    if (typeof feedOrder === 'object') guild.livefeedOrder = feedOrder;
    if (typeof categoryCollapse === 'object') guild.livefeedCategoryCollapse = categoryCollapse;
    await guild.save();
    res.json({ success: true });
  } catch (error) {
    logger.error(`Błąd podczas zapisywania layoutu livefeedów: ${error.stack}`);
    res.status(500).json({ success: false, error: 'Wystąpił błąd podczas zapisywania layoutu' });
  }
});
