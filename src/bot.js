const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { connectToDatabase } = require('./utils/database');
const logger = require('./utils/logger');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction
  ]
});

// Kolekcje komend i eventów
client.commands = new Collection();
client.cooldowns = new Collection();

// Funkcja do ładowania komend
function loadCommands() {
  const commandsPath = path.join(__dirname, 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      logger.info(`Załadowano komendę: ${command.data.name}`);
    } else {
      logger.warn(`Komenda w ${filePath} nie posiada wymaganego "data" lub "execute"`);
    }
  }
}

// Funkcja do ładowania eventów
function loadEvents() {
  const eventsPath = path.join(__dirname, 'events');
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
    
    logger.info(`Załadowano event: ${event.name}`);
  }
}

// Funkcja startująca bota
function startBot() {
  // Połączenie z bazą danych
  connectToDatabase();
  
  // Ładowanie komend i eventów
  loadCommands();
  loadEvents();
  
  // Logowanie do Discord
  client.login(process.env.DISCORD_TOKEN);
  
  return client;
}

module.exports = { startBot, client };
