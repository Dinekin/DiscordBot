const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ReactionRole = require('../models/ReactionRole');
const Guild = require('../models/Guild');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reactionroles')
    .setDescription('Zarządzaj rolami reaction')
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator | 
      PermissionFlagsBits.ManageGuild | 
      PermissionFlagsBits.ManageRoles | 
      PermissionFlagsBits.ManageMessages
  )
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Stwórz nowy system ról poprzez reakcje')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Kanał, w którym będzie wiadomość')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('title')
            .setDescription('Tytuł wiadomości')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('description')
            .setDescription('Opis wiadomości')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Dodaj rolę do istniejącej wiadomości')
        .addStringOption(option =>
          option.setName('messageid')
            .setDescription('ID wiadomości z rolami')
            .setRequired(true))
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('Rola do dodania')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('emoji')
            .setDescription('Emoji dla tej roli')
            .setRequired(true))
        .addBooleanOption(option =>
          option.setName('notify')
            .setDescription('Czy wysyłać powiadomienie, gdy ktoś otrzyma tę rolę')))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Usuń rolę z istniejącej wiadomości')
        .addStringOption(option =>
          option.setName('messageid')
            .setDescription('ID wiadomości z rolami')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('emoji')
            .setDescription('Emoji roli do usunięcia')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Pokaż wszystkie wiadomości z rolami reakcji')),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === 'create') {
      const channel = interaction.options.getChannel('channel');
      const title = interaction.options.getString('title');
      const description = interaction.options.getString('description');
      
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor('#3498db')
        .setFooter({ text: 'Kliknij na reakcję, aby otrzymać rolę!' });
      
      const message = await channel.send({ embeds: [embed] });
      
      // Zapisz w bazie danych
      await ReactionRole.create({
        guildId: interaction.guildId,
        messageId: message.id,
        channelId: channel.id,
        title: title,
        description: description,
        roles: []
      });
      
      await interaction.reply({
        content: `Stworzono wiadomość do ról reakcji! ID wiadomości: ${message.id}`,
        ephemeral: true
      });
    }
    
    else if (subcommand === 'add') {
      const messageId = interaction.options.getString('messageid');
      const role = interaction.options.getRole('role');
      const emoji = interaction.options.getString('emoji');
      const notify = interaction.options.getBoolean('notify') || false;
      
      // Znajdź reakcję w bazie danych
      const reactionRole = await ReactionRole.findOne({ 
        guildId: interaction.guildId,
        messageId: messageId 
      });
      
      if (!reactionRole) {
        return interaction.reply({
          content: 'Nie znaleziono wiadomości z tym ID!',
          ephemeral: true
        });
      }
      
      // Sprawdź, czy emoji już istnieje
      if (reactionRole.roles.some(r => r.emoji === emoji)) {
        return interaction.reply({
          content: 'To emoji jest już używane w tej wiadomości!',
          ephemeral: true
        });
      }
      
      // Dodaj rolę do bazy danych
      reactionRole.roles.push({
        emoji: emoji,
        roleId: role.id,
        notificationEnabled: notify
      });
      
      await reactionRole.save();
      
      // Dodaj reakcję do wiadomości
      try {
        const channel = await interaction.guild.channels.fetch(reactionRole.channelId);
        const message = await channel.messages.fetch(messageId);
        await message.react(emoji);
        
        // Aktualizuj embed z nową rolą
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
        
        await interaction.reply({
          content: `Dodano rolę ${role.name} z emoji ${emoji} do wiadomości!`,
          ephemeral: true
        });
      } catch (error) {
        console.error(error);
        await interaction.reply({
          content: 'Wystąpił błąd podczas dodawania reakcji do wiadomości!',
          ephemeral: true
        });
      }
    }
    
    else if (subcommand === 'remove') {
      const messageId = interaction.options.getString('messageid');
      const emoji = interaction.options.getString('emoji');
      
      // Znajdź reakcję w bazie danych
      const reactionRole = await ReactionRole.findOne({ 
        guildId: interaction.guildId,
        messageId: messageId 
      });
      
      if (!reactionRole) {
        return interaction.reply({
          content: 'Nie znaleziono wiadomości z tym ID!',
          ephemeral: true
        });
      }
      
      // Sprawdź, czy emoji istnieje
      const roleIndex = reactionRole.roles.findIndex(r => r.emoji === emoji);
      if (roleIndex === -1) {
        return interaction.reply({
          content: 'Nie znaleziono roli z tym emoji!',
          ephemeral: true
        });
      }
      
      // Usuń rolę z bazy danych
      reactionRole.roles.splice(roleIndex, 1);
      await reactionRole.save();
      
      // Usuń reakcję z wiadomości
      try {
        const channel = await interaction.guild.channels.fetch(reactionRole.channelId);
        const message = await channel.messages.fetch(messageId);
        
        // Znajdź i usuń reakcję
        const reaction = message.reactions.cache.find(r => r.emoji.name === emoji || r.emoji.id === emoji);
        if (reaction) await reaction.remove();
        
        // Aktualizuj embed bez usuniętej roli
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
        
        await interaction.reply({
          content: `Usunięto rolę z emoji ${emoji} z wiadomości!`,
          ephemeral: true
        });
      } catch (error) {
        console.error(error);
        await interaction.reply({
          content: 'Wystąpił błąd podczas usuwania reakcji z wiadomości!',
          ephemeral: true
        });
      }
    }
    
    else if (subcommand === 'list') {
      // Pobierz wszystkie wiadomości z rolami reakcji
      const reactionRoles = await ReactionRole.find({ guildId: interaction.guildId });
      
      if (reactionRoles.length === 0) {
        return interaction.reply({
          content: 'Nie znaleziono żadnych wiadomości z rolami reakcji!',
          ephemeral: true
        });
      }
      
      const embed = new EmbedBuilder()
        .setTitle('Wiadomości z rolami reakcji')
        .setColor('#3498db');
      
      for (const rr of reactionRoles) {
        const rolesList = rr.roles.map(r => 
          `${r.emoji} - <@&${r.roleId}>${r.notificationEnabled ? ' (z powiadomieniem)' : ''}`
        ).join('\n');
        
        embed.addFields({
          name: `📝 ${rr.title} (ID: ${rr.messageId})`,
          value: `Kanał: <#${rr.channelId}>\n${rolesList || 'Brak ról'}`
        });
      }
      
      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    }
  },
};
