const { Events, Collection } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {
        // Loguj każdą otrzymaną interakcję w trybie debugowania
        logger.debug(`Odebrano interakcję typu: ${interaction.type}, ${interaction.commandName || 'bez nazwy komendy'}`);
        
        // Obsługa komend slash
        if (interaction.isChatInputCommand()) {
            // Pobierz komendę z kolekcji
            const command = client.commands.get(interaction.commandName);

            // Jeśli komenda nie istnieje, zignoruj
            if (!command) {
                logger.warn(`Próba wykonania nieistniejącej komendy ${interaction.commandName}`);
                return interaction.reply({
                    content: 'Ta komenda jest nieznana lub nie została jeszcze zaimplementowana.',
                    ephemeral: true
                }).catch(err => logger.error(`Błąd podczas odpowiedzi na nieznane polecenie: ${err}`));
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
                logger.info(`Użytkownik ${interaction.user.tag} wykonuje komendę ${interaction.commandName}`);
                await command.execute(interaction);
            } catch (error) {
                logger.error(`Błąd podczas wykonywania komendy ${interaction.commandName}:`, error);

                const errorMessage = 'Wystąpił błąd podczas wykonywania tej komendy!';

                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: errorMessage, ephemeral: true })
                        .catch(err => logger.error(`Błąd podczas wysyłania followUp: ${err}`));
                } else {
                    await interaction.reply({ content: errorMessage, ephemeral: true })
                        .catch(err => logger.error(`Błąd podczas wysyłania reply: ${err}`));
                }
            }
        }
        // Obsługa autocomplete
        else if (interaction.isAutocomplete()) {
            const command = client.commands.get(interaction.commandName);

            if (!command || !command.autocomplete) {
                logger.warn(`Próba wykonania nieistniejącej komendy autocomplete ${interaction.commandName}`);
                return;
            }

            try {
                await command.autocomplete(interaction);
            } catch (error) {
                logger.error(`Błąd podczas obsługi autocomplete dla komendy ${interaction.commandName}:`, error);
            }
        }
        // Obsługa komponentów (przyciski, menu wyboru)
        else if (interaction.isButton() || interaction.isSelectMenu()) {
            // Tutaj możesz dodać obsługę przycisków i menu wyboru
            logger.debug(`Odebrano interakcję z komponentem: ${interaction.customId}`);
        }
    },
};