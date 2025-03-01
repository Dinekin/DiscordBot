const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Wyświetla listę dostępnych komend'),

    async execute(interaction) {
        const commands = Array.from(interaction.client.commands.values());

        const helpEmbed = new EmbedBuilder()
        .setTitle('Pomoc - lista komend')
        .setDescription('Oto lista wszystkich dostępnych komend bota:')
        .setColor('#3498db')
        .setTimestamp();

        // Grupowanie komend według "rodziny" (na podstawie nazwy lub kategorii)
        const reactionCommands = commands.filter(cmd => cmd.data.name.includes('reaction'));
        const utilityCommands = commands.filter(cmd => !cmd.data.name.includes('reaction'));

        // Dodaj sekcję dla komend reaction roles
        if (reactionCommands.length > 0) {
            helpEmbed.addFields({
                name: '🏷️ Komendy ról reakcji',
                value: reactionCommands.map(cmd => `\`/${cmd.data.name}\` - ${cmd.data.description}`).join('\n')
            });
        }

        // Dodaj sekcję dla pozostałych komend
        if (utilityCommands.length > 0) {
            helpEmbed.addFields({
                name: '🛠️ Komendy narzędziowe',
                value: utilityCommands.map(cmd => `\`/${cmd.data.name}\` - ${cmd.data.description}`).join('\n')
            });
        }

        // Dodaj informacje o panelu webowym
        helpEmbed.addFields({
            name: '🌐 Panel webowy',
            value: `Bot posiada panel webowy, gdzie możesz łatwo zarządzać ustawieniami i rolami reakcji.\nURL: \`${process.env.DASHBOARD_URL || 'http://localhost:3000'}\``
        });

        // Dodaj linki
        helpEmbed.addFields({
            name: '🔗 Przydatne linki',
            value: [
                `[Dodaj bota](https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=8&scope=bot%20applications.commands)`,
                            `[Panel webowy](${process.env.DASHBOARD_URL || 'http://localhost:3000'})`,
            ].join(' • ')
        });

        await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
    },
};
