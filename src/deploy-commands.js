const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Funkcja do aktualizacji komend Slash
async function deployCommands() {
  const commands = [];
  const commandsPath = path.join(__dirname, 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command) {
      commands.push(command.data.toJSON());
    } else {
      console.log(`[WARNING] Komenda w ${filePath} nie posiada wymaganego "data"`);
    }
  }

  const rest = new REST().setToken(process.env.DISCORD_TOKEN);

  try {
    console.log(`Rozpoczęto odświeżanie ${commands.length} komend aplikacji.`);

    // Rejestracja komend globalnie
    const data = await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );

    console.log(`Pomyślnie odświeżono ${data.length} komend aplikacji.`);
  } catch (error) {
    console.error(error);
  }
}

// Uruchomienie deploymentu komend jeśli plik jest uruchamiany bezpośrednio
if (require.main === module) {
  deployCommands();
}

module.exports = { deployCommands };
