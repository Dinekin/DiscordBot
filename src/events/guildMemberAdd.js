const { Events, EmbedBuilder } = require('discord.js');
const Guild = require('../models/Guild');
const logger = require('../utils/logger');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        // Pobierz konfigurację serwera
        const guildSettings = await Guild.findOne({ guildId: member.guild.id });

        // Jeśli nie ma konfiguracji lub nie ustawiono kanału powitalnego, to zakończ
        if (!guildSettings || !guildSettings.welcomeChannel) return;

        try {
            // Pobierz kanał powitalny
            const welcomeChannel = await member.guild.channels.fetch(guildSettings.welcomeChannel);

            if (!welcomeChannel) {
                logger.warn(`Nie znaleziono kanału powitalnego ${guildSettings.welcomeChannel} na serwerze ${member.guild.name}`);
                return;
            }

            // Utwórz wiadomość powitalną
            const welcomeEmbed = new EmbedBuilder()
            .setTitle('Witamy na serwerze!')
            .setDescription(`Witaj ${member} na serwerze **${member.guild.name}**!`)
            .setColor('#3498db')
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'Użytkownik', value: member.user.tag },
                { name: 'ID użytkownika', value: member.id },
                { name: 'Konto utworzone', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>` }
            )
            .setFooter({ text: `Jesteś ${member.guild.memberCount} członkiem serwera!` })
            .setTimestamp();

            // Wyślij wiadomość powitalną
            await welcomeChannel.send({ embeds: [welcomeEmbed] });

            logger.info(`Wysłano wiadomość powitalną dla ${member.user.tag} na serwerze ${member.guild.name}`);
        } catch (error) {
            logger.error(`Błąd podczas wysyłania wiadomości powitalnej:`, error);
        }
    },
};
