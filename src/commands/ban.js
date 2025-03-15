// Dodaj ten plik jako src/commands/ban.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const Guild = require('../models/Guild');
const MessageLog = require('../models/MessageLog');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Banuje użytkownika z serwera')
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator | 
      PermissionFlagsBits.ManageGuild | 
      PermissionFlagsBits.ManageRoles | 
      PermissionFlagsBits.ManageMessages
  )
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Użytkownik do zbanowania')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Powód bana'))
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('Czas trwania bana (np. 7d, 24h, 30m)')
        .setRequired(false)),

  async execute(interaction) {
    try {
      const user = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'Nie podano powodu';
      const durationStr = interaction.options.getString('duration');
      
      // Sprawdź, czy użytkownik ma wyższe uprawnienia
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      
      if (member) {
        if (!member.bannable) {
          return interaction.reply({
            content: 'Nie mogę zbanować tego użytkownika. Sprawdź, czy moje uprawnienia są wyższe.',
            ephemeral: true
          });
        }

        if (member.roles.highest.position >= interaction.member.roles.highest.position &&
            interaction.user.id !== interaction.guild.ownerId) {
          return interaction.reply({
            content: 'Nie możesz zbanować użytkownika z wyższą lub równą rolą.',
            ephemeral: true
          });
        }
      }
      
      // Przetworzyć czas trwania bana, jeśli został podany
      let expiresAt = null;
      let durationText = '';
      if (durationStr) {
        const { milliseconds, text } = parseDuration(durationStr);
        if (milliseconds > 0) {
          expiresAt = new Date(Date.now() + milliseconds);
          durationText = text;
        }
      }
      
      // Przygotowanie pełnego powodu z informacją o czasie trwania
      let fullReason = reason;
      if (durationText) {
        fullReason = `[Temp: ${durationText}] ${reason}`;
      }
      
      // Wykonanie bana
      await interaction.guild.members.ban(user, { reason: fullReason });
      
      // Przygotuj embed z informacją o banie
      const banEmbed = new EmbedBuilder()
        .setTitle('Użytkownik zbanowany')
        .setColor(0xFF0000)
        .setDescription(`**Użytkownik:** ${user.tag} (${user.id})`)
        .addFields({ name: 'Powód', value: reason })
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();
      
      if (durationText) {
        banEmbed.addFields(
          { name: 'Czas trwania', value: durationText },
          { name: 'Wygaśnie', value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>` }
        );
      }
      
      // Odpowiedz na interakcję
      await interaction.reply({ embeds: [banEmbed] });
      
      // Zapisz do logów w bazie danych
      try {
        // Sprawdź czy funkcja logowania jest włączona
        const guildSettings = await Guild.findOne({ guildId: interaction.guild.id });
        
        if (guildSettings && guildSettings.modules?.messageLog) {
          // Dodaj wpis do logów
          const modAction = {
            type: 'ban',
            targetId: user.id,
            targetTag: user.tag,
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag,
            reason: reason,
            duration: durationText || null,
            expiresAt: expiresAt,
            createdAt: new Date()
          };
          
          // Utwórz nowy log lub dodaj do istniejącego
          await MessageLog.findOneAndUpdate(
            { 
              guildId: interaction.guild.id,
              // Użyj ID wiadomości jako klucza, ale stworzymy fikcyjne ID z prefiksem modlog
              messageId: `modlog-ban-${user.id}-${Date.now()}`
            },
            {
              $set: {
                guildId: interaction.guild.id,
                channelId: interaction.channel.id,
                authorId: interaction.user.id,
                authorTag: interaction.user.tag,
                content: `[Ban] ${user.tag} - ${reason}${durationText ? ` (Czas: ${durationText})` : ''}`,
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
              await logChannel.send({ embeds: [banEmbed] });
            }
          }
        }
      } catch (error) {
        logger.error(`Błąd podczas logowania bana: ${error.stack}`);
      }
    } catch (error) {
      logger.error(`Błąd podczas wykonywania komendy ban: ${error.stack}`);
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: `Wystąpił błąd podczas banowania użytkownika: ${error.message}`,
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: `Wystąpił błąd podczas banowania użytkownika: ${error.message}`,
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