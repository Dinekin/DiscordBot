const express = require('express');
const router = express.Router();
const { client } = require('../../bot');
const Guild = require('../../models/Guild');
const ReactionRole = require('../../models/ReactionRole');
const MessageLog = require('../../models/MessageLog');
const logger = require('../../utils/logger');

const MOD_PERMISSIONS = {
  ADMIN: 0x8,             // ADMINISTRATOR
  MANAGE_GUILD: 0x20,     // MANAGE_GUILD
  MANAGE_ROLES: 0x10000000, // MANAGE_ROLES
  MANAGE_MESSAGES: 0x2000 // MANAGE_MESSAGES
};

function hasModeratorPermission(userPermissions) {
  return (userPermissions & MOD_PERMISSIONS.ADMIN) === MOD_PERMISSIONS.ADMIN ||
         (userPermissions & MOD_PERMISSIONS.MANAGE_GUILD) === MOD_PERMISSIONS.MANAGE_GUILD ||
         (userPermissions & MOD_PERMISSIONS.MANAGE_ROLES) === MOD_PERMISSIONS.MANAGE_ROLES ||
         (userPermissions & MOD_PERMISSIONS.MANAGE_MESSAGES) === MOD_PERMISSIONS.MANAGE_MESSAGES;
}


// Middleware do sprawdzania uprawnień na serwerze
function hasGuildPermission(req, res, next) {
  if (!req.params.guildId) {
    return res.redirect('/dashboard');
  }
  
  const guild = req.user.guilds.find(g => g.id === req.params.guildId);
  
  if (!guild) {
    return res.redirect('/dashboard');
  }
  
  // Sprawdź czy użytkownik ma uprawnienia moderatora
  const hasPermission = hasModeratorPermission(guild.permissions);
  
  if (!hasPermission) {
    // Zapisz komunikat błędu w sesji (opcjonalnie)
    if (req.session) {
      req.session.flashMessage = {
        type: 'danger',
        content: 'Nie masz wystarczających uprawnień na tym serwerze.'
      };
    }
    return res.redirect('/dashboard');
  }
  
  // Dodaj informacje o uprawnieniach do obiektu req
  req.userPermissions = {
    isAdmin: (guild.permissions & MOD_PERMISSIONS.ADMIN) === MOD_PERMISSIONS.ADMIN,
    canManageGuild: (guild.permissions & MOD_PERMISSIONS.MANAGE_GUILD) === MOD_PERMISSIONS.MANAGE_GUILD,
    canManageRoles: (guild.permissions & MOD_PERMISSIONS.MANAGE_ROLES) === MOD_PERMISSIONS.MANAGE_ROLES,
    canManageMessages: (guild.permissions & MOD_PERMISSIONS.MANAGE_MESSAGES) === MOD_PERMISSIONS.MANAGE_MESSAGES
  };
  
  next();
}

// Lista serwerów
router.get('/', async (req, res) => {
  // Filtruj serwery, gdzie użytkownik ma uprawnienia administratora lub moderatora
  const allowedGuilds = req.user.guilds.filter(g => hasModeratorPermission(g.permissions));
  
  // Sprawdź, które serwery mają bota
  const botGuilds = client.guilds.cache.map(g => g.id);
  
  // Oznacz serwery, na których jest bot
  const guilds = allowedGuilds.map(g => ({
    ...g,
    hasBot: botGuilds.includes(g.id)
  }));
  
  res.render('dashboard/index', {
    user: req.user,
    guilds: guilds,
    hasModeratorPermission: hasModeratorPermission
  });
});

// Panel zarządzania serwerem
router.get('/guild/:guildId', hasGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  
  // Pobierz dane serwera z bazy danych
  let guildSettings = await Guild.findOne({ guildId: guildId });
  
  // Jeśli nie ma w bazie, stwórz nowy rekord
  if (!guildSettings) {
    guildSettings = await Guild.create({
      guildId: guildId
    });
  }
  
  // Pobierz dane serwera z Discorda
  const guild = client.guilds.cache.get(guildId);
  
  if (!guild) {
    return res.render('dashboard/not-in-guild', {
      user: req.user,
      guild: req.user.guilds.find(g => g.id === guildId)
    });
  }
  
  // Renderuj panel zarządzania
  res.render('dashboard/guild', {
    user: req.user,
    guild: guild,
    settings: guildSettings,
    userPermissions: req.userPermissions
  });
});

// Konfiguracja ogólna serwera
router.get('/guild/:guildId/settings', hasGuildPermission, async (req, res) => {
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
    userPermissions: req.userPermissions
  });
});

// Zarządzanie reaction roles
router.get('/guild/:guildId/reaction-roles', hasGuildPermission, async (req, res) => {
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
    userPermissions: req.userPermissions
  });
});
// Zarządzanie logami wiadomości
router.get('/guild/:guildId/message-logs', hasGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  
  // Pobierz dane serwera z Discorda
  const guild = client.guilds.cache.get(guildId);
  
  if (!guild) {
    logger.warn(`Próba dostępu do panelu message-logs dla serwera ${guildId}, ale bot nie jest na tym serwerze`);
    return res.redirect('/dashboard');
  }
  
  try {
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
      userPermissions: req.userPermissions
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
  const guildId = req.params.guildId;
  
  // Pobierz dane serwera z Discorda
  const guild = client.guilds.cache.get(guildId);
  
  if (!guild) {
    return res.redirect('/dashboard');
  }
  
  try {
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
      userPermissions: req.userPermissions
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

// Dodaj tę trasę do modułu router w pliku src/web/routes/dashboard.js
router.get('/guild/:guildId/giveaways', hasGuildPermission, async (req, res) => {
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
    userPermissions: req.userPermissions
  });
});

module.exports = router;