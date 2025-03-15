const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const UserRole = require('../models/UserRole');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roles')
    .setDescription('Zarządza zapisanymi rolami użytkowników')
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator | 
      PermissionFlagsBits.ManageGuild | 
      PermissionFlagsBits.ManageRoles | 
      PermissionFlagsBits.ManageMessages
  )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Wyświetla zapisane role użytkownika')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Użytkownik, którego zapisane role chcesz zobaczyć')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('restore')
        .setDescription('Przywraca zapisane role użytkownikowi')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Użytkownik, któremu chcesz przywrócić role')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete')
        .setDescription('Usuwa zapisane role użytkownika')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Użytkownik, którego zapisane role chcesz usunąć')
            .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
                  .setName('expiry')
                  .setDescription('Ustawia czas wygaśnięcia zapisanych ról użytkownika')
                  .addUserOption(option =>
                    option.setName('user')
                      .setDescription('Użytkownik, którego czas wygaśnięcia chcesz ustawić')
                      .setRequired(true))
                  .addIntegerOption(option =>
                    option.setName('days')
                      .setDescription('Liczba dni do wygaśnięcia (0 = nigdy)')
                      .setRequired(true)
                      .setMinValue(0)
                      .setMaxValue(365))),
            

  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      const user = interaction.options.getUser('user');
      const member = interaction.options.getMember('user');
      
      // Wyszukaj zapisane role użytkownika
      const userRoleData = await UserRole.findOne({
        guildId: interaction.guild.id,
        userId: user.id
      });
      
      if (subcommand === 'list') {
        if (!userRoleData || userRoleData.roles.length === 0) {
          return interaction.reply({
            content: `Nie znaleziono zapisanych ról dla użytkownika ${user.tag}.`,
            ephemeral: true
          });
        }
        
        // Utwórz listę ról
        const roles = userRoleData.roles.map(roleId => {
          const role = interaction.guild.roles.cache.get(roleId);
          return role ? role.toString() : `nieznana rola (${roleId})`;
        });
        
        // Stwórz embed z informacjami
        const embed = new EmbedBuilder()
          .setTitle(`Zapisane role użytkownika ${user.tag}`)
          .setColor(0x3498db)
          .setThumbnail(user.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: 'Użytkownik', value: `${user.tag} (${user.id})` },
            { name: 'Zapisanych ról', value: roles.length.toString() },
            { name: 'Role', value: roles.join('\n') || 'Brak' }
          )
          .setFooter({ text: `Opuścił serwer: ${userRoleData.leftAt ? new Date(userRoleData.leftAt).toLocaleString() : 'Nieznana data'}` })
          .setTimestamp();
        
        if (userRoleData.nickname) {
          embed.addFields({ name: 'Zapisany pseudonim', value: userRoleData.nickname });
        }
        
        return interaction.reply({ embeds: [embed] });
      }
      
      if (subcommand === 'restore') {
        if (!member) {
          return interaction.reply({
            content: `Użytkownik ${user.tag} nie jest obecnie na serwerze.`,
            ephemeral: true
          });
        }
        
        if (!userRoleData || userRoleData.roles.length === 0) {
          return interaction.reply({
            content: `Nie znaleziono zapisanych ról dla użytkownika ${user.tag}.`,
            ephemeral: true
          });
        }
        
        // Przygotuj role do przywrócenia
        const rolesToRestore = userRoleData.roles.filter(roleId => {
          const role = interaction.guild.roles.cache.get(roleId);
          return role && !role.managed;
        });
        
        if (rolesToRestore.length === 0) {
          return interaction.reply({
            content: `Nie znaleziono poprawnych ról do przywrócenia dla użytkownika ${user.tag}.`,
            ephemeral: true
          });
        }
        
        // Dodaj role użytkownikowi
        await member.roles.add(rolesToRestore);
        
        // Opcjonalnie przywróć również pseudonim
        if (userRoleData.nickname) {
          try {
            await member.setNickname(userRoleData.nickname);
          } catch (nickError) {
            logger.warn(`Nie można przywrócić pseudonimu dla ${user.tag}: ${nickError.message}`);
          }
        }
        
        const rolesText = rolesToRestore.map(roleId => {
          const role = interaction.guild.roles.cache.get(roleId);
          return role ? role.toString() : `nieznana rola (${roleId})`;
        }).join('\n');
        
        const embed = new EmbedBuilder()
          .setTitle(`Przywrócono role użytkownikowi ${user.tag}`)
          .setColor(0x2ecc71)
          .setDescription(`Pomyślnie przywrócono ${rolesToRestore.length} ról`)
          .addFields(
            { name: 'Przywrócone role', value: rolesText }
          )
          .setTimestamp();
        
        if (userRoleData.nickname) {
          embed.addFields({ name: 'Przywrócony pseudonim', value: userRoleData.nickname });
        }
        
        return interaction.reply({ embeds: [embed] });
      }
      
      if (subcommand === 'delete') {
        if (!userRoleData) {
          return interaction.reply({
            content: `Nie znaleziono zapisanych ról dla użytkownika ${user.tag}.`,
            ephemeral: true
          });
        }
        
        // Usuń zapisane role
        await UserRole.deleteOne({ guildId: interaction.guild.id, userId: user.id });
        
        return interaction.reply({
          content: `Pomyślnie usunięto zapisane role użytkownika ${user.tag}.`,
          ephemeral: true
        });
      }
    } catch (error) {
      logger.error(`Błąd podczas wykonywania komendy roles: ${error.stack}`);
      
      return interaction.reply({
        content: `Wystąpił błąd podczas wykonywania komendy: ${error.message}`,
        ephemeral: true
      });
    }

    if (subcommand === 'expiry') {
        const days = interaction.options.getInteger('days');
        
        if (!userRoleData) {
          return interaction.reply({
            content: `Nie znaleziono zapisanych ról dla użytkownika ${user.tag}.`,
            ephemeral: true
          });
        }
        
        // Ustaw datę wygaśnięcia
        userRoleData.expiresAt = days > 0 
          ? new Date(Date.now() + (days * 24 * 60 * 60 * 1000)) 
          : null;
        
        await userRoleData.save();
        
        return interaction.reply({
          content: days > 0
            ? `Ustawiono wygaśnięcie zapisanych ról użytkownika ${user.tag} za ${days} dni.`
            : `Usunięto czas wygaśnięcia zapisanych ról użytkownika ${user.tag}.`,
          ephemeral: true
        });
      }
  }
};