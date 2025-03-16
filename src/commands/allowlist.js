// src/commands/allowlist.js
// Komenda do zarządzania listą dozwolonych serwerów
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const guildAllowlistManager = require('../utils/guildAllowlistManager');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('allowlist')
    .setDescription('Zarządzanie listą dozwolonych serwerów')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Dodaje serwer do listy dozwolonych')
        .addStringOption(option =>
          option.setName('guild_id')
            .setDescription('ID serwera do dodania')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Usuwa serwer z listy dozwolonych')
        .addStringOption(option =>
          option.setName('guild_id')
            .setDescription('ID serwera do usunięcia')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Wyświetla listę dozwolonych serwerów'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('mode')
        .setDescription('Ustawia tryb weryfikacji zaproszeń')
        .addStringOption(option =>
          option.setName('mode')
            .setDescription('Tryb weryfikacji')
            .setRequired(true)
            .addChoices(
              { name: 'Ścisły (opuszcza niedozwolone serwery)', value: 'STRICT' },
              { name: 'Ostrzegawczy (loguje, ale nie opuszcza)', value: 'WARN' },
              { name: 'Wyłączony (akceptuje wszystkie serwery)', value: 'OFF' }
            ))),

  async execute(interaction) {
    // Sprawdź czy użytkownik jest właścicielem bota
    const botOwnerId = process.env.BOT_OWNER_ID;
    if (botOwnerId && interaction.user.id !== botOwnerId) {
      return interaction.reply({
        content: 'Ta komenda jest dostępna tylko dla właściciela bota.',
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'add') {
      const guildId = interaction.options.getString('guild_id');
      
      // Próba pobrania informacji o serwerze
      let guildName = 'Nieznana nazwa';
      try {
        const guild = await interaction.client.guilds.fetch(guildId);
        guildName = guild.name;
      } catch (error) {
        logger.warn(`Nie można pobrać informacji o serwerze ${guildId}: ${error.message}`);
      }
      
      const result = await guildAllowlistManager.addGuild(guildId, guildName);
      
      return interaction.reply({
        content: result.message,
        ephemeral: true
      });
    }
    
    else if (subcommand === 'remove') {
      const guildId = interaction.options.getString('guild_id');
      const result = await guildAllowlistManager.removeGuild(guildId);
      
      return interaction.reply({
        content: result.message,
        ephemeral: true
      });
    }
    
    else if (subcommand === 'list') {
      const allowedGuilds = guildAllowlistManager.getallowedGuilds();
      
      if (allowedGuilds.length === 0) {
        return interaction.reply({
          content: 'Lista dozwolonych serwerów jest pusta.',
          ephemeral: true
        });
      }
      
      // Spróbuj pobrać nazwy serwerów
      let guildList = '';
      for (const guildId of allowedGuilds) {
        try {
          const guild = await interaction.client.guilds.fetch(guildId);
          guildList += `- ${guild.name} (${guildId})\n`;
        } catch (error) {
          guildList += `- Nieznany serwer (${guildId})\n`;
        }
      }
      
      return interaction.reply({
        content: `**Dozwolone serwery:**\n${guildList}`,
        ephemeral: true
      });
    }
    
    else if (subcommand === 'mode') {
      const mode = interaction.options.getString('mode');
      const success = guildAllowlistManager.setVerificationMode(mode);
      
      if (success) {
        return interaction.reply({
          content: `Ustawiono tryb weryfikacji na: ${mode}`,
          ephemeral: true
        });
      } else {
        return interaction.reply({
          content: 'Nie udało się zmienić trybu weryfikacji.',
          ephemeral: true
        });
      }
    }
  },
};