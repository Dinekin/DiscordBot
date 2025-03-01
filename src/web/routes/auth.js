const express = require('express');
const router = express.Router();
const passport = require('passport');

// Strona logowania
router.get('/login', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/dashboard');
  }
  res.render('login', { user: req.user });
});

// Rozpoczęcie uwierzytelniania Discord
router.get('/auth/discord', passport.authenticate('discord'));

// Callback uwierzytelniania Discord
router.get('/auth/discord/callback', 
  passport.authenticate('discord', { 
    failureRedirect: '/login',
    successRedirect: '/dashboard'
  })
);

// Wylogowanie
router.get('/logout', (req, res) => {
  req.logout(function(err) {
    if (err) { return next(err); }
    res.redirect('/');
  });
});

module.exports = router;
