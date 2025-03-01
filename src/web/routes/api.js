const express = require('express');
const router = express.Router();
const { client } = require('../../bot');
const Guild = require('../../models/Guild');
const ReactionRole = require('../../models/ReactionRole');
const { EmbedBuilder } = require('discord.js');

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

// Aktualizacja ustawień serwera
router.post('/guilds/:guildId/settings', hasGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  
  try {
    // Zaktualizuj ustawienia w bazie danych
    const updatedSettings = await Guild.findOneAndUpdate(
      { guildId: guildId },
      {
        prefix: req.body.prefix,
        notificationChannel: req.body.notificationChannel,
        welcomeChannel: req.body.welcomeChannel,
        language: req.body.language,
        modules: {
          reactionRoles: req.body.modules?.reactionRoles === 'true',
          notifications: req.body.modules?.notifications === 'true'
        }
      },
      { new: true, upsert: true }
    );
    
    res.json({
      success: true,
      message: 'Ustawienia zostały zaktualizowane',
      settings: updatedSettings
    });
  } catch (error) {
    console.error('Błąd podczas aktualizacji ustawień:', error);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas aktualizacji ustawień'
    });
  }
});

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
    
    res.json({
      success: true,
      message: 'Wiadomość z rolami reakcji została utworzona',
      reactionRole: reactionRole
    });
  } catch (error) {
    console.error('Błąd podczas tworzenia reaction roles:', error);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas tworzenia reaction roles'
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
    console.error('Błąd podczas dodawania roli:', error);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas dodawania roli'
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
    
    res.json({
      success: true,
      message: 'Rola została usunięta',
      removedRole: {
        emoji: removedRole.emoji,
        roleId: removedRole.roleId
      }
    });
  } catch (error) {
    console.error('Błąd podczas usuwania roli:', error);
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
    } catch (error) {
      console.warn('Nie można usunąć wiadomości Discord:', error);
      // Kontynuuj, ponieważ mogła zostać już usunięta ręcznie
    }
    
    res.json({
      success: true,
      message: 'Wiadomość z rolami reakcji została usunięta'
    });
  } catch (error) {
    console.error('Błąd podczas usuwania reaction roles:', error);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas usuwania reaction roles'
    });
  }
});

module.exports = router;
