// src/utils/liveFeedManager.js
const { EmbedBuilder } = require('discord.js');
const LiveFeed = require('../models/LiveFeed');
const logger = require('./logger');

class LiveFeedManager {
  constructor(client) {
    this.client = client;
    this.intervalId = null;
    this.checkInterval = 15000; // sprawdzaj co 15 sekund
    this.feeds = new Map(); // przechowuje aktywne feedy w pamięci
    this.lastExecuted = new Map(); // śledzi ostatnie wykonania feedów
  }

  // Inicjalizacja managera
  async init() {
    logger.info('Inicjalizacja Live Feed Manager');
    await this.loadFeeds();
    this.startFeedChecker();
    return this;
  }

  // Załaduj wszystkie aktywne feedy z bazy danych
  async loadFeeds() {
    try {
      const feeds = await LiveFeed.find({ isActive: true });
      logger.info(`Załadowano ${feeds.length} aktywnych live feedów`);
      
      // Resetowanie mapy
      this.feeds.clear();
      this.lastExecuted.clear();
      
      // Dodawanie do mapy
      feeds.forEach(feed => {
        this.feeds.set(feed._id.toString(), feed);
        
        // Ustaw ostatnie wykonanie na lastRun z bazy danych lub null
        if (feed.lastRun) {
          this.lastExecuted.set(feed._id.toString(), new Date(feed.lastRun));
        }
        
        // Oblicz następny czas uruchomienia (jeśli jeszcze nie określono)
        if (!feed.nextRun) {
          feed.calculateNextRun();
          feed.save();
        }
      });
    } catch (error) {
      logger.error(`Błąd podczas ładowania live feedów: ${error.stack}`);
    }
  }

  // Rozpocznij sprawdzanie feedów
  startFeedChecker() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    
    this.intervalId = setInterval(() => this.checkFeeds(), this.checkInterval);
    logger.info(`Uruchomiono sprawdzanie live feedów co ${this.checkInterval / 1000} sekund`);
  }

  // Zatrzymaj sprawdzanie feedów
  stopFeedChecker() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Zatrzymano sprawdzanie live feedów');
    }
  }

  // Główna funkcja sprawdzająca i uruchamiająca feedy
  async checkFeeds() {
    const now = new Date();
    now.setMilliseconds(0);
    logger.debug(`Sprawdzanie live feedów... (${now.toLocaleTimeString()})`);
    for (const [id, feed] of this.feeds.entries()) {
      try {
        if (feed.isActive && feed.nextRun) {
          const diff = Math.abs(feed.nextRun.getTime() - now.getTime());
          logger.debug(`Feed: ${feed.name} (ID: ${id}) nextRun: ${feed.nextRun.toISOString()} now: ${now.toISOString()} diff: ${diff}ms`);
          if (diff < 15000 && (!feed.lastRun || feed.lastRun < feed.nextRun)) { // tolerancja do 15 sekund, nie uruchamiaj podwójnie
            logger.info(`Uruchamianie live feed "${feed.name}" (ID: ${id})`);
            await this.executeFeed(feed);
            this.lastExecuted.set(id, new Date(now));
            feed.lastRun = now;
            feed.calculateNextRun();
            await feed.save();
            logger.info(`Następne uruchomienie live feed "${feed.name}" (ID: ${id}) zaplanowane na: ${feed.nextRun}`);
          }
        }
      } catch (error) {
        logger.error(`Błąd podczas wykonywania live feed ${id}: ${error.stack}`);
      }
    }
  }

  // Poprawiona funkcja sprawdzania, czy feed powinien zostać uruchomiony
  shouldRunCron(feed, currentTime) {
    const date = currentTime || new Date();
    
    // Wyciągnij komponenty daty
    const minute = date.getMinutes();
    const hour = date.getHours();
    const dayOfMonth = date.getDate();
    const month = date.getMonth() + 1; // JavaScript zwraca miesiące 0-11
    const dayOfWeek = date.getDay(); // 0 = niedziela, 6 = sobota
    
    // Funkcja do sprawdzania czy wartość pasuje do wzorca CRON
    function matchesCronPattern(value, pattern) {
      if (pattern === '*') return true;
      
      // Obsługa wielu wartości oddzielonych przecinkiem
      if (pattern.includes(',')) {
        const allowed = pattern.split(',').map(p => parseInt(p.trim()));
        return allowed.includes(value);
      }
      
      // Dopasowanie pojedynczej wartości
      return parseInt(pattern) === value;
    }
    
    // Sprawdź, czy wszystkie komponenty daty pasują do harmonogramu
    const minuteMatches = matchesCronPattern(minute, feed.schedule.minute);
    const hourMatches = matchesCronPattern(hour, feed.schedule.hour);
    const dayMatches = matchesCronPattern(dayOfMonth, feed.schedule.dayOfMonth);
    const monthMatches = matchesCronPattern(month, feed.schedule.month);
    const weekdayMatches = matchesCronPattern(dayOfWeek, feed.schedule.dayOfWeek);
    
    const result = minuteMatches && hourMatches && dayMatches && monthMatches && weekdayMatches;
    
    // Debugowanie tylko gdy result jest true
    if (result) {
      logger.info(`Feed "${feed.name}" (ID: ${feed._id}) powinien zostać uruchomiony o ${date.toISOString()}!`);
      logger.debug(`Sprawdzanie harmonogramu dla feed "${feed.name}" (ID: ${feed._id}):
        Czas sprawdzania: ${date.toISOString()}
        Minuta: ${minute} vs ${feed.schedule.minute} -> ${minuteMatches ? 'TAK' : 'NIE'}
        Godzina: ${hour} vs ${feed.schedule.hour} -> ${hourMatches ? 'TAK' : 'NIE'}
        Dzień miesiąca: ${dayOfMonth} vs ${feed.schedule.dayOfMonth} -> ${dayMatches ? 'TAK' : 'NIE'}
        Miesiąc: ${month} vs ${feed.schedule.month} -> ${monthMatches ? 'TAK' : 'NIE'}
        Dzień tygodnia: ${dayOfWeek} vs ${feed.schedule.dayOfWeek} -> ${weekdayMatches ? 'TAK' : 'NIE'}`);
    }
    
    return result;
  }

  // Wykonaj pojedynczy feed
  async executeFeed(feed) {
    try {
      // Pobierz serwer i kanał
      const guild = this.client.guilds.cache.get(feed.guildId);
      if (!guild) {
        logger.warn(`Serwer ${feed.guildId} nie został znaleziony dla live feed ${feed._id}`);
        return;
      }
      
      const channel = guild.channels.cache.get(feed.channelId);
      if (!channel) {
        logger.warn(`Kanał ${feed.channelId} nie został znaleziony dla live feed ${feed._id}`);
        return;
      }
      
      // Sprawdź uprawnienia bota do pisania na kanale
      if (!channel.permissionsFor(guild.members.me)?.has('SendMessages')) {
        logger.warn(`Bot nie ma uprawnień do pisania na kanale ${channel.name} dla live feed ${feed._id}`);
        return;
      }
      
      // Przygotuj wiadomość
      if (feed.embed) {
        // Utwórz embed
        const embed = new EmbedBuilder()
          .setColor(feed.embedColor)
          .setDescription(feed.message)
          .setTimestamp();
          
        // Dodaj stopkę z nazwą feed
        embed.setFooter({ text: `Live Feed: ${feed.name}` });
        
        // Wyślij embed
        await channel.send({ embeds: [embed] });
      } else {
        // Wyślij zwykłą wiadomość
        await channel.send(feed.message);
      }
      
      logger.info(`Pomyślnie wykonano live feed "${feed.name}" (ID: ${feed._id})`);
    } catch (error) {
      logger.error(`Błąd podczas wysyłania wiadomości live feed ${feed._id}: ${error.stack}`);
      throw error; // przekaż błąd wyżej
    }
  }

  // Dodaj nowy feed
  async addFeed(feedData) {
    try {
      const newFeed = new LiveFeed(feedData);
      newFeed.calculateNextRun();
      await newFeed.save();
      
      // Dodaj do mapy aktywnych feedów
      this.feeds.set(newFeed._id.toString(), newFeed);
      
      logger.info(`Dodano nowy live feed "${newFeed.name}" (ID: ${newFeed._id})`);
      return newFeed;
    } catch (error) {
      logger.error(`Błąd podczas dodawania live feed: ${error.stack}`);
      throw error;
    }
  }

  // Edytuj istniejący feed
  async updateFeed(feedId, updateData) {
    try {
      const feed = await LiveFeed.findById(feedId);
      if (!feed) {
        throw new Error(`Live feed o ID ${feedId} nie został znaleziony`);
      }
      
      // Aktualizuj dane
      Object.assign(feed, updateData);
      feed.calculateNextRun();
      await feed.save();
      
      // Aktualizuj w mapie lub usuń jeśli nieaktywny
      if (feed.isActive) {
        this.feeds.set(feed._id.toString(), feed);
      } else {
        this.feeds.delete(feed._id.toString());
        this.lastExecuted.delete(feed._id.toString());
      }
      
      logger.info(`Zaktualizowano live feed "${feed.name}" (ID: ${feed._id})`);
      return feed;
    } catch (error) {
      logger.error(`Błąd podczas aktualizacji live feed: ${error.stack}`);
      throw error;
    }
  }

  // Usuń feed
  async deleteFeed(feedId) {
    try {
      const result = await LiveFeed.findByIdAndDelete(feedId);
      if (!result) {
        throw new Error(`Live feed o ID ${feedId} nie został znaleziony`);
      }
      
      // Usuń z map
      this.feeds.delete(feedId);
      this.lastExecuted.delete(feedId);
      
      logger.info(`Usunięto live feed "${result.name}" (ID: ${feedId})`);
      return result;
    } catch (error) {
      logger.error(`Błąd podczas usuwania live feed: ${error.stack}`);
      throw error;
    }
  }

  // Pobierz wszystkie feedy dla danego serwera
  async getGuildFeeds(guildId) {
    try {
      return await LiveFeed.find({ guildId });
    } catch (error) {
      logger.error(`Błąd podczas pobierania live feedów dla serwera ${guildId}: ${error.stack}`);
      throw error;
    }
  }

  // Pobierz konkretny feed
  async getFeed(feedId) {
    try {
      return await LiveFeed.findById(feedId);
    } catch (error) {
      logger.error(`Błąd podczas pobierania live feed ${feedId}: ${error.stack}`);
      throw error;
    }
  }
}

module.exports = { LiveFeedManager };