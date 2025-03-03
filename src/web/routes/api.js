const express = require('express');
const router = express.Router();
const { client } = require('../../bot');
const Guild = require('../../models/Guild');
const ReactionRole = require('../../models/ReactionRole');
const MessageLog = require('../../models/MessageLog');
const { EmbedBuilder } = require('discord.js');
const logger = require('../../utils/logger');

// Middleware do sprawdzania uprawnień na serwerze
function hasGuildPermission(req, res, next) {
  if (!req.params.guildId) {
    return res.status(400).json({ error: 'Brak ID serwera' });
  }
  
  const guild = req.user.guilds.find(g => g.id === req.params.guildId);
  
  if (!guild) {
    return res.status(403).json({ error: 'Nie masz dostępu do tego serwera' });
  }
  
  // Sprawdź, czy użytkownik ma uprawnienia administratora
  const hasPermission = (guild.permissions & 0x8) === 0x8;
  
  if (!hasPermission) {
    return res.status(403).json({ error: 'Nie masz wystarczających uprawnień na tym serwerze' });
  }
  
  next();
}

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
    
    // POPRAWIONA obsługa wartości boolean dla modułów
    // Funkcja pomocnicza do bezpiecznej konwersji wartości boolean
    function safelyConvertToBoolean(value) {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') return value === 'true';
      if (typeof value === 'number') return value !== 0;
      return false;
    }
    
    // Moduł messageLog - sprawdź obie możliwe nazwy pola
    if (req.body.messageLog !== undefined) {
      guildSettings.modules.messageLog = safelyConvertToBoolean(req.body.messageLog);
      logger.debug(`Ustawiono modules.messageLog=${guildSettings.modules.messageLog} z wartości ${req.body.messageLog} (typ: ${typeof req.body.messageLog})`);
    } else if (req.body['modules.messageLog'] !== undefined) {
      guildSettings.modules.messageLog = safelyConvertToBoolean(req.body['modules.messageLog']);
      logger.debug(`Ustawiono modules.messageLog=${guildSettings.modules.messageLog} z wartości ${req.body['modules.messageLog']} (typ: ${typeof req.body['modules.messageLog']})`);
    }
    
    // Obsługa pozostałych modułów
    if (req.body['modules.reactionRoles'] !== undefined) {
      guildSettings.modules.reactionRoles = safelyConvertToBoolean(req.body['modules.reactionRoles']);
      logger.debug(`Ustawiono modules.reactionRoles=${guildSettings.modules.reactionRoles}`);
    }
    
    if (req.body.notificationsEnabled !== undefined) {
      guildSettings.modules.notifications = safelyConvertToBoolean(req.body.notificationsEnabled);
    }
    
    // Obsługa logDeletedOnly
    if (req.body.logDeletedOnly !== undefined) {
      guildSettings.logDeletedOnly = safelyConvertToBoolean(req.body.logDeletedOnly);
      logger.debug(`Ustawiono logDeletedOnly=${guildSettings.logDeletedOnly} z wartości ${req.body.logDeletedOnly} (typ: ${typeof req.body.logDeletedOnly})`);
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
  const { userId, userQuery, channelId, status, page = 1, limit = 10 } = req.query;
  
  try {
    // Buduj filtr wyszukiwania
    const filter = { guildId };
    
    // Najpierw sprawdź czy mamy bezpośrednio userId
    if (userId) {
      filter.authorId = userId;
    } 
    // Jeśli nie ma userId, ale jest zapytanie o użytkownika, spróbuj go znaleźć na serwerze
    else if (userQuery) {
      const guild = client.guilds.cache.get(guildId);
      
      if (guild) {
        try {
          // Pobierz użytkowników, którzy pasują do zapytania
          await guild.members.fetch();
          const members = guild.members.cache.filter(member => 
            member.user.username.toLowerCase().includes(userQuery.toLowerCase()) ||
            (member.nickname && member.nickname.toLowerCase().includes(userQuery.toLowerCase())) ||
            member.user.tag.toLowerCase().includes(userQuery.toLowerCase()) ||
            member.id.includes(userQuery)
          );
          
          if (members.size > 0) {
            // Jeśli znaleziono użytkowników, stwórz tablicę ich ID
            const userIds = members.map(member => member.id);
            
            // Użyj operatora $in do filtrowania po wielu ID
            if (userIds.length === 1) {
              filter.authorId = userIds[0];
            } else {
              filter.authorId = { $in: userIds };
            }
            
            logger.debug(`Znaleziono ${userIds.length} użytkowników pasujących do zapytania "${userQuery}"`);
          } else {
            // Jeśli nie znaleziono użytkowników, zwróć pustą listę
            logger.debug(`Nie znaleziono użytkowników pasujących do zapytania "${userQuery}"`);
            return res.json({
              success: true,
              logs: [],
              page: parseInt(page),
              totalPages: 0,
              channels: {},
              users: {}
            });
          }
        } catch (error) {
          logger.error(`Błąd podczas wyszukiwania użytkowników: ${error.message}`);
          // Jeśli wystąpił błąd, kontynuuj bez filtra użytkownika
        }
      }
    }

    // Pobieranie informacji o użytkownikach, którzy dodali reakcję
router.get('/guilds/:guildId/messages/:messageId/reactions/:emojiName/users', hasGuildPermission, async (req, res) => {
  const { guildId, messageId, emojiName } = req.params;
  const emojiId = req.query.id; // ID emoji dla customowych emoji
  
  try {
    // Sprawdź, czy wiadomość istnieje w logach
    const messageLog = await MessageLog.findOne({ guildId, messageId });
    
    if (!messageLog) {
      return res.status(404).json({ success: false, error: 'Wiadomość nie została znaleziona w bazie danych' });
    }
    
    // Znajdź reakcję
    const reaction = messageLog.reactions.find(r => 
      (emojiId && r.id === emojiId) || (!emojiId && r.name === emojiName)
    );
    
    if (!reaction) {
      return res.status(404).json({ success: false, error: 'Reakcja nie została znaleziona w bazie danych' });
    }
    
    // Sprawdź, czy mamy listę użytkowników
    if (!reaction.users || reaction.users.length === 0) {
      // Spróbuj pobrać listę użytkowników z Discorda
      try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
          return res.status(404).json({ success: false, error: 'Serwer nie został znaleziony' });
        }
        
        // Spróbuj znaleźć kanał i wiadomość
        const channel = guild.channels.cache.get(messageLog.channelId);
        if (!channel) {
          return res.json({ 
            success: true, 
            message: 'Kanał nie jest już dostępny na Discordzie, brak możliwości pobrania użytkowników', 
            users: [] 
          });
        }
        
        let message;
        try {
          message = await channel.messages.fetch(messageId);
        } catch (error) {
          logger.warn(`Nie można pobrać wiadomości ${messageId}: ${error.message}`);
          return res.json({ 
            success: true, 
            message: 'Wiadomość nie jest już dostępna na Discordzie, brak możliwości pobrania użytkowników', 
            users: [] 
          });
        }
        
        // Pobierz reakcję
        const emojiToUse = emojiId ? `${emojiName}:${emojiId}` : emojiName;
        const discordReaction = message.reactions.cache.get(emojiToUse);
        
        if (!discordReaction) {
          return res.json({ 
            success: true, 
            message: 'Reakcja nie jest już dostępna na Discordzie, brak możliwości pobrania użytkowników', 
            users: [] 
          });
        }
        
        // Pobierz użytkowników, którzy dodali reakcję
        const reactionUsers = await discordReaction.users.fetch();
        const users = [];
        
        // Aktualizuj listę użytkowników w bazie danych
        reaction.users = [];
        
        for (const [userId, user] of reactionUsers) {
          reaction.users.push(userId);
          
          users.push({
            id: userId,
            username: user.tag,
            avatar: user.displayAvatarURL({ dynamic: true })
          });
        }
        
        // Zapisz zaktualizowane dane
        await messageLog.save();
        
        return res.json({
          success: true,
          message: 'Pobrano listę użytkowników z Discorda',
          users: users
        });
      } catch (error) {
        logger.error(`Błąd podczas pobierania użytkowników z Discorda: ${error.stack}`);
        return res.json({ 
          success: true, 
          message: 'Wystąpił błąd podczas pobierania użytkowników z Discorda', 
          users: [] 
        });
      }
    }
    
    // Jeśli mamy listę użytkowników w bazie, spróbuj pobrać ich dane
    const guild = client.guilds.cache.get(guildId);
    const users = [];
    
    if (guild) {
      // Pobierz informacje o każdym użytkowniku
      for (const userId of reaction.users) {
        try {
          const member = await guild.members.fetch(userId).catch(() => null);
          
          if (member) {
            users.push({
              id: userId,
              username: member.user.tag,
              avatar: member.user.displayAvatarURL({ dynamic: true })
            });
          } else {
            // Użytkownik prawdopodobnie opuścił serwer
            users.push({
              id: userId,
              username: 'Nieznany użytkownik',
              avatar: null
            });
          }
        } catch (error) {
          logger.warn(`Nie można pobrać informacji o użytkowniku ${userId}: ${error.message}`);
          users.push({
            id: userId,
            username: 'Nieznany użytkownik',
            avatar: null
          });
        }
      }
    } else {
      // Jeśli nie mamy dostępu do serwera, zwróć tylko ID użytkowników
      for (const userId of reaction.users) {
        users.push({
          id: userId,
          username: null,
          avatar: null
        });
      }
    }
    
    res.json({
      success: true,
      message: 'Pobrano listę użytkowników z bazy danych',
      users: users
    });
  } catch (error) {
    logger.error(`Błąd podczas pobierania użytkowników z reakcją: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas pobierania użytkowników'
    });
  }
});
    
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
      // Wypełnij informacje o kanałach
      guild.channels.cache.forEach(channel => {
        if (channel.type === 0) { // Tylko kanały tekstowe
          channels[channel.id] = channel.name;
        }
      });
      
      // Pobierz informacje o użytkownikach
      const uniqueUserIds = [...new Set(logs.map(log => log.authorId))];
      for (const userId of uniqueUserIds) {
        try {
          const user = await guild.members.fetch(userId).then(member => member.user);
          users[userId] = {
            username: user.tag,
            avatar: user.displayAvatarURL({ dynamic: true })
          };
        } catch (error) {
          // Użytkownik mógł opuścić serwer
          logger.debug(`Nie można znaleźć użytkownika ${userId}: ${error.message}`);
          users[userId] = null;
        }
      }
    }
    
    res.json({
      success: true,
      logs,
      page: parseInt(page),
      totalPages,
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

module.exports = router;