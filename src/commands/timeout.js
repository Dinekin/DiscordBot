// Dodaj ten plik jako src/commands/timeout.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const Guild = require('../models/Guild');
const MessageLog = require('../models/MessageLog');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Wycisza użytkownika na określony czas')
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator | 
      PermissionFlagsBits.ManageGuild | 
      PermissionFlagsBits.ManageRoles | 
      PermissionFlagsBits.ManageMessages
  )
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Użytkownik do wyciszenia')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('Czas trwania wyciszenia (np. 7d, 24h, 30m)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Powód wyciszenia')),

  async execute(interaction) {
    try {
      const user = interaction.options.getUser('user');
      const durationStr = interaction.options.getString('duration');
      const reason = interaction.options.getString('reason') || 'Nie podano powodu';
      
      // Znajdź członka na serwerze
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      
      if (!member) {
        return interaction.reply({
          content: 'Nie znaleziono tego użytkownika na serwerze.',
          ephemeral: true
        });
      }
      
      // Sprawdź uprawnienia
      if (!member.moderatable) {
        return interaction.reply({
          content: 'Nie mogę wyciszyć tego użytkownika. Sprawdź, czy moje uprawnienia są wyższe.',
          ephemeral: true
        });
      }
      
      if (member.roles.highest.position >= interaction.member.roles.highest.position &&
          interaction.user.id !== interaction.guild.ownerId) {
        return interaction.reply({
          content: 'Nie możesz wyciszyć użytkownika z wyższą lub równą rolą.',
          ephemeral: true
        });
      }
      
      // Przetworzyć czas trwania
      const { milliseconds, text } = parseDuration(durationStr);
      
      if (milliseconds <= 0) {
        return interaction.reply({
          content: 'Nieprawidłowy format czasu trwania. Użyj formatu takie jak "1d", "12h", "30m" lub "60s".',
          ephemeral: true
        });
      }
      
      // Sprawdź, czy czas trwania nie przekracza limitu Discord (28 dni)
      const maxTimeout = 28 * 24 * 60 * 60 * 1000; // 28 dni w milisekundach
      
      if (milliseconds > maxTimeout) {
        return interaction.reply({
          content: 'Czas wyciszenia nie może przekraczać 28 dni.',
          ephemeral: true
        });
      }
      
      // Timeout użytkownika
      await member.timeout(milliseconds, reason);
      
      // Oblicz datę wygaśnięcia
      const expiresAt = new Date(Date.now() + milliseconds);
      
      // Przygotuj embed z informacją o wyciszeniu
      const timeoutEmbed = new EmbedBuilder()
        .setTitle('Użytkownik wyciszony')
        .setColor(0x9B59B6)
        .setDescription(`**Użytkownik:** ${user.tag} (${user.id})`)
        .addFields(
          { name: 'Powód', value: reason },
          { name: 'Czas trwania', value: text },
          { name: 'Wygaśnie', value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>` }
        )
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();
      
      // Odpowiedz na interakcję
      await interaction.reply({ embeds: [timeoutEmbed] });
      
      // Zapisz do logów w bazie danych
      try {
        // Sprawdź czy funkcja logowania jest włączona
        const guildSettings = await Guild.findOne({ guildId: interaction.guild.id });
        
        if (guildSettings && guildSettings.modules?.messageLog) {
          // Dodaj wpis do logów
          const modAction = {
            type: 'timeout',
            targetId: user.id,
            targetTag: user.tag,
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag,
            reason: reason,
            duration: text,
            expiresAt: expiresAt,
            createdAt: new Date()
          };
          
          // Utwórz nowy log lub dodaj do istniejącego
          await MessageLog.findOneAndUpdate(
            { 
              guildId: interaction.guild.id,
              messageId: `modlog-timeout-${user.id}-${Date.now()}`
            },
            {
              $set: {
                guildId: interaction.guild.id,
                channelId: interaction.channel.id,
                authorId: interaction.user.id,
                authorTag: interaction.user.tag,
                content: `[Timeout] ${user.tag} - ${reason} (Czas: ${text})`,
                createdAt: new Date()
              },
              $push: { modActions: modAction }
            },
            { upsert: true, new: true }
          );
          
          // Wyślij log na kanał logów jeśli jest ustawiony
          if (guildSettings.messageLogChannel) {
            const logChannel = await interaction.guild.channels.fetch(guildSettings.messageLogChannel).catch(() => null);
            
            if (logChannel) {
              await logChannel.send({ embeds: [timeoutEmbed] });
            }
          }
        }
      } catch (error) {
        logger.error(`Błąd podczas logowania timeout: ${error.stack}`);
      }
    } catch (error) {
      logger.error(`Błąd podczas wykonywania komendy timeout: ${error.stack}`);
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: `Wystąpił błąd podczas wyciszania użytkownika: ${error.message}`,
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: `Wystąpił błąd podczas wyciszania użytkownika: ${error.message}`,
          ephemeral: true
        });
      }
    }
  }
};

// Funkcja pomocnicza do przetwarzania czasu trwania
function parseDuration(durationStr) {
  const durationRegex = /^(\d+)(d|h|m|s)$/i;
  const match = durationRegex.exec(durationStr);
  
  if (!match) return { milliseconds: 0, text: '' };
  
  const amount = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  
  let milliseconds = 0;
  let text = '';
  
  switch (unit) {
    case 'd':
      milliseconds = amount * 24 * 60 * 60 * 1000;
      text = `${amount} ${amount === 1 ? 'dzień' : 'dni'}`;
      break;
    case 'h':
      milliseconds = amount * 60 * 60 * 1000;
      text = `${amount} ${amount === 1 ? 'godzina' : (amount < 5 ? 'godziny' : 'godzin')}`;
      break;
    case 'm':
      milliseconds = amount * 60 * 1000;
      text = `${amount} ${amount === 1 ? 'minuta' : (amount < 5 ? 'minuty' : 'minut')}`;
      break;
    case 's':
      milliseconds = amount * 1000;
      text = `${amount} ${amount === 1 ? 'sekunda' : (amount < 5 ? 'sekundy' : 'sekund')}`;
      break;
  }
  
  return { milliseconds, text };
}