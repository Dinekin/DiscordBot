const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const MessageLog = require('../models/MessageLog');
const Guild = require('../models/Guild');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('messagelog')
    .setDescription('Zarządzaj lub przeglądaj logi wiadomości')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(subcommand =>
      subcommand
        .setName('search')
        .setDescription('Wyszukaj wiadomości użytkownika')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Użytkownik, którego wiadomości chcesz znaleźć')
            .setRequired(true))
        .addIntegerOption(option =>
          option.setName('limit')
            .setDescription('Liczba wiadomości do pobrania (maksymalnie 10)')
            .setMinValue(1)
            .setMaxValue(10))
        .addBooleanOption(option =>
          option.setName('deleted')
            .setDescription('Czy pokazać tylko usunięte wiadomości')))
    .addSubcommand(subcommand =>
      subcommand
        .setName('channel')
        .setDescription('Ustaw kanał logowania wiadomości')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Kanał do logowania wiadomości')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('toggle')
        .setDescription('Włącz lub wyłącz logowanie wiadomości')
        .addBooleanOption(option =>
          option.setName('enabled')
            .setDescription('Czy logowanie wiadomości jest włączone')
            .setRequired(true))),
  
  async execute(interaction) {
    logger.info(`Rozpoczęto wykonywanie komendy messagelog przez ${interaction.user.tag}`);
    
    const subcommand = interaction.options.getSubcommand();
    logger.debug(`Podkomenda messagelog: ${subcommand}`);
    
    // Pobierz ustawienia serwera
    let guildSettings = await Guild.findOne({ guildId: interaction.guildId });
    
    // Jeśli nie ma, utwórz nowe
    if (!guildSettings) {
      logger.debug(`Nie znaleziono ustawień dla serwera ${interaction.guildId}, tworzenie nowych`);
      guildSettings = await Guild.create({
        guildId: interaction.guildId,
        modules: {
          messageLog: false
        }
      });
    }
    
    if (subcommand === 'search') {
      logger.debug(`Wykonywanie podkomendy search`);
      const user = interaction.options.getUser('user');
      const limit = interaction.options.getInteger('limit') || 5;
      const showDeleted = interaction.options.getBoolean('deleted') || false;
      
      await interaction.deferReply({ ephemeral: true });
      
      // Stwórz filtr wyszukiwania
      const filter = { 
        guildId: interaction.guildId, 
        authorId: user.id 
      };
      
      // Jeśli ma pokazać tylko usunięte, dodaj warunek
      if (showDeleted) {
        filter.deletedAt = { $ne: null };
      }
      
      logger.debug(`Filtr wyszukiwania: ${JSON.stringify(filter)}`);
      
      try {
        // Pobierz logi wiadomości
        const logs = await MessageLog.find(filter)
          .sort({ createdAt: -1 })
          .limit(limit);
          
        logger.debug(`Znaleziono ${logs.length} wiadomości`);
      
        if (logs.length === 0) {
          return interaction.editReply({
            content: `Nie znaleziono żadnych wiadomości ${showDeleted ? 'usuniętych ' : ''}użytkownika ${user.tag}.`,
            ephemeral: true
          });
        }
        
        // Stwórz embedded z wynikami
        const embed = new EmbedBuilder()
          .setTitle(`Logi wiadomości: ${user.tag}`)
          .setColor(showDeleted ? '#e74c3c' : '#3498db')
          .setThumbnail(user.displayAvatarURL({ dynamic: true }))
          .setFooter({ text: `ID użytkownika: ${user.id}` })
          .setTimestamp();
        
        // Dodaj wiadomości do embedu
        logs.forEach((log, index) => {
          const messageDate = `<t:${Math.floor(log.createdAt.getTime() / 1000)}:R>`;
          const channelInfo = `<#${log.channelId}>`;
          const status = log.deletedAt ? '🗑️ Usunięta' : log.editedAt ? '✏️ Edytowana' : '📝 Wysłana';
          
          let content = log.content ? log.content.substring(0, 512) : '*Brak treści*';
          if (log.content && log.content.length > 512) {
            content += '... (skrócono)';
          }
          
          let attachmentText = '';
          if (log.attachments && log.attachments.length > 0) {
            attachmentText = '\n📎 ' + log.attachments.map(a => a.name).join(', ');
          }
          
          embed.addFields({
            name: `${status} ${messageDate} w ${channelInfo}`,
            value: content + attachmentText
          });
        });
        
        await interaction.editReply({
          embeds: [embed],
          ephemeral: true
        });
      } catch (error) {
        logger.error(`Błąd podczas wyszukiwania wiadomości: ${error.stack}`);
        return interaction.editReply({
          content: `Wystąpił błąd podczas wyszukiwania wiadomości: ${error.message}`,
          ephemeral: true
        });
      }
    }
    
    else if (subcommand === 'channel') {
      logger.debug(`Wykonywanie podkomendy channel`);
      const channel = interaction.options.getChannel('channel');
      
      // Sprawdź typ kanału
      if (channel.type !== 0) { // 0 = kanał tekstowy
        logger.warn(`Użytkownik próbował ustawić kanał typu ${channel.type} jako kanał logów`);
        return interaction.reply({
          content: 'Musisz wybrać kanał tekstowy!',
          ephemeral: true
        });
      }
      
      try {
        // Zaktualizuj ustawienia
        guildSettings.messageLogChannel = channel.id;
        await guildSettings.save();
        
        logger.info(`Kanał logowania wiadomości dla serwera ${interaction.guildId} ustawiony na ${channel.id}`);
        
        await interaction.reply({
          content: `Ustawiono kanał logowania wiadomości na ${channel}.`,
          ephemeral: true
        });
      } catch (error) {
        logger.error(`Błąd podczas ustawiania kanału logów: ${error.stack}`);
        return interaction.reply({
          content: `Wystąpił błąd podczas ustawiania kanału logów: ${error.message}`,
          ephemeral: true
        });
      }
    }
    
    else if (subcommand === 'toggle') {
      logger.debug(`Wykonywanie podkomendy toggle`);
      const enabled = interaction.options.getBoolean('enabled');
      
      try {
        // Upewnij się, że moduły istnieją
        if (!guildSettings.modules) {
          guildSettings.modules = {};
        }
        
        guildSettings.modules.messageLog = enabled;
        await guildSettings.save();
        
        logger.info(`Logowanie wiadomości dla serwera ${interaction.guildId} zostało ${enabled ? 'włączone' : 'wyłączone'}`);
        
        await interaction.reply({
          content: `Logowanie wiadomości zostało ${enabled ? 'włączone' : 'wyłączone'}.`,
          ephemeral: true
        });
      } catch (error) {
        logger.error(`Błąd podczas przełączania logowania wiadomości: ${error.stack}`);
        return interaction.reply({
          content: `Wystąpił błąd podczas zmiany ustawień logowania wiadomości: ${error.message}`,
          ephemeral: true
        });
      }
    }
  },
};