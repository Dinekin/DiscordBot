// src/web/helpers.js
// Funkcje pomocnicze dla szablonów EJS

module.exports = function(app) {
  app.use((req, res, next) => {
    // Formatowanie harmonogramu CRON do czytelnej postaci dla człowieka
    res.locals.formatSchedule = function(schedule) {
      if (!schedule) return 'Nieznany harmonogram';
        
      const translations = {
        minute: { singular: 'minuta', plural: 'minuty', many: 'minut' },
        hour: { singular: 'godzina', plural: 'godziny', many: 'godzin' },
        dayOfMonth: { singular: 'dzień', plural: 'dni', many: 'dni' },
        month: { singular: 'miesiąc', plural: 'miesiące', many: 'miesięcy' },
        dayOfWeek: { singular: 'dzień tygodnia', plural: 'dni tygodnia', many: 'dni tygodnia' }
      };
      
      const weekdays = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
      
      function formatPart(value, key) {
        if (!value) return '';
        
        if (value === '*') {
          return `Każdy ${translations[key].singular}`;
        }
        
        const values = value.split(',').map(v => v.trim());
        
        if (key === 'dayOfWeek') {
          const namedValues = values.map(v => weekdays[parseInt(v)]);
          
          if (namedValues.length === 1) {
            return `Co ${namedValues[0]}`;
          } else {
            return `W dni: ${namedValues.join(', ')}`;
          }
        } else {
          if (values.length === 1) {
            return `Co ${values[0]} (${translations[key].singular})`;
          } else {
            return `W ${translations[key].plural}: ${values.join(', ')}`;
          }
        }
      }
      
      const parts = [];
      if (schedule.minute) parts.push(formatPart(schedule.minute, 'minute'));
      if (schedule.hour) parts.push(formatPart(schedule.hour, 'hour'));
      if (schedule.dayOfMonth) parts.push(formatPart(schedule.dayOfMonth, 'dayOfMonth'));
      if (schedule.month) parts.push(formatPart(schedule.month, 'month'));
      if (schedule.dayOfWeek) parts.push(formatPart(schedule.dayOfWeek, 'dayOfWeek'));
      
      return parts.join(', ');
    };
    
    // Formatowanie czasu względnego (np. "5 minut temu", "za 2 godziny", "za 1 dzień")
    res.locals.timeAgo = function(date) {
      if (!date) return 'nigdy';
      
      const now = new Date();
      const targetDate = new Date(date);
      const diffMs = targetDate - now; // Różnica w milisekundach (ujemna dla przeszłości, dodatnia dla przyszłości)
      const isFuture = diffMs > 0;
      
      // Oblicz różnice w różnych jednostkach czasu
      const absDiffMs = Math.abs(diffMs);
      const absDiffSec = Math.floor(absDiffMs / 1000);
      const absDiffMin = Math.floor(absDiffSec / 60);
      const absDiffHour = Math.floor(absDiffMin / 60);
      const absDiffDay = Math.floor(absDiffHour / 24);
      const absDiffMonth = Math.floor(absDiffDay / 30);
      const absDiffYear = Math.floor(absDiffDay / 365);
      
      // Funkcja pomocnicza do wyboru poprawnej formy gramatycznej (dla języka polskiego)
      function polishPlural(number, singular, plural1, plural2) {
        if (number === 1) return singular;
        if (number % 10 >= 2 && number % 10 <= 4 && (number % 100 < 10 || number % 100 >= 20)) return plural1;
        return plural2;
      }
      
      let timeText = '';
      
      // Wybierz najbardziej odpowiednią jednostkę czasu
      if (absDiffYear > 0) {
        timeText = `${absDiffYear} ${polishPlural(absDiffYear, 'rok', 'lata', 'lat')}`;
      } else if (absDiffMonth > 0) {
        timeText = `${absDiffMonth} ${polishPlural(absDiffMonth, 'miesiąc', 'miesiące', 'miesięcy')}`;
      } else if (absDiffDay > 0) {
        timeText = `${absDiffDay} ${polishPlural(absDiffDay, 'dzień', 'dni', 'dni')}`;
      } else if (absDiffHour > 0) {
        timeText = `${absDiffHour} ${polishPlural(absDiffHour, 'godzinę', 'godziny', 'godzin')}`;
      } else if (absDiffMin > 0) {
        timeText = `${absDiffMin} ${polishPlural(absDiffMin, 'minutę', 'minuty', 'minut')}`;
      } else {
        timeText = `${absDiffSec} ${polishPlural(absDiffSec, 'sekundę', 'sekundy', 'sekund')}`;
      }
      
      // Dodaj odpowiedni przedrostek w zależności czy data jest w przyszłości czy przeszłości
      return isFuture ? `za ${timeText}` : `${timeText} temu`;
    };
    
    // Formatowanie daty do czytelnego formatu
    res.locals.formatDate = function(date) {
      if (!date) return 'brak daty';
      
      const d = new Date(date);
      return d.toLocaleString('pl-PL', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };
    
    // Formatowanie liczby z separatorem tysięcy
    res.locals.formatNumber = function(num) {
      return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    };
    
    // Skracanie tekstu
    res.locals.truncateText = function(text, length = 100) {
      if (!text) return '';
      if (text.length <= length) return text;
      return text.substring(0, length) + '...';
    };
    
    // Sprawdzanie uprawnień użytkownika - poprawiona wersja
    res.locals.hasPermission = function(user, guildId, permission) {
      if (!user || !user.guilds) return false;
      
      const guild = user.guilds.find(g => g.id === guildId);
      if (!guild) return false;
      
      // Stałe dla uprawnień
      const PERMISSIONS = {
        ADMIN: 0x8,              // ADMINISTRATOR
        MANAGE_GUILD: 0x20,      // MANAGE_GUILD
        MANAGE_ROLES: 0x10000000, // MANAGE_ROLES
        MANAGE_CHANNELS: 0x10,   // MANAGE_CHANNELS
        MANAGE_MESSAGES: 0x2000  // MANAGE_MESSAGES
      };
      
      // Jeśli użytkownik jest administratorem, zawsze ma wszystkie uprawnienia
      if ((guild.permissions & PERMISSIONS.ADMIN) === PERMISSIONS.ADMIN) return true;
      
      // Jeśli żądane jest konkretne uprawnienie
      if (permission && PERMISSIONS[permission]) {
        const permValue = PERMISSIONS[permission];
        return (guild.permissions & permValue) === permValue;
      }
      
      // Sprawdź, czy użytkownik ma jakiekolwiek uprawnienia moderatora
      return (guild.permissions & PERMISSIONS.MANAGE_GUILD) === PERMISSIONS.MANAGE_GUILD ||
             (guild.permissions & PERMISSIONS.MANAGE_ROLES) === PERMISSIONS.MANAGE_ROLES ||
             (guild.permissions & PERMISSIONS.MANAGE_MESSAGES) === PERMISSIONS.MANAGE_MESSAGES;
    };
    
    // Formatowanie koloru hex
    res.locals.formatColor = function(color) {
      if (!color) return '#000000';
      if (color.startsWith('#')) return color;
      return `#${color}`;
    };
    
    // Stwórz funkcję do sprawdzania statusu modułu (do użycia w templateach)
    res.locals.isModuleEnabled = function(settings, moduleName) {
      if (!settings || !settings.modules) return false;
      return settings.modules[moduleName] === true;
    };
    
    next();
  });
};