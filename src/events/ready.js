const { Events } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        logger.info(`Zalogowano jako ${client.user.tag}!`);
        logger.info(`Bot obsługuje ${client.guilds.cache.size} serwerów`);

        // Ustawienie statusu bota
        client.user.setActivity('/reactionroles', { type: 2 }); // 2 = LISTENING
    },
};
