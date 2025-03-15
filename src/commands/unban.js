// Dodaj ten plik jako src/commands/unban.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const Guild = require('../models/Guild');
const MessageLog = require('../models/MessageLog');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Zdejmuje bana użytkownikowi')
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator | 
      PermissionFlagsBits.ManageGuild | 
      PermissionFlagsBits.ManageRoles | 
      PermissionFlagsBits.ManageMessages
  )
    .addStringOption(option =>
      option.setName('userid')
        .setDescription('ID użytkownika do odbanowania')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Powód odbanowania')),

  async execute(interaction) {
    try {
      const userId = interaction.options.getString('userid');
      const reason = interaction.options.getString('reason') || 'Nie podano powodu';
      
      // Sprawdź, czy użytkownik jest zbanowany
      const banList = await interaction.guild.bans.fetch();
      const ban = banList.get(userId);
      
      if (!ban) {
        return interaction.reply({
          content: 'Ten użytkownik nie jest zbanowany.',
          ephemeral: true
        });
      }
      
      // Zdejmij bana
      await interaction.guild.members.unban(userId, reason);
      
      // Przygotuj embed z informacją o odbanowaniu
      const unbanEmbed = new EmbedBuilder()
        .setTitle('Użytkownik odbanowany')
        .setColor(0x00FF00)
        .setDescription(`**ID użytkownika:** ${userId}${ban.user ? ` (${ban.user.tag})` : ''}`)
        .addFields(
          { name: 'Powód odbanowania', value: reason },
          { name: 'Poprzedni powód bana', value: ban.reason || 'Brak informacji' }
        )
        .setTimestamp();
      
      if (ban.user) {
        unbanEmbed.setThumbnail(ban.user.displayAvatarURL({ dynamic: true }));
      }
      
      // Odpowiedz na interakcję
      await interaction.reply({ embeds: [unbanEmbed] });
      
      // Zapisz do logów w bazie danych
      try {
        // Sprawdź czy funkcja logowania jest włączona
        const guildSettings = await Guild.findOne({ guildId: interaction.guild.id });
        
        if (guildSettings && guildSettings.modules?.messageLog) {
          // Dodaj wpis do logów
          const modAction = {
            type: 'unban',
            targetId: userId,
            targetTag: ban.user ? ban.user.tag : 'Nieznany',
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag,
            reason: reason,
            createdAt: new Date()
          };
          
          // Utwórz nowy log lub dodaj do istniejącego
          await MessageLog.findOneAndUpdate(
            { 
              guildId: interaction.guild.id,
              messageId: `modlog-unban-${userId}-${Date.now()}`
            },
            {
              $set: {
                guildId: interaction.guild.id,
                channelId: interaction.channel.id,
                authorId: interaction.user.id,
                authorTag: interaction.user.tag,
                content: `[Unban] ${ban.user ? ban.user.tag : userId} - ${reason}`,
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
              await logChannel.send({ embeds: [unbanEmbed] });
            }
          }
        }
      } catch (error) {
        logger.error(`Błąd podczas logowania odbanowania: ${error.stack}`);
      }
    } catch (error) {
      logger.error(`Błąd podczas wykonywania komendy unban: ${error.stack}`);
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: `Wystąpił błąd podczas odbanowywania użytkownika: ${error.message}`,
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: `Wystąpił błąd podczas odbanowywania użytkownika: ${error.message}`,
          ephemeral: true
        });
      }
    }
  }
};
