// Dodaj ten plik jako src/commands/kick.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const Guild = require('../models/Guild');
const MessageLog = require('../models/MessageLog');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Wyrzuca użytkownika z serwera')
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator | 
      PermissionFlagsBits.ManageGuild | 
      PermissionFlagsBits.ManageRoles | 
      PermissionFlagsBits.ManageMessages
  )
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Użytkownik do wyrzucenia')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Powód wyrzucenia')),

  async execute(interaction) {
    try {
      const user = interaction.options.getUser('user');
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
      if (!member.kickable) {
        return interaction.reply({
          content: 'Nie mogę wyrzucić tego użytkownika. Sprawdź, czy moje uprawnienia są wyższe.',
          ephemeral: true
        });
      }
      
      if (member.roles.highest.position >= interaction.member.roles.highest.position &&
          interaction.user.id !== interaction.guild.ownerId) {
        return interaction.reply({
          content: 'Nie możesz wyrzucić użytkownika z wyższą lub równą rolą.',
          ephemeral: true
        });
      }
      
      // Wyrzuć użytkownika
      await member.kick(reason);
      
      // Przygotuj embed z informacją o wyrzuceniu
      const kickEmbed = new EmbedBuilder()
        .setTitle('Użytkownik wyrzucony')
        .setColor(0xFF9900)
        .setDescription(`**Użytkownik:** ${user.tag} (${user.id})`)
        .addFields({ name: 'Powód', value: reason })
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();
      
      // Odpowiedz na interakcję
      await interaction.reply({ embeds: [kickEmbed] });
      
      // Zapisz do logów w bazie danych
      try {
        // Sprawdź czy funkcja logowania jest włączona
        const guildSettings = await Guild.findOne({ guildId: interaction.guild.id });
        
        if (guildSettings && guildSettings.modules?.messageLog) {
          // Dodaj wpis do logów
          const modAction = {
            type: 'kick',
            targetId: user.id,
            targetTag: user.tag,
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag,
            reason: reason,
            createdAt: new Date()
          };
          
          // Utwórz nowy log lub dodaj do istniejącego
          await MessageLog.findOneAndUpdate(
            { 
              guildId: interaction.guild.id,
              messageId: `modlog-kick-${user.id}-${Date.now()}`
            },
            {
              $set: {
                guildId: interaction.guild.id,
                channelId: interaction.channel.id,
                authorId: interaction.user.id,
                authorTag: interaction.user.tag,
                content: `[Kick] ${user.tag} - ${reason}`,
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
              await logChannel.send({ embeds: [kickEmbed] });
            }
          }
        }
      } catch (error) {
        logger.error(`Błąd podczas logowania wyrzucenia: ${error.stack}`);
      }
    } catch (error) {
      logger.error(`Błąd podczas wykonywania komendy kick: ${error.stack}`);
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: `Wystąpił błąd podczas wyrzucania użytkownika: ${error.message}`,
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: `Wystąpił błąd podczas wyrzucania użytkownika: ${error.message}`,
          ephemeral: true
        });
      }
    }
  }
};