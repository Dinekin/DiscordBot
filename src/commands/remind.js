// src/commands/remind.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Reminder = require('../models/Reminder');
const logger = require('../utils/logger');

// Funkcja do parsowania czasu (np. "1h", "30m", "2d")
function parseTimeString(timeStr) {
  const regex = /^(\d+)([smhdw])$/i;
  const match = timeStr.match(regex);
  
  if (!match) {
    throw new Error('Nieprawidłowy format czasu. Użyj: s (sekundy), m (minuty), h (godziny), d (dni), w (tygodnie)');
  }
  
  const amount = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  
  let milliseconds;
  switch (unit) {
    case 's':
      milliseconds = amount * 1000;
      break;
    case 'm':
      milliseconds = amount * 60 * 1000;
      break;
    case 'h':
      milliseconds = amount * 60 * 60 * 1000;
      break;
    case 'd':
      milliseconds = amount * 24 * 60 * 60 * 1000;
      break;
    case 'w':
      milliseconds = amount * 7 * 24 * 60 * 60 * 1000;
      break;
    default:
      throw new Error('Nieznana jednostka czasu');
  }
  
  // Sprawdź limity (maksymalnie rok)
  const maxTime = 365 * 24 * 60 * 60 * 1000; // 1 rok w milisekundach
  if (milliseconds > maxTime) {
    throw new Error('Maksymalny czas przypomnienia to 1 rok');
  }
  
  if (milliseconds < 60000) { // Minimum 1 minuta
    throw new Error('Minimalny czas przypomnienia to 1 minuta');
  }
  
  return milliseconds;
}

// Funkcja do formatowania czasu
function formatTime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  
  if (weeks > 0) {
    const remainingDays = days % 7;
    return `${weeks} ${weeks === 1 ? 'tydzień' : 'tygodni'}${remainingDays > 0 ? ` i ${remainingDays} ${remainingDays === 1 ? 'dzień' : 'dni'}` : ''}`;
  } else if (days > 0) {
    const remainingHours = hours % 24;
    return `${days} ${days === 1 ? 'dzień' : 'dni'}${remainingHours > 0 ? ` i ${remainingHours} ${remainingHours === 1 ? 'godzinę' : 'godzin'}` : ''}`;
  } else if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours} ${hours === 1 ? 'godzinę' : 'godzin'}${remainingMinutes > 0 ? ` i ${remainingMinutes} ${remainingMinutes === 1 ? 'minutę' : 'minut'}` : ''}`;
  } else {
    return `${minutes} ${minutes === 1 ? 'minutę' : 'minut'}`;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Ustaw przypomnienie o wydarzeniu')
    .addStringOption(option =>
      option.setName('czas')
        .setDescription('Za ile czasu przypomnieć (np. 1h, 30m, 2d)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('tekst')
        .setDescription('Tekst przypomnienia')
        .setRequired(true)),

  async execute(interaction) {
    try {
      const timeString = interaction.options.getString('czas');
      const reminderText = interaction.options.getString('tekst');
      
      // Sprawdź długość tekstu
      if (reminderText.length > 1500) {
        return interaction.reply({
          content: '❌ Tekst przypomnienia jest za długi! Maksymalnie 1500 znaków.',
          ephemeral: true
        });
      }
      
      // Parsuj czas
      let delayMs;
      try {
        delayMs = parseTimeString(timeString);
      } catch (error) {
        return interaction.reply({
          content: `❌ ${error.message}\n\n**Przykłady prawidłowych formatów:**\n• \`30s\` - 30 sekund\n• \`5m\` - 5 minut\n• \`2h\` - 2 godziny\n• \`1d\` - 1 dzień\n• \`1w\` - 1 tydzień`,
          ephemeral: true
        });
      }
      
      // Oblicz kiedy przypomnieć
      const remindAt = new Date(Date.now() + delayMs);
      
      // Sprawdź czy użytkownik nie ma za dużo aktywnych przypomnień
      const activeReminders = await Reminder.countDocuments({
        userId: interaction.user.id,
        isCompleted: false
      });
      
      if (activeReminders >= 20) {
        return interaction.reply({
          content: '❌ Masz już za dużo aktywnych przypomnień! Maksymalnie 20 na użytkownika.',
          ephemeral: true
        });
      }
      
      // Zapisz przypomnienie w bazie danych
      const reminder = await Reminder.create({
        userId: interaction.user.id,
        guildId: interaction.guild.id,
        channelId: interaction.channel.id,
        messageId: interaction.id,
        reminderText: reminderText,
        remindAt: remindAt,
        originalCommand: `${timeString} ${reminderText}`
      });
      
      logger.info(`Utworzono przypomnienie dla ${interaction.user.tag} (${interaction.user.id}) na ${remindAt.toISOString()}: ${reminderText}`);
      
      // Odpowiedź z potwierdzeniem
      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('⏰ Przypomnienie ustawione!')
        .addFields(
          { name: '📅 Kiedy', value: `<t:${Math.floor(remindAt.getTime() / 1000)}:F>`, inline: true },
          { name: '⏱️ Za ile', value: formatTime(delayMs), inline: true },
          { name: '📝 Treść', value: reminderText, inline: false }
        )
        .setFooter({ text: `ID przypomnienia: ${reminder._id}` })
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed] });
      
    } catch (error) {
      logger.error(`Błąd podczas tworzenia przypomnienia: ${error.stack}`);
      
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ Wystąpił błąd podczas tworzenia przypomnienia. Spróbuj ponownie.',
          ephemeral: true
        });
      }
    }
  }
};