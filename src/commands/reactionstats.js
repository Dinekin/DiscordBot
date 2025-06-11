// src/commands/reactionstats.js - komenda do sprawdzania statystyk reakcji
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const MessageLog = require('../models/MessageLog');
const Guild = require('../models/Guild');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reactionstats')
    .setDescription('Zarządzaj logowaniem reakcji i sprawdzaj statystyki')
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator | 
      PermissionFlagsBits.ManageGuild | 
      PermissionFlagsBits.ManageRoles | 
      PermissionFlagsBits.ManageMessages
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('user')
        .setDescription('Sprawdź statystyki reakcji użytkownika')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Użytkownik do sprawdzenia')
            .setRequired(true))
        .addIntegerOption(option =>
          option.setName('limit')
            .setDescription('Liczba najczęściej używanych reakcji do pokazania (domyślnie: 10)')
            .setMinValue(1)
            .setMaxValue(25)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('message')
        .setDescription('Sprawdź statystyki reakcji dla konkretnej wiadomości')
        .addStringOption(option =>
          option.setName('messageid')
            .setDescription('ID wiadomości')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('channel')
        .setDescription('Sprawdź najpopularniejsze reakcje na kanale')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Kanał do sprawdzenia')
            .setRequired(true))
        .addIntegerOption(option =>
          option.setName('days')
            .setDescription('Liczba dni wstecz (domyślnie: 7)')
            .setMinValue(1)
            .setMaxValue(30))
        .addIntegerOption(option =>
          option.setName('limit')
            .setDescription('Liczba reakcji do pokazania (domyślnie: 15)')
            .setMinValue(1)
            .setMaxValue(25)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('server')
        .setDescription('Sprawdź statystyki reakcji dla całego serwera')
        .addIntegerOption(option =>
          option.setName('days')
            .setDescription('Liczba dni wstecz (domyślnie: 7)')
            .setMinValue(1)
            .setMaxValue(30))
        .addIntegerOption(option =>
          option.setName('limit')
            .setDescription('Liczba reakcji do pokazania (domyślnie: 15)')
            .setMinValue(1)
            .setMaxValue(25)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('toggle')
        .setDescription('Włącz/wyłącz logowanie reakcji')
        .addBooleanOption(option =>
          option.setName('enabled')
            .setDescription('Czy logowanie reakcji ma być włączone')
            .setRequired(true))),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'toggle') {
        const enabled = interaction.options.getBoolean('enabled');
        
        // Sprawdź czy funkcja logowania wiadomości jest w ogóle włączona
        let guildSettings = await Guild.findOne({ guildId: interaction.guildId });
        
        if (!guildSettings) {
          guildSettings = await Guild.create({
            guildId: interaction.guildId,
            modules: { messageLog: false }
          });
        }
        
        if (!guildSettings.modules?.messageLog) {
          return interaction.reply({
            content: '❌ Najpierw musisz włączyć ogólne logowanie wiadomości za pomocą `/messagelog toggle enabled:true`',
            ephemeral: true
          });
        }
        
        // Tutaj możesz dodać oddzielną flagę dla reakcji jeśli chcesz
        // Na razie logowanie reakcji jest częścią ogólnego logowania wiadomości
        
        return interaction.reply({
          content: `ℹ️ Logowanie reakcji jest obecnie ${guildSettings.modules.messageLog ? 'włączone' : 'wyłączone'} jako część logowania wiadomości.\n\nUżyj \`/messagelog toggle\` aby zmienić to ustawienie.`,
          ephemeral: true
        });
      }
      
      if (subcommand === 'user') {
        const user = interaction.options.getUser('user');
        const limit = interaction.options.getInteger('limit') || 10;
        
        await interaction.deferReply({ ephemeral: true });
        
        try {
          // Znajdź wszystkie wiadomości tego użytkownika z reakcjami
          const userLogs = await MessageLog.find({
            guildId: interaction.guildId,
            'reactions.users': user.id
          });
          
          // Policz użycie każdej reakcji przez tego użytkownika
          const reactionCounts = new Map();
          let totalReactions = 0;
          
          userLogs.forEach(log => {
            log.reactions.forEach(reaction => {
              if (reaction.users.includes(user.id)) {
                const key = reaction.id || reaction.name;
                const display = reaction.id 
                  ? `<${reaction.animated ? 'a' : ''}:${reaction.name}:${reaction.id}>`
                  : reaction.name;
                
                reactionCounts.set(key, {
                  display: display,
                  count: (reactionCounts.get(key)?.count || 0) + 1,
                  name: reaction.name
                });
                totalReactions++;
              }
            });
          });
          
          if (totalReactions === 0) {
            return interaction.editReply({
              content: `Użytkownik ${user.tag} nie dodał jeszcze żadnych reakcji na tym serwerze (lub logowanie reakcji nie było włączone).`,
              ephemeral: true
            });
          }
          
          // Sortuj reakcje według liczby użyć
          const sortedReactions = Array.from(reactionCounts.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
          
          const embed = new EmbedBuilder()
            .setTitle(`📊 Statystyki reakcji: ${user.tag}`)
            .setColor(0x3498db)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .setDescription(`**Łącznie reakcji:** ${totalReactions}\n**Unikalnych reakcji:** ${reactionCounts.size}`)
            .setTimestamp();
          
          if (sortedReactions.length > 0) {
            const reactionList = sortedReactions.map((reaction, index) => 
              `${index + 1}. ${reaction.display} - **${reaction.count}** ${reaction.count === 1 ? 'raz' : 'razy'}`
            ).join('\n');
            
            embed.addFields({
              name: `🏆 Top ${sortedReactions.length} reakcji`,
              value: reactionList
            });
          }
          
          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          logger.error(`Błąd podczas pobierania statystyk użytkownika: ${error.stack}`);
          await interaction.editReply('❌ Wystąpił błąd podczas pobierania statystyk użytkownika.');
        }
      }
      
      if (subcommand === 'message') {
        const messageId = interaction.options.getString('messageid');
        
        await interaction.deferReply({ ephemeral: true });
        
        try {
          const messageLog = await MessageLog.findOne({
            guildId: interaction.guildId,
            messageId: messageId
          });
          
          if (!messageLog) {
            return interaction.editReply({
              content: `Nie znaleziono logu dla wiadomości o ID \`${messageId}\`.`,
              ephemeral: true
            });
          }
          
          if (!messageLog.reactions || messageLog.reactions.length === 0) {
            return interaction.editReply({
              content: `Wiadomość o ID \`${messageId}\` nie ma żadnych reakcji.`,
              ephemeral: true
            });
          }
          
          const totalReactions = messageLog.reactions.reduce((sum, r) => sum + (r.count || 0), 0);
          
          const embed = new EmbedBuilder()
            .setTitle('📊 Statystyki reakcji wiadomości')
            .setColor(0x9b59b6)
            .setDescription(`**ID wiadomości:** \`${messageId}\`\n**Kanał:** <#${messageLog.channelId}>\n**Łącznie reakcji:** ${totalReactions}`)
            .setTimestamp();
          
          // Sortuj reakcje według liczby
          const sortedReactions = messageLog.reactions
            .sort((a, b) => (b.count || 0) - (a.count || 0));
          
          if (sortedReactions.length > 0) {
            const reactionList = sortedReactions.map((reaction, index) => {
              const display = reaction.id 
                ? `<${reaction.animated ? 'a' : ''}:${reaction.name}:${reaction.id}>`
                : reaction.name;
              return `${index + 1}. ${display} - **${reaction.count || 0}** ${(reaction.count || 0) === 1 ? 'raz' : 'razy'}`;
            }).join('\n');
            
            // Podziel na grupy jeśli za długo
            if (reactionList.length > 1024) {
              const reactions1 = sortedReactions.slice(0, Math.ceil(sortedReactions.length / 2));
              const reactions2 = sortedReactions.slice(Math.ceil(sortedReactions.length / 2));
              
              embed.addFields(
                {
                  name: '🏆 Reakcje (1/2)',
                  value: reactions1.map((r, i) => {
                    const display = r.id ? `<${r.animated ? 'a' : ''}:${r.name}:${r.id}>` : r.name;
                    return `${i + 1}. ${display} - **${r.count || 0}**`;
                  }).join('\n'),
                  inline: true
                },
                {
                  name: '🏆 Reakcje (2/2)',
                  value: reactions2.map((r, i) => {
                    const display = r.id ? `<${r.animated ? 'a' : ''}:${r.name}:${r.id}>` : r.name;
                    return `${i + reactions1.length + 1}. ${display} - **${r.count || 0}**`;
                  }).join('\n'),
                  inline: true
                }
              );
            } else {
              embed.addFields({
                name: '🏆 Wszystkie reakcje',
                value: reactionList
              });
            }
          }
          
          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          logger.error(`Błąd podczas pobierania statystyk wiadomości: ${error.stack}`);
          await interaction.editReply('❌ Wystąpił błąd podczas pobierania statystyk wiadomości.');
        }
      }
      
      if (subcommand === 'channel') {
        const channel = interaction.options.getChannel('channel');
        const days = interaction.options.getInteger('days') || 7;
        const limit = interaction.options.getInteger('limit') || 15;
        
        await interaction.deferReply({ ephemeral: true });
        
        try {
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - days);
          
          const channelLogs = await MessageLog.find({
            guildId: interaction.guildId,
            channelId: channel.id,
            createdAt: { $gte: startDate },
            'reactions.0': { $exists: true } // Ma przynajmniej jedną reakcję
          });
          
          const reactionCounts = new Map();
          let totalReactions = 0;
          
          channelLogs.forEach(log => {
            log.reactions.forEach(reaction => {
              const key = reaction.id || reaction.name;
              const display = reaction.id 
                ? `<${reaction.animated ? 'a' : ''}:${reaction.name}:${reaction.id}>`
                : reaction.name;
              
              const currentCount = reactionCounts.get(key)?.count || 0;
              reactionCounts.set(key, {
                display: display,
                count: currentCount + (reaction.count || 0),
                name: reaction.name
              });
              totalReactions += (reaction.count || 0);
            });
          });
          
          if (totalReactions === 0) {
            return interaction.editReply({
              content: `Kanał ${channel} nie ma żadnych reakcji w ciągu ostatnich ${days} dni.`,
              ephemeral: true
            });
          }
          
          const sortedReactions = Array.from(reactionCounts.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
          
          const embed = new EmbedBuilder()
            .setTitle(`📊 Najpopularniejsze reakcje - ${channel.name}`)
            .setColor(0xe67e22)
            .setDescription(`**Okres:** Ostatnie ${days} dni\n**Łącznie reakcji:** ${totalReactions}\n**Unikalnych reakcji:** ${reactionCounts.size}`)
            .setTimestamp();
          
          if (sortedReactions.length > 0) {
            const reactionList = sortedReactions.map((reaction, index) => 
              `${index + 1}. ${reaction.display} - **${reaction.count}** ${reaction.count === 1 ? 'raz' : 'razy'}`
            ).join('\n');
            
            embed.addFields({
              name: `🏆 Top ${sortedReactions.length} reakcji`,
              value: reactionList
            });
          }
          
          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          logger.error(`Błąd podczas pobierania statystyk kanału: ${error.stack}`);
          await interaction.editReply('❌ Wystąpił błąd podczas pobierania statystyk kanału.');
        }
      }
      
      if (subcommand === 'server') {
        const days = interaction.options.getInteger('days') || 7;
        const limit = interaction.options.getInteger('limit') || 15;
        
        await interaction.deferReply({ ephemeral: true });
        
        try {
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - days);
          
          const serverLogs = await MessageLog.find({
            guildId: interaction.guildId,
            createdAt: { $gte: startDate },
            'reactions.0': { $exists: true }
          });
          
          const reactionCounts = new Map();
          let totalReactions = 0;
          let totalMessages = serverLogs.length;
          
          serverLogs.forEach(log => {
            log.reactions.forEach(reaction => {
              const key = reaction.id || reaction.name;
              const display = reaction.id 
                ? `<${reaction.animated ? 'a' : ''}:${reaction.name}:${reaction.id}>`
                : reaction.name;
              
              const currentCount = reactionCounts.get(key)?.count || 0;
              reactionCounts.set(key, {
                display: display,
                count: currentCount + (reaction.count || 0),
                name: reaction.name
              });
              totalReactions += (reaction.count || 0);
            });
          });
          
          if (totalReactions === 0) {
            return interaction.editReply({
              content: `Serwer nie ma żadnych reakcji w ciągu ostatnich ${days} dni.`,
              ephemeral: true
            });
          }
          
          const sortedReactions = Array.from(reactionCounts.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
          
          const embed = new EmbedBuilder()
            .setTitle(`📊 Statystyki reakcji serwera`)
            .setColor(0x2ecc71)
            .setDescription(`**Okres:** Ostatnie ${days} dni\n**Łącznie reakcji:** ${totalReactions}\n**Wiadomości z reakcjami:** ${totalMessages}\n**Unikalnych reakcji:** ${reactionCounts.size}`)
            .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
            .setTimestamp();
          
          if (sortedReactions.length > 0) {
            const reactionList = sortedReactions.map((reaction, index) => 
              `${index + 1}. ${reaction.display} - **${reaction.count}** ${reaction.count === 1 ? 'raz' : 'razy'}`
            ).join('\n');
            
            embed.addFields({
              name: `🏆 Top ${sortedReactions.length} reakcji`,
              value: reactionList
            });
          }
          
          // Dodaj średnią liczbę reakcji na wiadomość
          const avgReactionsPerMessage = (totalReactions / totalMessages).toFixed(2);
          embed.addFields({
            name: '📈 Statystyki dodatkowe',
            value: `Średnia reakcji na wiadomość: **${avgReactionsPerMessage}**`,
            inline: true
          });
          
          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          logger.error(`Błąd podczas pobierania statystyk serwera: ${error.stack}`);
          await interaction.editReply('❌ Wystąpił błąd podczas pobierania statystyk serwera.');
        }
      }
    } catch (error) {
      logger.error(`Błąd podczas wykonywania komendy reactionstats: ${error.stack}`);
      
      if (interaction.deferred) {
        await interaction.editReply('❌ Wystąpił błąd podczas wykonywania komendy.');
      } else {
        await interaction.reply({
          content: '❌ Wystąpił błąd podczas wykonywania komendy.',
          ephemeral: true
        });
      }
    }
  }
};