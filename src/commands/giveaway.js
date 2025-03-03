// Dodaj ten plik jako src/commands/giveaway.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ms = require('ms'); // Upewnij się, że masz zainstalowany pakiet 'ms' (npm install ms)
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Zarządzaj giveaway\'ami na serwerze')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Rozpocznij nowy giveaway')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Kanał, na którym odbędzie się giveaway')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('duration')
                        .setDescription('Czas trwania giveaway\'u (np. 1h, 1d, 1w)')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('winners')
                        .setDescription('Liczba zwycięzców')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(10))
                .addStringOption(option =>
                    option.setName('prize')
                        .setDescription('Nagroda, którą można wygrać')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('thumbnail')
                        .setDescription('URL do miniaturki (opcjonalnie)'))
                .addStringOption(option =>
                    option.setName('image')
                        .setDescription('URL do obrazka (opcjonalnie)')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('end')
                .setDescription('Zakończ trwający giveaway')
                .addStringOption(option =>
                    option.setName('messageid')
                        .setDescription('ID wiadomości giveaway\'u')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reroll')
                .setDescription('Wylosuj ponownie zwycięzców giveaway\'u')
                .addStringOption(option =>
                    option.setName('messageid')
                        .setDescription('ID wiadomości giveaway\'u')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('winners')
                        .setDescription('Liczba zwycięzców do ponownego wylosowania')
                        .setMinValue(1)
                        .setMaxValue(10)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Wyświetl listę aktywnych giveaway\'ów na serwerze'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('pause')
                .setDescription('Wstrzymaj trwający giveaway')
                .addStringOption(option =>
                    option.setName('messageid')
                        .setDescription('ID wiadomości giveaway\'u')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('resume')
                .setDescription('Wznów wstrzymany giveaway')
                .addStringOption(option =>
                    option.setName('messageid')
                        .setDescription('ID wiadomości giveaway\'u')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('drop')
                .setDescription('Rozpocznij natychmiastowy giveaway typu "drop" (bez czasu oczekiwania)')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Kanał, na którym odbędzie się giveaway')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('winners')
                        .setDescription('Liczba zwycięzców')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(10))
                .addStringOption(option =>
                    option.setName('prize')
                        .setDescription('Nagroda, którą można wygrać')
                        .setRequired(true))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const { client } = require('../bot');
        const giveawayManager = client.giveawaysManager;

        if (!giveawayManager) {
            return interaction.reply({
                content: 'Nie można wykonać tej akcji, ponieważ system giveaway\'ów nie jest zainicjalizowany.',
                ephemeral: true
            });
        }

        try {
            if (subcommand === 'start') {
                const channel = interaction.options.getChannel('channel');
                const duration = interaction.options.getString('duration');
                const winnerCount = interaction.options.getInteger('winners');
                const prize = interaction.options.getString('prize');
                const thumbnail = interaction.options.getString('thumbnail');
                const image = interaction.options.getString('image');

                // Konwersja czasu trwania na milisekundy
                const msDuration = ms(duration);
                if (!msDuration) {
                    return interaction.reply({
                        content: 'Podano nieprawidłowy format czasu trwania. Przykłady: 1h, 1d, 1w',
                        ephemeral: true
                    });
                }

                await interaction.deferReply({ ephemeral: true });

                // Tworzenie giveaway'a
                giveawayManager.start(channel, {
                    duration: msDuration,
                    winnerCount,
                    prize,
                    hostedBy: interaction.user,
                    thumbnail: thumbnail || undefined,
                    image: image || undefined,
                    messages: {
                        giveaway: '🎉 **GIVEAWAY** 🎉',
                        giveawayEnded: '🎉 **GIVEAWAY ZAKOŃCZONY** 🎉',
                        title: '{this.prize}',
                        drawing: 'Losowanie za: {timestamp}',
                        dropMessage: 'Bądź pierwszym, który zareaguje z 🎉!',
                        inviteToParticipate: 'Zareaguj z 🎉, aby wziąć udział!',
                        winMessage: 'Gratulacje, {winners}! Wygrywasz **{this.prize}**!',
                        embedFooter: '{this.winnerCount} zwycięzca(ów)',
                        noWinner: 'Giveaway anulowany, brak ważnych zgłoszeń.',
                        hostedBy: 'Organizator: {this.hostedBy}',
                        winners: 'Zwycięzca(y):',
                        endedAt: 'Zakończony',
                    }
                }).then(giveaway => {
                    interaction.editReply({
                        content: `Giveaway został rozpoczęty w kanale <#${channel.id}>!`,
                        ephemeral: true
                    });
                    logger.info(`Giveaway ${giveaway.messageId} rozpoczęty przez ${interaction.user.tag}`);
                }).catch(err => {
                    logger.error(`Błąd podczas tworzenia giveaway: ${err.stack}`);
                    interaction.editReply({
                        content: `Wystąpił błąd podczas tworzenia giveaway: ${err.message}`,
                        ephemeral: true
                    });
                });
            }
            else if (subcommand === 'end') {
                const messageId = interaction.options.getString('messageid');
                const giveaway = giveawayManager.giveaways.find(g => g.messageId === messageId && g.guildId === interaction.guild.id);
                
                if (!giveaway) {
                    return interaction.reply({ 
                        content: 'Nie znaleziono giveaway\'u z podanym ID wiadomości.',
                        ephemeral: true
                    });
                }
                
                if (giveaway.ended) {
                    return interaction.reply({
                        content: 'Ten giveaway już się zakończył.',
                        ephemeral: true
                    });
                }
                
                try {
                    await giveawayManager.end(messageId);
                    interaction.reply({
                        content: 'Giveaway został zakończony!',
                        ephemeral: true
                    });
                    logger.info(`Giveaway ${messageId} zakończony przez ${interaction.user.tag}`);
                } catch (err) {
                    logger.error(`Błąd podczas kończenia giveaway: ${err.stack}`);
                    interaction.reply({
                        content: `Wystąpił błąd podczas kończenia giveaway: ${err.message}`,
                        ephemeral: true
                    });
                }
            }
            else if (subcommand === 'reroll') {
                const messageId = interaction.options.getString('messageid');
                const winners = interaction.options.getInteger('winners');
                
                try {
                    await giveawayManager.reroll(messageId, {
                        winnerCount: winners || undefined,
                        messages: {
                            congrat: 'Nowy zwycięzca(y): {winners}! Gratulacje, wygrywasz **{this.prize}**!',
                            error: 'Nie znaleziono ważnych zgłoszeń, nie można wylosować nowych zwycięzców!'
                        }
                    });
                    interaction.reply({
                        content: 'Giveaway został ponownie rozlosowany!',
                        ephemeral: true
                    });
                    logger.info(`Giveaway ${messageId} ponownie rozlosowany przez ${interaction.user.tag}`);
                } catch (err) {
                    logger.error(`Błąd podczas ponownego losowania giveaway: ${err.stack}`);
                    interaction.reply({
                        content: `Wystąpił błąd podczas ponownego losowania giveaway: ${err.message}`,
                        ephemeral: true
                    });
                }
            }
            else if (subcommand === 'list') {
                const giveaways = giveawayManager.giveaways.filter(g => 
                    g.guildId === interaction.guild.id && !g.ended
                );
                
                if (giveaways.length === 0) {
                    return interaction.reply({
                        content: 'Na tym serwerze nie ma obecnie żadnych aktywnych giveaway\'ów.',
                        ephemeral: true
                    });
                }
                
                const embed = new EmbedBuilder()
                    .setTitle('Aktywne Giveaway\'e')
                    .setColor('#3498db')
                    .setDescription('Oto lista wszystkich aktywnych giveaway\'ów na tym serwerze:')
                    .setTimestamp();
                
                giveaways.forEach((giveaway, i) => {
                    const endTimeString = `<t:${Math.floor(giveaway.endAt / 1000)}:R>`;
                    embed.addFields({
                        name: `${i + 1}. ${giveaway.prize}`,
                        value: `• Kanał: <#${giveaway.channelId}>\n• Kończy się: ${endTimeString}\n• ID: \`${giveaway.messageId}\`\n• Liczba zwycięzców: ${giveaway.winnerCount}\n• [Link do giveaway'u](https://discord.com/channels/${interaction.guild.id}/${giveaway.channelId}/${giveaway.messageId})`
                    });
                });
                
                interaction.reply({
                    embeds: [embed],
                    ephemeral: true
                });
                logger.info(`Lista giveaway'ów wyświetlona przez ${interaction.user.tag}`);
            }
            else if (subcommand === 'pause') {
                const messageId = interaction.options.getString('messageid');
                const giveaway = giveawayManager.giveaways.find(g => g.messageId === messageId && g.guildId === interaction.guild.id);
                
                if (!giveaway) {
                    return interaction.reply({ 
                        content: 'Nie znaleziono giveaway\'u z podanym ID wiadomości.',
                        ephemeral: true
                    });
                }
                
                if (giveaway.ended) {
                    return interaction.reply({
                        content: 'Nie można wstrzymać zakończonego giveaway\'u.',
                        ephemeral: true
                    });
                }
                
                if (giveaway.pauseOptions && giveaway.pauseOptions.isPaused) {
                    return interaction.reply({
                        content: 'Ten giveaway jest już wstrzymany.',
                        ephemeral: true
                    });
                }
                
                try {
                    await giveawayManager.pause(messageId, {
                        content: '⚠️ **GIVEAWAY WSTRZYMANY** ⚠️',
                        unPauseAfter: null
                    });
                    interaction.reply({
                        content: 'Giveaway został wstrzymany!',
                        ephemeral: true
                    });
                    logger.info(`Giveaway ${messageId} wstrzymany przez ${interaction.user.tag}`);
                } catch (err) {
                    logger.error(`Błąd podczas wstrzymywania giveaway: ${err.stack}`);
                    interaction.reply({
                        content: `Wystąpił błąd podczas wstrzymywania giveaway: ${err.message}`,
                        ephemeral: true
                    });
                }
            }
            else if (subcommand === 'resume') {
                const messageId = interaction.options.getString('messageid');
                const giveaway = giveawayManager.giveaways.find(g => g.messageId === messageId && g.guildId === interaction.guild.id);
                
                if (!giveaway) {
                    return interaction.reply({ 
                        content: 'Nie znaleziono giveaway\'u z podanym ID wiadomości.',
                        ephemeral: true
                    });
                }
                
                if (giveaway.ended) {
                    return interaction.reply({
                        content: 'Nie można wznowić zakończonego giveaway\'u.',
                        ephemeral: true
                    });
                }
                
                if (!giveaway.pauseOptions || !giveaway.pauseOptions.isPaused) {
                    return interaction.reply({
                        content: 'Ten giveaway nie jest wstrzymany.',
                        ephemeral: true
                    });
                }
                
                try {
                    await giveawayManager.unpause(messageId);
                    interaction.reply({
                        content: 'Giveaway został wznowiony!',
                        ephemeral: true
                    });
                    logger.info(`Giveaway ${messageId} wznowiony przez ${interaction.user.tag}`);
                } catch (err) {
                    logger.error(`Błąd podczas wznawiania giveaway: ${err.stack}`);
                    interaction.reply({
                        content: `Wystąpił błąd podczas wznawiania giveaway: ${err.message}`,
                        ephemeral: true
                    });
                }
            }
            else if (subcommand === 'drop') {
                const channel = interaction.options.getChannel('channel');
                const winnerCount = interaction.options.getInteger('winners');
                const prize = interaction.options.getString('prize');

                await interaction.deferReply({ ephemeral: true });

                // Tworzenie giveaway'a typu drop (bez czasu oczekiwania)
                giveawayManager.start(channel, {
                    winnerCount,
                    prize,
                    hostedBy: interaction.user,
                    isDrop: true,
                    messages: {
                        giveaway: '🎉 **DROP GIVEAWAY** 🎉',
                        giveawayEnded: '🎉 **DROP GIVEAWAY ZAKOŃCZONY** 🎉',
                        title: '{this.prize}',
                        drawing: 'Losowanie za: {timestamp}',
                        dropMessage: 'Bądź pierwszym, który zareaguje z 🎉!',
                        inviteToParticipate: 'Zareaguj z 🎉, aby wziąć udział!',
                        winMessage: 'Gratulacje, {winners}! Wygrywasz **{this.prize}**!',
                        embedFooter: '{this.winnerCount} zwycięzca(ów)',
                        noWinner: 'Giveaway anulowany, brak ważnych zgłoszeń.',
                        hostedBy: 'Organizator: {this.hostedBy}',
                        winners: 'Zwycięzca(y):',
                        endedAt: 'Zakończony',
                    }
                }).then(giveaway => {
                    interaction.editReply({
                        content: `Drop giveaway został rozpoczęty w kanale <#${channel.id}>!`,
                        ephemeral: true
                    });
                    logger.info(`Drop giveaway ${giveaway.messageId} rozpoczęty przez ${interaction.user.tag}`);
                }).catch(err => {
                    logger.error(`Błąd podczas tworzenia drop giveaway: ${err.stack}`);
                    interaction.editReply({
                        content: `Wystąpił błąd podczas tworzenia drop giveaway: ${err.message}`,
                        ephemeral: true
                    });
                });
            }
        } catch (error) {
            logger.error(`Błąd podczas wykonywania komendy giveaway: ${error.stack}`);
            
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({
                    content: `Wystąpił błąd podczas wykonywania komendy: ${error.message}`,
                    ephemeral: true
                }).catch(console.error);
            } else {
                await interaction.reply({
                    content: `Wystąpił błąd podczas wykonywania komendy: ${error.message}`,
                    ephemeral: true
                }).catch(console.error);
            }
        }
    }
};