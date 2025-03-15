const express = require('express');
const router = express.Router();
const { client } = require('../../bot');
const Guild = require('../../models/Guild');
const ReactionRole = require('../../models/ReactionRole');
const MessageLog = require('../../models/MessageLog');
const logger = require('../../utils/logger');

// Middleware do sprawdzania uprawnień na serwerze
function hasGuildPermission(req, res, next) {
  if (!req.params.guildId) {
    return res.redirect('/dashboard');
  }
  
  const guild = req.user.guilds.find(g => g.id === req.params.guildId);
  
  if (!guild) {
    return res.redirect('/dashboard');
  }
  
  // Uprawnienia moderatora i administratora
  // 0x8 - ADMINISTRATOR
  // 0x20 - MANAGE_GUILD
  // 0x10000000 - MANAGE_ROLES
  // 0x2000 - MANAGE_MESSAGES
  const hasAdminPermission = (guild.permissions & 0x8) === 0x8; // Administrator
  const hasManageGuildPermission = (guild.permissions & 0x20) === 0x20; // Manage Guild
  const hasManageRolesPermission = (guild.permissions & 0x10000000) === 0x10000000; // Manage Roles
  const hasManageMessagesPermission = (guild.permissions & 0x2000) === 0x2000; // Manage Messages
  
  // Użytkownik potrzebuje przynajmniej jednego z tych uprawnień
  const hasPermission = hasAdminPermission || hasManageGuildPermission || 
                        hasManageRolesPermission || hasManageMessagesPermission;
  
  if (!hasPermission) {
    return res.redirect('/dashboard');
  }
  
  // Dodaj informacje o uprawnieniach do obiektu req
  req.userPermissions = {
    isAdmin: hasAdminPermission,
    canManageGuild: hasManageGuildPermission,
    canManageRoles: hasManageRolesPermission,
    canManageMessages: hasManageMessagesPermission
  };
  
  next();
}

// Lista serwerów
router.get('/', async (req, res) => {
  // Filtruj serwery, gdzie użytkownik ma uprawnienia administratora
  const adminGuilds = req.user.guilds.filter(g => (g.permissions & 0x8) === 0x8);
  
  // Sprawdź, które serwery mają bota
  const botGuilds = client.guilds.cache.map(g => g.id);
  
  // Oznacz serwery, na których jest bot
  const guilds = adminGuilds.map(g => ({
    ...g,
    hasBot: botGuilds.includes(g.id)
  }));
  
  res.render('dashboard/index', {
    user: req.user,
    guilds: guilds
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
    settings: guildSettings
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
    channels: textChannels
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
    roles: roles
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
      channels: textChannels
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
      channels: textChannels
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
    channels: textChannels
  });
});

module.exports = router;