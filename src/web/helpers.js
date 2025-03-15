// Dodaj te funkcje pomocnicze do pliku server.js jako middleware przed routingiem
// lub utwórz plik src/web/helpers.js i zaimportuj go w server.js

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
    
    // Formatowanie czasu względnego (np. "5 minut temu", "za 2 godziny")
    res.locals.timeAgo = function(date) {
      if (!date) return 'nigdy';
      
      const now = new Date();
      const past = new Date(date);
      const diffMs = now - past;
      const diffSec = Math.round(diffMs / 1000);
      const diffMin = Math.round(diffSec / 60);
      const diffHour = Math.round(diffMin / 60);
      const diffDay = Math.round(diffHour / 24);
      
      function formatTimeDiff(diffSec, diffMin, diffHour, diffDay) {
        if (diffDay > 30) {
          return 'ponad miesiąc';
        } else if (diffDay > 0) {
          return `${diffDay} ${diffDay === 1 ? 'dzień' : (diffDay < 5 ? 'dni' : 'dni')}`;
        } else if (diffHour > 0) {
          return `${diffHour} ${diffHour === 1 ? 'godzinę' : (diffHour < 5 ? 'godziny' : 'godzin')}`;
        } else if (diffMin > 0) {
          return `${diffMin} ${diffMin === 1 ? 'minutę' : (diffMin < 5 ? 'minuty' : 'minut')}`;
        } else {
          return `${diffSec} ${diffSec === 1 ? 'sekundę' : (diffSec < 5 ? 'sekundy' : 'sekund')}`;
        }
      }
      
      if (diffSec < 0) {
        // Przyszłość
        return `za ${formatTimeDiff(-diffSec, -diffMin, -diffHour, -diffDay)}`;
      } else {
        // Przeszłość
        return `${formatTimeDiff(diffSec, diffMin, diffHour, diffDay)} temu`;
      }
    };
    
    next();
  });
}