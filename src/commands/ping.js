const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Sprawdza opóźnienie i czas odpowiedzi bota')
        .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator | 
      PermissionFlagsBits.ManageGuild | 
      PermissionFlagsBits.ManageRoles | 
      PermissionFlagsBits.ManageMessages
  ),

    cooldown: 5, // Cooldown w sekundach

    async execute(interaction) {
        // Zmierz opóźnienie API
        const sent = await interaction.reply({ content: 'Mierzenie opóźnienia...', fetchReply: true });
        const pingTime = sent.createdTimestamp - interaction.createdTimestamp;

        // Zmierz opóźnienie Websocket
        const wsLatency = interaction.client.ws.ping;

        await interaction.editReply(`🏓 Pong!\n> 📶 **API**: ${pingTime}ms\n> 🌐 **WebSocket**: ${wsLatency}ms`);
    },
};
