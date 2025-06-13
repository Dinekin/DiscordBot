// src/utils/reminderChecker.js
const { EmbedBuilder } = require('discord.js');
const Reminder = require('../models/Reminder');
const logger = require('./logger');

// Główna funkcja sprawdzania przypomnień
async function checkDueReminders(client) {
  try {
    const now = new Date();
    
    // Znajdź wszystkie przypomnienia, które powinny zostać wysłane
    const dueReminders = await Reminder.find({
      remindAt: { $lte: now },
      isCompleted: false
    }).sort({ remindAt: 1 }).limit(50); // Maksymalnie 50 na raz
    
    if (dueReminders.length === 0) {
      return { processed: 0, sent: 0, errors: 0 };
    }
    
    logger.info(`📋 Znaleziono ${dueReminders.length} przypomnień do wysłania`);
    
    let sent = 0;
    let errors = 0;
    
    for (const reminder of dueReminders) {
      try {
        await sendReminder(client, reminder);
        sent++;
        
        // Oznacz jako ukończone
        reminder.isCompleted = true;
        await reminder.save();
        
        logger.info(`✅ Wysłano przypomnienie ${reminder._id} do użytkownika ${reminder.userId}`);
        
      } catch (error) {
        logger.error(`❌ Błąd podczas wysyłania przypomnienia ${reminder._id}: ${error.message}`);
        errors++;
        
        // Jeśli błąd był związany z niemożnością wysłania DM, oznacz jako ukończone
        if (error.code === 50007 || error.message.includes('Cannot send messages to this user')) {
          reminder.isCompleted = true;
          await reminder.save();
          logger.info(`📭 Oznaczono przypomnienie ${reminder._id} jako ukończone - nie można wysłać DM`);
        }
      }
      
      // Pauza między przypomnieniami
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    logger.info(`📊 Przetworzono ${dueReminders.length} przypomnień: ${sent} wysłanych, ${errors} błędów`);
    
    return { processed: dueReminders.length, sent, errors };
    
  } catch (error) {
    logger.error(`💥 Krytyczny błąd podczas sprawdzania przypomnień: ${error.stack}`);
    return { processed: 0, sent: 0, errors: 1 };
  }
}

// Funkcja wysyłania pojedynczego przypomnienia
async function sendReminder(client, reminder) {
  try {
    // Pobierz użytkownika
    const user = await client.users.fetch(reminder.userId);
    if (!user) {
      throw new Error(`Nie znaleziono użytkownika ${reminder.userId}`);
    }
    
    // Pobierz serwer i kanał do dodatkowych informacji
    let guild = null;
    let channel = null;
    
    try {
      guild = await client.guilds.fetch(reminder.guildId);
      if (guild) {
        channel = await guild.channels.fetch(reminder.channelId);
      }
    } catch (guildError) {
      logger.warn(`Nie można pobrać informacji o serwerze/kanale dla przypomnienia ${reminder._id}`);
    }
    
    // Przygotuj embed z przypomnieniem
    const embed = new EmbedBuilder()
      .setColor('#ffaa00')
      .setTitle('⏰ Przypomnienie!')
      .setDescription(reminder.reminderText)
      .addFields(
        { 
          name: '📅 Ustawione', 
          value: `<t:${Math.floor(reminder.createdAt.getTime() / 1000)}:R>`, 
          inline: true 
        }
      )
      .setFooter({ text: `ID: ${reminder._id}` })
      .setTimestamp();
    
    // Dodaj informacje o serwerze jeśli dostępne
    if (guild) {
      embed.addFields({
        name: '🏠 Serwer',
        value: guild.name,
        inline: true
      });
      
      if (channel) {
        embed.addFields({
          name: '📋 Kanał',
          value: `#${channel.name}`,
          inline: true
        });
      }
      
      // Dodaj ikonę serwera jako thumbnail
      if (guild.iconURL()) {
        embed.setThumbnail(guild.iconURL({ dynamic: true }));
      }
    }
    
    // Wyślij DM
    await user.send({ embeds: [embed] });
    
    logger.debug(`📨 Wysłano przypomnienie DM do ${user.tag}`);
    
  } catch (error) {
    logger.error(`❌ Błąd podczas wysyłania przypomnienia: ${error.message}`);
    throw error;
  }
}

// Globalna zmienna dla interval ID
let globalReminderCheckerInterval = null;

// Uruchom automatyczne sprawdzanie przypomnień
function startReminderChecker(client, intervalMinutes = 1) {
  const intervalMs = intervalMinutes * 60 * 1000;
  
  // Zatrzymaj poprzedni checker jeśli istnieje
  if (globalReminderCheckerInterval) {
    clearInterval(globalReminderCheckerInterval);
    logger.info('🛑 Zatrzymano poprzedni checker przypomnień');
  }
  
  logger.info(`🚀 Uruchamianie automatycznego sprawdzania przypomnień co ${intervalMinutes} ${intervalMinutes === 1 ? 'minutę' : 'minut'}`);
  
  // Funkcja sprawdzająca
  const runCheck = async () => {
    try {
      const result = await checkDueReminders(client);
      if (result.processed > 0) {
        logger.info(`📈 Wynik sprawdzania przypomnień: Przetworzono: ${result.processed}, Wysłano: ${result.sent}, Błędów: ${result.errors}`);
      }
    } catch (error) {
      logger.error(`💥 Błąd podczas automatycznego sprawdzania przypomnień: ${error.message}`);
    }
  };
  
  // Uruchom po 10 sekundach
  setTimeout(() => {
    logger.info('🏁 Pierwsze sprawdzanie przypomnień po starcie bota');
    runCheck();
  }, 10000);
  
  // Następnie co określony interwał
  globalReminderCheckerInterval = setInterval(runCheck, intervalMs);
  
  logger.info(`✅ Checker przypomnień uruchomiony. Następne sprawdzenie za ${intervalMinutes} ${intervalMinutes === 1 ? 'minutę' : 'minut'}`);
  
  return globalReminderCheckerInterval;
}

// Zatrzymaj sprawdzanie
function stopReminderChecker() {
  if (globalReminderCheckerInterval) {
    clearInterval(globalReminderCheckerInterval);
    globalReminderCheckerInterval = null;
    logger.info('🛑 Zatrzymano automatyczne sprawdzanie przypomnień');
    return true;
  }
  return false;
}

// Sprawdź status
function getReminderCheckerStatus() {
  return {
    isRunning: globalReminderCheckerInterval !== null,
    intervalId: globalReminderCheckerInterval ? 'active' : null
  };
}

// Funkcja do usuwania starych ukończonych przypomnień (cleanup)
async function cleanupOldReminders(daysOld = 30) {
  try {
    const cutoffDate = new Date(Date.now() - (daysOld * 24 * 60 * 60 * 1000));
    
    const result = await Reminder.deleteMany({
      isCompleted: true,
      updatedAt: { $lt: cutoffDate }
    });
    
    if (result.deletedCount > 0) {
      logger.info(`🧹 Usunięto ${result.deletedCount} starych przypomnień (starszych niż ${daysOld} dni)`);
    }
    
    return result.deletedCount;
  } catch (error) {
    logger.error(`❌ Błąd podczas czyszczenia starych przypomnień: ${error.message}`);
    return 0;
  }
}

module.exports = {
  checkDueReminders,
  sendReminder,
  startReminderChecker,
  stopReminderChecker,
  getReminderCheckerStatus,
  cleanupOldReminders
};