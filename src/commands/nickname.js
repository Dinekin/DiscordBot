
// Dodaj ten plik jako src/commands/nickname.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const Guild = require('../models/Guild');
const MessageLog = require('../models/MessageLog');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nickname')
    .setDescription('Zmienia pseudonim użytkownika')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Użytkownik, któremu chcesz zmienić pseudonim')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('nickname')
        .setDescription('Nowy pseudonim (puste, aby usunąć pseudonim)'))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Powód zmiany pseudonimu')),

  async execute(interaction) {
    try {
      const user = interaction.options.getUser('user');
      const newNickname = interaction.options.getString('nickname') || null;
      const reason = interaction.options.getString('reason') || 'Nie podano powodu';
      
      // Znajdź członka na serwerze
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      
      if (!member) {
        return interaction.reply({
          content: 'Nie znaleziono tego użytkownika na serwerze.',
          ephemeral: true
        });
      }
      
      // Zapisz stary pseudonim
      const oldNickname = member.nickname || null;
      
      // Sprawdź uprawnienia
      if (!member.manageable) {
        return interaction.reply({
          content: 'Nie mogę zmienić pseudonimu tego użytkownika. Sprawdź, czy moje uprawnienia są wyższe.',
          ephemeral: true
        });
      }
      
      if (member.roles.highest.position >= interaction.member.roles.highest.position &&
          interaction.user.id !== interaction.guild.ownerId) {
        return interaction.reply({
          content: 'Nie możesz zmienić pseudonimu użytkownika z wyższą lub równą rolą.',
          ephemeral: true
        });
      }
      
      // Zmień pseudonim
      await member.setNickname(newNickname, reason);
      
      // Przygotuj embed z informacją o zmianie
      const nickEmbed = new EmbedBuilder()
        .setTitle('Zmieniono pseudonim użytkownika')
        .setColor(0x3498DB)
        .setDescription(`**Użytkownik:** ${user.tag} (${user.id})`)
        .addFields(
          { name: 'Poprzedni pseudonim', value: oldNickname || '*Brak pseudonimu*' },
          { name: 'Nowy pseudonim', value: newNickname || '*Brak pseudonimu*' },
          { name: 'Powód', value: reason }
        )
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();
      
      // Odpowiedz na interakcję
      await interaction.reply({ embeds: [nickEmbed] });
      
      // Zapisz do logów w bazie danych
      try {
        // Sprawdź czy funkcja logowania jest włączona
        const guildSettings = await Guild.findOne({ guildId: interaction.guild.id });
        
        if (guildSettings && guildSettings.modules?.messageLog) {
          // Dodaj wpis do logów
          const nicknameChange = {
            userId: user.id,
            userTag: user.tag,
            oldNickname: oldNickname,
            newNickname: newNickname,
            changedById: interaction.user.id,
            changedByTag: interaction.user.tag,
            reason: reason,
            createdAt: new Date()
          };
          
          // Utwórz nowy log lub dodaj do istniejącego
          await MessageLog.findOneAndUpdate(
            { 
              guildId: interaction.guild.id,
              messageId: `modlog-nickname-${user.id}-${Date.now()}`
            },
            {
              $set: {
                guildId: interaction.guild.id,
                channelId: interaction.channel.id,
                authorId: interaction.user.id,
                authorTag: interaction.user.tag,
                content: `[Nickname] ${user.tag} - ${oldNickname || 'None'} → ${newNickname || 'None'}`,
                createdAt: new Date()
              },
              $push: { nicknameChanges: nicknameChange }
            },
            { upsert: true, new: true }
          );
          
          // Wyślij log na kanał logów jeśli jest ustawiony
          if (guildSettings.messageLogChannel) {
            const logChannel = await interaction.guild.channels.fetch(guildSettings.messageLogChannel).catch(() => null);
            
            if (logChannel) {
              await logChannel.send({ embeds: [nickEmbed] });
            }
          }
        }
      } catch (error) {
        logger.error(`Błąd podczas logowania zmiany pseudonimu: ${error.stack}`);
      }
    } catch (error) {
      logger.error(`Błąd podczas wykonywania komendy nickname: ${error.stack}`);
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: `Wystąpił błąd podczas zmiany pseudonimu: ${error.message}`,
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: `Wystąpił błąd podczas zmiany pseudonimu: ${error.message}`,
          ephemeral: true
        });
      }
    }
  }
};