const { Events, Collection } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {
        // Ignoruj interakcje, które nie są komendami
        if (!interaction.isChatInputCommand()) return;

        // Pobierz komendę z kolekcji
        const command = client.commands.get(interaction.commandName);

        // Jeśli komenda nie istnieje, zignoruj
        if (!command) {
            logger.warn(`Próba wykonania nieistniejącej komendy ${interaction.commandName}`);
            return;
        }

        // Obsługa cooldownów
        const { cooldowns } = client;

        if (!cooldowns.has(command.data.name)) {
            cooldowns.set(command.data.name, new Collection());
        }

        const now = Date.now();
        const timestamps = cooldowns.get(command.data.name);
        const cooldownAmount = (command.cooldown || 3) * 1000;

        if (timestamps.has(interaction.user.id)) {
            const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;

            if (now < expirationTime) {
                const timeLeft = (expirationTime - now) / 1000;
                return interaction.reply({
                    content: `Poczekaj jeszcze ${timeLeft.toFixed(1)} sekund przed ponownym użyciem komendy \`${command.data.name}\`.`,
                                         ephemeral: true
                });
            }
        }

        timestamps.set(interaction.user.id, now);
        setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

        // Wykonaj komendę
        try {
            await command.execute(interaction);
        } catch (error) {
            logger.error(`Błąd podczas wykonywania komendy ${interaction.commandName}:`, error);

            const errorMessage = 'Wystąpił błąd podczas wykonywania tej komendy!';

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMessage, ephemeral: true });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    },
};
