const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { connectToDatabase } = require('./utils/database');
const { setupGiveawaysManager } = require('./utils/giveawayManager');
const logger = require('./utils/logger');
const { checkExpiredRoles } = require('./utils/checkExpiredRoles');
const { LiveFeedManager } = require('./utils/liveFeedManager');

// Konfiguracja klienta Discord z odpowiednimi uprawnieniami
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent, // Potrzebne do logowania wiadomości
    GatewayIntentBits.GuildMembers // Potrzebne do wydarzeń członków serwera
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User,
    Partials.GuildMember
  ]
});

// Kolekcje komend i cooldownów
client.commands = new Collection();
client.cooldowns = new Collection();

// Funkcja do ładowania komend
function loadCommands() {
  const commandsPath = path.join(__dirname, 'commands');
  
  if (!fs.existsSync(commandsPath)) {
    logger.error(`Katalog komend nie istnieje: ${commandsPath}`);
    return;
  }
  
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  logger.info(`Znaleziono ${commandFiles.length} plików komend`);
  
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    try {
      const command = require(filePath);
      
      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        logger.info(`Załadowano komendę: ${command.data.name}`);
      } else {
        logger.warn(`Komenda w ${filePath} nie posiada wymaganego "data" lub "execute"`);
      }
    } catch (error) {
      logger.error(`Błąd podczas ładowania komendy ${file}: ${error.stack}`);
    }
  }
}

// Funkcja do ładowania eventów
function loadEvents() {
  const eventsPath = path.join(__dirname, 'events');
  
  if (!fs.existsSync(eventsPath)) {
    logger.error(`Katalog eventów nie istnieje: ${eventsPath}`);
    return;
  }
  
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
  logger.info(`Znaleziono ${eventFiles.length} plików eventów`);
  
  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    try {
      const event = require(filePath);
      
      if (!event.name) {
        logger.warn(`Event w ${filePath} nie posiada właściwości "name"`);
        continue;
      }
      
      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
      } else {
        client.on(event.name, (...args) => event.execute(...args, client));
      }
      
      logger.info(`Załadowano event: ${event.name}`);
    } catch (error) {
      logger.error(`Błąd podczas ładowania eventu ${file}: ${error.stack}`);
    }
  }
}

// Obsługa błędów niekrytycznych
client.on('warn', warn => {
  logger.warn(`Ostrzeżenie Discord: ${warn}`);
});

// Obsługa błędów
client.on('error', error => {
  logger.error(`Błąd Discord: ${error.message}`);
});

// Funkcja diagnostyczna do sprawdzenia zarejestrowanych listenerów
function listRegisteredEvents() {
  const events = client.eventNames();
  logger.info(`Bot ma zarejestrowanych ${events.length} listenerów zdarzeń:`);
  events.forEach(event => {
    const listenerCount = client.listenerCount(event);
    logger.info(`- ${event}: ${listenerCount} listener(s)`);
  });
}

const ROLE_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minut w milisekundach
setInterval(() => {
  checkExpiredRoles(client).catch(error => {
    logger.error(`Błąd podczas sprawdzania wygasłych ról: ${error.message}`);
  });
}, ROLE_CHECK_INTERVAL);

logger.info(`Uruchomiono automatyczne sprawdzanie wygasłych ról co ${ROLE_CHECK_INTERVAL / 60000} minut`);

// W funkcji startBot, po załadowaniu komend i eventów, ale przed logowaniem do Discorda
async function startBot() {
  try {
    // Połączenie z bazą danych
    await connectToDatabase();
    
    // Ładowanie komend i eventów
    loadCommands();
    loadEvents();
    
    // Lista zarejestrowanych listenerów po załadowaniu
    listRegisteredEvents();
    
    // Logowanie do Discord
    logger.info('Łączenie z API Discorda...');
    await client.login(process.env.DISCORD_TOKEN);
    
    // Inicjalizacja managera giveaway po zalogowaniu do Discorda
    const { setupGiveawaysManager } = require('./utils/giveawayManager');
    client.giveawaysManager = setupGiveawaysManager(client);
    logger.info('Menedżer giveaway został zainicjalizowany');

    client.liveFeedManager = await new LiveFeedManager(client).init();
    logger.info('Menedżer Live Feed został zainicjalizowany');
    
    logger.info(`Bot został uruchomiony pomyślnie i obsługuje ${client.guilds.cache.size} serwerów`);
  } catch (error) {
    logger.error(`Błąd podczas uruchamiania bota: ${error.stack}`);
    process.exit(1);
  }
}


module.exports = { startBot, client };