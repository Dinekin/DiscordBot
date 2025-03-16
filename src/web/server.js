const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const mongoose = require('mongoose');
const MongoStore = require('connect-mongo');
const path = require('path');
const { client } = require('../bot');
const setupHelpers = require('./helpers');

const app = express();
setupHelpers(app);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

// Ustawienia EJS
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Sesja
app.use(session({
  secret: process.env.SESSION_SECRET,
  cookie: {
    maxAge: 60000 * 60 * 24 // 1 dzień
  },
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ 
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions' 
  })
}));

// Inicjalizacja Passport.js
app.use(passport.initialize());
app.use(passport.session());

// Strategia uwierzytelniania Discord
passport.use(new DiscordStrategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: process.env.CALLBACK_URL,
  scope: ['identify', 'guilds']
}, async (accessToken, refreshToken, profile, done) => {
  // Zapisywanie lub aktualizacja użytkownika w bazie danych mogłaby być tutaj
  return done(null, profile);
}));

// Serializacja i deserializacja użytkownika
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

// Middleware do sprawdzania autoryzacji
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
}

// Definiujemy stałe dla uprawnień
const PERMISSIONS = {
  ADMIN: 0x8,              // ADMINISTRATOR
  MANAGE_GUILD: 0x20,      // MANAGE_GUILD
  MANAGE_ROLES: 0x10000000, // MANAGE_ROLES
  MANAGE_MESSAGES: 0x2000   // MANAGE_MESSAGES
};

// Funkcja pomocnicza do sprawdzania uprawnień
function hasModeratorPermissions(permissions) {
  return (permissions & PERMISSIONS.ADMIN) === PERMISSIONS.ADMIN ||
         (permissions & PERMISSIONS.MANAGE_GUILD) === PERMISSIONS.MANAGE_GUILD ||
         (permissions & PERMISSIONS.MANAGE_ROLES) === PERMISSIONS.MANAGE_ROLES ||
         (permissions & PERMISSIONS.MANAGE_MESSAGES) === PERMISSIONS.MANAGE_MESSAGES;
}

// Dodaj funkcję pomocniczą globalne dla wszystkich widoków
app.locals.hasModeratorPermissions = hasModeratorPermissions;
app.locals.PERMISSIONS = PERMISSIONS;

// Ładowanie tras
app.use('/', require('./routes/auth'));
app.use('/dashboard', isAuthenticated, require('./routes/dashboard'));
app.use('/api', isAuthenticated, require('./routes/api'));

// Middleware dla zmiennej path we wszystkich widokach
app.use((req, res, next) => {
  res.locals.path = req.path;
  next();
});

// Strona główna
app.get('/', (req, res) => {
  res.render('index', { 
    user: req.user,
    botUser: client.user
  });
});

// Obsługa błędów 404
app.use((req, res, next) => {
  res.status(404).render('error', {
    user: req.user,
    statusCode: 404,
    message: 'Strona nie została znaleziona'
  });
});

// Obsługa innych błędów
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', {
    user: req.user,
    statusCode: 500,
    message: 'Wystąpił błąd serwera'
  });
});

// Funkcja do uruchomienia serwera
function startWebServer() {
  const PORT = process.env.WEB_PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Serwer web uruchomiony na porcie ${PORT}`);
  });
}

module.exports = { startWebServer };