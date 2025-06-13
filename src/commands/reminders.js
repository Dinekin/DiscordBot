// src/commands/reminders.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Reminder = require('../models/Reminder');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reminders')
    .setDescription('Zarządzaj swoimi przypomnieniami')
    .addSubcommand(subcommand =>
      subcommand
        .setName('lista')
        .setDescription('Zobacz swoje aktywne przypomnienia'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('usuń')
        .setDescription('Usuń przypomnienie')
        .addStringOption(option =>
          option.setName('id')
            .setDescription('ID przypomnienia do usunięcia')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('wyczyść')
        .setDescription('Usuń wszystkie swoje przypomnienia')),

  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      
      switch (subcommand) {
        case 'lista':
          await handleListReminders(interaction);
          break;
        case 'usuń':
          await handleDeleteReminder(interaction);
          break;
        case 'wyczyść':
          await handleClearReminders(interaction);
          break;
        default:
          await interaction.reply({
            content: '❌ Nieznana podkomenda.',
            ephemeral: true
          });
      }
    } catch (error) {
      logger.error(`Błąd w komendzie reminders: ${error.stack}`);
      
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ Wystąpił błąd podczas wykonywania komendy.',
          ephemeral: true
        });
      }
    }
  }
};

// Funkcja do wyświetlania listy przypomnień
async function handleListReminders(interaction) {
  try {
    const reminders = await Reminder.find({
      userId: interaction.user.id,
      isCompleted: false
    }).sort({ remindAt: 1 }).limit(20);
    
    if (reminders.length === 0) {
      const embed = new EmbedBuilder()
        .setColor('#808080')
        .setTitle('📭 Brak przypomnień')
        .setDescription('Nie masz żadnych aktywnych przypomnień.\n\nUżyj `/remind` aby utworzyć nowe przypomnienie.');
      
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    const embed = new EmbedBuilder()
      .setColor('#00aaff')
      .setTitle(`⏰ Twoje przypomnienia (${reminders.length})`)
      .setFooter({ text: 'Aby usunąć przypomnienie, użyj /reminders usuń [ID]' })
      .setTimestamp();
    
    // Dodaj przypomnienia jako pola
    for (let i = 0; i < Math.min(reminders.length, 10); i++) {
      const reminder = reminders[i];
      const timeLeft = reminder.remindAt.getTime() - Date.now();
      
      let timeDisplay;
      if (timeLeft <= 0) {
        timeDisplay = '⏰ Już powinno być wysłane';
      } else {
        timeDisplay = `<t:${Math.floor(reminder.remindAt.getTime() / 1000)}:R>`;
      }
      
      // Skróć tekst jeśli za długi
      let displayText = reminder.reminderText;
      if (displayText.length > 100) {
        displayText = displayText.substring(0, 97) + '...';
      }
      
      embed.addFields({
        name: `${i + 1}. ${timeDisplay}`,
        value: `**Treść:** ${displayText}\n**ID:** \`${reminder._id}\``,
        inline: false
      });
    }
    
    // Jeśli jest więcej niż 10 przypomnień
    if (reminders.length > 10) {
      embed.setDescription(`Pokazuję pierwsze 10 z ${reminders.length} przypomnień.`);
    }
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
    
  } catch (error) {
    logger.error(`Błąd podczas wyświetlania listy przypomnień: ${error.message}`);
    await interaction.reply({
      content: '❌ Nie można pobrać listy przypomnień.',
      ephemeral: true
    });
  }
}

// Funkcja do usuwania konkretnego przypomnienia
async function handleDeleteReminder(interaction) {
  try {
    const reminderId = interaction.options.getString('id');
    
    // Sprawdź czy ID ma prawidłowy format MongoDB ObjectId
    if (!/^[0-9a-fA-F]{24}$/.test(reminderId)) {
      return interaction.reply({
        content: '❌ Nieprawidłowy format ID przypomnienia.',
        ephemeral: true
      });
    }
    
    // Znajdź i usuń przypomnienie
    const reminder = await Reminder.findOneAndDelete({
      _id: reminderId,
      userId: interaction.user.id,
      isCompleted: false
    });
    
    if (!reminder) {
      return interaction.reply({
        content: '❌ Nie znaleziono takiego przypomnienia lub nie należy do Ciebie.',
        ephemeral: true
      });
    }
    
    // Skróć tekst dla potwierdzenia
    let displayText = reminder.reminderText;
    if (displayText.length > 200) {
      displayText = displayText.substring(0, 197) + '...';
    }
    
    const embed = new EmbedBuilder()
      .setColor('#ff4444')
      .setTitle('🗑️ Przypomnienie usunięte')
      .setDescription(`**Treść:** ${displayText}`)
      .addFields(
        { 
          name: '📅 Miało być wysłane', 
          value: `<t:${Math.floor(reminder.remindAt.getTime() / 1000)}:F>`, 
          inline: true 
        }
      )
      .setFooter({ text: `ID: ${reminder._id}` });
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
    
    logger.info(`Usunięto przypomnienie ${reminder._id} użytkownika ${interaction.user.tag}`);
    
  } catch (error) {
    logger.error(`Błąd podczas usuwania przypomnienia: ${error.message}`);
    await interaction.reply({
      content: '❌ Nie można usunąć przypomnienia.',
      ephemeral: true
    });
  }
}

// Funkcja do usuwania wszystkich przypomnień
async function handleClearReminders(interaction) {
  try {
    // Najpierw sprawdź ile przypomnień ma użytkownik
    const count = await Reminder.countDocuments({
      userId: interaction.user.id,
      isCompleted: false
    });
    
    if (count === 0) {
      return interaction.reply({
        content: '❌ Nie masz żadnych aktywnych przypomnień do usunięcia.',
        ephemeral: true
      });
    }
    
    // Usuń wszystkie przypomnienia użytkownika
    const result = await Reminder.deleteMany({
      userId: interaction.user.id,
      isCompleted: false
    });
    
    const embed = new EmbedBuilder()
      .setColor('#ff4444')
      .setTitle('🧹 Wyczyszczono przypomnienia')
      .setDescription(`Usunięto **${result.deletedCount}** ${result.deletedCount === 1 ? 'przypomnienie' : 'przypomnień'}.`)
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
    
    logger.info(`Usunięto ${result.deletedCount} przypomnień użytkownika ${interaction.user.tag}`);
    
  } catch (error) {
    logger.error(`Błąd podczas czyszczenia przypomnień: ${error.message}`);
    await interaction.reply({
      content: '❌ Nie można wyczyścić przypomnień.',
      ephemeral: true
    });
  }
}