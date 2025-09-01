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
            .setDescription('Czy wysyłać powiadomienie, gdy ktoś otrzyma tę rolę')
            .setRequired(false))
        .addRoleOption(option =>
          option.setName('blockedby')
            .setDescription('Rola, która blokuje dostęp do tej roli (opcjonalne)')
            .setRequired(false)))
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
        .setDescription('Pokaż wszystkie wiadomości z rolami reakcji'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('addtoany')
        .setDescription('Dodaj rolę reaction do dowolnej wiadomości')
        .addStringOption(option =>
          option.setName('messageid')
            .setDescription('ID wiadomości, do której chcesz dodać rolę reaction')
            .setRequired(true))
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('Rola do dodania')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('emoji')
            .setDescription('Emoji dla tej roli')
            .setRequired(true))
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Kanał, w którym znajduje się wiadomość (domyślnie aktualny kanał)')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('notify')
            .setDescription('Czy wysyłać powiadomienie, gdy ktoś otrzyma tę rolę')
            .setRequired(false))
        .addRoleOption(option =>
          option.setName('blockedby')
            .setDescription('Rola, która blokuje dostęp do tej roli (opcjonalne)')
            .setRequired(false))),

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
      const blockedBy = interaction.options.getRole('blockedby');

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
        notificationEnabled: notify,
        blockedByRoleId: blockedBy ? blockedBy.id : null
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

    else if (subcommand === 'addtoany') {
      const messageId = interaction.options.getString('messageid');
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const role = interaction.options.getRole('role');
      const emoji = interaction.options.getString('emoji');
      const notify = interaction.options.getBoolean('notify') || false;
      const blockedBy = interaction.options.getRole('blockedby');

      try {
        // Pobierz wiadomość
        const message = await channel.messages.fetch(messageId);

        if (!message) {
          return interaction.reply({
            content: 'Nie znaleziono wiadomości z podanym ID w tym kanale!',
            ephemeral: true
          });
        }

        // Sprawdź, czy wiadomość należy do tego samego serwera
        if (message.guildId !== interaction.guildId) {
          return interaction.reply({
            content: 'Wiadomość nie należy do tego serwera!',
            ephemeral: true
          });
        }

        // Znajdź istniejący wpis ReactionRole lub utwórz nowy
        let reactionRole = await ReactionRole.findOne({
          guildId: interaction.guildId,
          messageId: messageId
        });

        if (!reactionRole) {
          // Utwórz nowy wpis
          reactionRole = new ReactionRole({
            guildId: interaction.guildId,
            messageId: messageId,
            channelId: channel.id,
            roles: [],
            title: message.embeds[0]?.title || 'Role Reaction',
            description: message.embeds[0]?.description || 'Kliknij na reakcję, aby otrzymać rolę!'
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
          notificationEnabled: notify,
          blockedByRoleId: blockedBy ? blockedBy.id : null
        });

        await reactionRole.save();

        // Dodaj reakcję do wiadomości
        await message.react(emoji);

        // Przygotuj lub zaktualizuj embed
        let embed;
        if (message.embeds.length > 0) {
          embed = EmbedBuilder.from(message.embeds[0]);
        } else {
          embed = new EmbedBuilder()
            .setTitle(reactionRole.title)
            .setDescription(reactionRole.description)
            .setColor('#3498db')
            .setFooter({ text: 'Kliknij na reakcję, aby otrzymać rolę!' });
        }

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

        // Zaktualizuj wiadomość
        await message.edit({ embeds: [embed] });

        await interaction.reply({
          content: `Dodano rolę ${role.name} z emoji ${emoji} do wiadomości! ID wiadomości: ${messageId}`,
          ephemeral: true
        });

      } catch (error) {
        console.error('Błąd podczas dodawania reaction role:', error);

        if (error.code === 10008) {
          return interaction.reply({
            content: 'Nie znaleziono wiadomości z podanym ID!',
            ephemeral: true
          });
        }

        if (error.code === 50013) {
          return interaction.reply({
            content: 'Bot nie ma uprawnień do reagowania na tej wiadomości!',
            ephemeral: true
          });
        }

        await interaction.reply({
          content: 'Wystąpił błąd podczas dodawania reaction role!',
          ephemeral: true
        });
      }
    }
  },
};
