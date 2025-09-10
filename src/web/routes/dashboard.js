const express = require('express');
const router = express.Router();
const { client } = require('../../bot');
const Guild = require('../../models/Guild');
const ReactionRole = require('../../models/ReactionRole');
const MessageLog = require('../../models/MessageLog');
const logger = require('../../utils/logger');

// Stałe definicje uprawnień
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
      return res.redirect('/dashboard');
    }
    
    const guild = req.user.guilds.find(g => g.id === req.params.guildId);
    
    if (!guild) {
      return res.redirect('/dashboard');
    }
    
    // Sprawdź czy użytkownik ma uprawnienia moderatora
    const hasPermission = hasModeratorPermissions(guild.permissions);
    
    if (!hasPermission) {
      return res.redirect('/dashboard');
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
    logger.error(`Błąd w middleware hasGuildPermission: ${error.stack}`);
    return res.redirect('/dashboard');
  }
}

// Lista serwerów
router.get('/', async (req, res) => {
  try {
    // Filtruj serwery, gdzie użytkownik ma uprawnienia administratora lub moderatora
    const allowedGuilds = req.user.guilds.filter(g => hasModeratorPermissions(g.permissions));
    
    // Sprawdź, które serwery mają bota
    const botGuilds = client.guilds.cache.map(g => g.id);
    
    // Oznacz serwery, na których jest bot
    const guilds = allowedGuilds.map(g => ({
      ...g,
      hasBot: botGuilds.includes(g.id)
    }));
    
    res.render('dashboard/index', {
      user: req.user,
      guilds: guilds
    });
  } catch (error) {
    logger.error(`Błąd podczas renderowania strony głównej dashboard: ${error.stack}`);
    res.status(500).render('error', {
      user: req.user,
      statusCode: 500,
      message: 'Wystąpił błąd podczas ładowania panelu'
    });
  }
});

// Panel zarządzania serwerem
// Panel zarządzania serwerem
router.get('/guild/:guildId', hasGuildPermission, async (req, res) => {
  try {
    const guildId = req.params.guildId;
    
    // Pobierz dane serwera z bazy danych
    let guildSettings = await Guild.findOne({ guildId: guildId });
    
    // Jeśli nie ma w bazie, stwórz nowy rekord
    if (!guildSettings) {
      guildSettings = await Guild.create({
        guildId: guildId,
        modules: {
          messageLog: false,
          reactionRoles: true,
          notifications: true
        }
      });
      logger.info(`Utworzono nowe ustawienia dla serwera ${guildId}`);
    }
    
    // Pobierz dane serwera z Discorda
    const guild = client.guilds.cache.get(guildId);
    
    if (!guild) {
      logger.warn(`Próba dostępu do panelu dla serwera ${guildId}, ale bot nie jest na tym serwerze`);
      return res.render('dashboard/not-in-guild', {
        user: req.user,
        guild: req.user.guilds.find(g => g.id === guildId)
      });
    }
    
    logger.info(`Renderowanie panelu zarządzania dla serwera ${guild.name} (${guildId})`);
    
    // Renderuj panel zarządzania z informacjami o uprawnieniach
    res.render('dashboard/guild', {
      user: req.user,
      guild: guild,
      settings: guildSettings,
      userPermissions: req.userPermissions,
      path: req.path,
      isModuleEnabled: (settings, moduleName) => {
        if (!settings || !settings.modules) return false;
        return settings.modules[moduleName] === true;
      }
    });
  } catch (error) {
    logger.error(`Błąd podczas renderowania panelu zarządzania: ${error.stack}`);
    res.status(500).render('error', {
      user: req.user,
      statusCode: 500,
      message: 'Wystąpił błąd podczas ładowania panelu zarządzania'
    });
  }
});

// Konfiguracja ogólna serwera
router.get('/guild/:guildId/settings', hasGuildPermission, async (req, res) => {
  try {
    const guildId = req.params.guildId;
    
    // Pobierz dane serwera z bazy danych
    let guildSettings = await Guild.findOne({ guildId: guildId });
    
    // Pobierz dane serwera z Discorda
    const guild = client.guilds.cache.get(guildId);
    
    if (!guild) {
      return res.redirect('/dashboard');
    }
    
    // Pobierz listę kanałów tekstowych
    const textChannels = guild.channels.cache
      .filter(c => c.type === 0) // 0 = kanał tekstowy
      .map(c => ({ id: c.id, name: c.name }));
    
    res.render('dashboard/settings', {
      user: req.user,
      guild: guild,
      settings: guildSettings,
      channels: textChannels,
      userPermissions: req.userPermissions,
      path: req.path
    });
  } catch (error) {
    logger.error(`Błąd podczas renderowania ustawień: ${error.stack}`);
    res.status(500).render('error', {
      user: req.user,
      statusCode: 500,
      message: 'Wystąpił błąd podczas ładowania ustawień'
    });
  }
});

// Zarządzanie reaction roles
router.get('/guild/:guildId/reaction-roles', hasGuildPermission, async (req, res) => {
  try {
    const guildId = req.params.guildId;
    
    // Pobierz dane serwera z Discorda
    const guild = client.guilds.cache.get(guildId);
    
    if (!guild) {
      return res.redirect('/dashboard');
    }
    
    // Pobierz wszystkie reaction roles dla tego serwera
    const reactionRoles = await ReactionRole.find({ guildId: guildId });
    
    // Pobierz listę kanałów tekstowych
    const textChannels = guild.channels.cache
      .filter(c => c.type === 0) // 0 = kanał tekstowy
      .map(c => ({ id: c.id, name: c.name }));
    
    // Pobierz listę ról
    const roles = guild.roles.cache
      .filter(r => !r.managed && r.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .map(r => ({ id: r.id, name: r.name, color: r.color }));
    
    res.render('dashboard/reaction-roles', {
      user: req.user,
      guild: guild,
      reactionRoles: reactionRoles,
      channels: textChannels,
      roles: roles,
      userPermissions: req.userPermissions,
      path: req.path
    });
  } catch (error) {
    logger.error(`Błąd podczas renderowania role reaction: ${error.stack}`);
    res.status(500).render('error', {
      user: req.user,
      statusCode: 500,
      message: 'Wystąpił błąd podczas ładowania ról reakcji'
    });
  }
});

// Zarządzanie logami wiadomości
router.get('/guild/:guildId/message-logs', hasGuildPermission, async (req, res) => {
  try {
    const guildId = req.params.guildId;
    
    // Pobierz dane serwera z Discorda
    const guild = client.guilds.cache.get(guildId);
    
    if (!guild) {
      logger.warn(`Próba dostępu do panelu message-logs dla serwera ${guildId}, ale bot nie jest na tym serwerze`);
      return res.redirect('/dashboard');
    }
    
    // Pobierz ustawienia z bazy danych
    const settings = await Guild.findOne({ guildId: guildId });
    
    // Pobierz listę kanałów tekstowych
    const textChannels = guild.channels.cache
      .filter(c => c.type === 0) // 0 = kanał tekstowy
      .map(c => ({ id: c.id, name: c.name }));
    
    logger.info(`Renderowanie strony message-logs dla serwera ${guildId}`);
    
    res.render('dashboard/message-logs', {
      user: req.user,
      guild: guild,
      settings: settings || {},
      channels: textChannels,
      userPermissions: req.userPermissions,
      path: req.path
    });
  } catch (error) {
    logger.error(`Błąd podczas renderowania strony message-logs: ${error.stack}`);
    res.status(500).render('error', {
      user: req.user,
      statusCode: 500,
      message: 'Wystąpił błąd podczas ładowania strony logów wiadomości'
    });
  }
});

router.get('/guild/:guildId/livefeed', hasGuildPermission, async (req, res) => {
  try {
    const guildId = req.params.guildId;
    
    // Pobierz dane serwera z Discorda
    const guild = client.guilds.cache.get(guildId);
    
    if (!guild) {
      return res.redirect('/dashboard');
    }
    
    // Sprawdź czy manager LiveFeed jest dostępny
    if (!client.liveFeedManager) {
      return res.status(500).render('error', {
        user: req.user,
        statusCode: 500,
        message: 'System Live Feed nie jest jeszcze zainicjalizowany.'
      });
    }
    
    // Pobierz wszystkie feedy dla tego serwera
    const feeds = await client.liveFeedManager.getGuildFeeds(guildId);
    
    // Pobierz listę kanałów tekstowych
    const textChannels = guild.channels.cache
      .filter(c => c.type === 0) // 0 = kanał tekstowy
      .map(c => ({ id: c.id, name: c.name }));
    
    // Renderuj widok
    res.render('dashboard/livefeed', {
      user: req.user,
      guild: guild,
      feeds: feeds,
      channels: textChannels,
      userPermissions: req.userPermissions,
      path: req.path
    });
  } catch (error) {
    logger.error(`Błąd podczas renderowania strony livefeed: ${error.stack}`);
    res.status(500).render('error', {
      user: req.user,
      statusCode: 500,
      message: 'Wystąpił błąd podczas ładowania strony Live Feed'
    });
  }
});

// Giveaways
router.get('/guild/:guildId/giveaways', hasGuildPermission, async (req, res) => {
  try {
    const guildId = req.params.guildId;

    // Pobierz dane serwera z Discorda
    const guild = client.guilds.cache.get(guildId);

    if (!guild) {
      return res.redirect('/dashboard');
    }

    // Pobierz listę kanałów tekstowych
    const textChannels = guild.channels.cache
      .filter(c => c.type === 0) // 0 = kanał tekstowy
      .map(c => ({ id: c.id, name: c.name }));

    res.render('dashboard/giveaways', {
      user: req.user,
      guild: guild,
      channels: textChannels,
      userPermissions: req.userPermissions,
      path: req.path
    });
  } catch (error) {
    logger.error(`Błąd podczas renderowania strony giveaways: ${error.stack}`);
    res.status(500).render('error', {
      user: req.user,
      statusCode: 500,
      message: 'Wystąpił błąd podczas ładowania strony konkursów'
    });
  }
});

// Zarządzanie wiatrami
router.get('/guild/:guildId/wiatry', hasGuildPermission, async (req, res) => {
  try {
    const guildId = req.params.guildId;

    // Pobierz dane serwera z Discorda
    const guild = client.guilds.cache.get(guildId);

    if (!guild) {
      return res.redirect('/dashboard');
    }

    // Pobierz listę kanałów tekstowych
    const textChannels = guild.channels.cache
      .filter(c => c.type === 0) // 0 = kanał tekstowy
      .map(c => ({ id: c.id, name: c.name }));

    // Definicje wiatrów
    const wiatry = {
      glowne: [
        { name: 'Boreasz', value: 'boreasz' },
        { name: 'Euros', value: 'euros' },
        { name: 'Notos', value: 'notos' },
        { name: 'Zefir', value: 'zefir' },
        { name: 'Iapis', value: 'iapis' },
        { name: 'Kajkias', value: 'kajkias' },
        { name: 'Apeliotes', value: 'apeliotes' },
        { name: 'Euronotos', value: 'euronotos' },
        { name: 'Libonotos', value: 'libonotos' },
        { name: 'Lips', value: 'lips' },
        { name: 'Skiron', value: 'skiron' },
        { name: 'Trakiusz', value: 'trakiusz' }
      ],
      kombinacje: [
        { name: 'EK (Euros-Kajkias)', value: 'ek' },
        { name: 'EA (Euros-Apeliotes)', value: 'ea' },
        { name: 'ZL (Zefir-Lips)', value: 'zl' },
        { name: 'ZS (Zefir-Skiron)', value: 'zs' }
      ]
    };

    res.render('dashboard/wiatry', {
      user: req.user,
      guild: guild,
      channels: textChannels,
      wiatry: wiatry,
      userPermissions: req.userPermissions,
      path: req.path
    });
  } catch (error) {
    logger.error(`Błąd podczas renderowania strony wiatry: ${error.stack}`);
    res.status(500).render('error', {
      user: req.user,
      statusCode: 500,
      message: 'Wystąpił błąd podczas ładowania strony wiatrów'
    });
  }
});

module.exports = router;
