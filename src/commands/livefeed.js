// src/commands/livefeed.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('livefeed')
    .setDescription('Zarządzanie automatycznymi wiadomościami (live feed)')
    .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator | 
        PermissionFlagsBits.ManageGuild | 
        PermissionFlagsBits.ManageRoles | 
        PermissionFlagsBits.ManageMessages
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Utwórz nowy harmonogram wiadomości')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Kanał, na którym będą publikowane wiadomości')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Nazwa harmonogramu')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('message')
            .setDescription('Treść wiadomości do wysłania')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('minute')
            .setDescription('Minuta (0-59, * dla każdej, można podać wiele wartości oddzielonych przecinkiem)'))
        .addStringOption(option =>
          option.setName('hour')
            .setDescription('Godzina (0-23, * dla każdej, można podać wiele wartości oddzielonych przecinkiem)'))
        .addStringOption(option =>
          option.setName('day')
            .setDescription('Dzień miesiąca (1-31, * dla każdego, można podać wiele wartości oddzielonych przecinkiem)'))
        .addStringOption(option =>
          option.setName('month')
            .setDescription('Miesiąc (1-12, * dla każdego, można podać wiele wartości oddzielonych przecinkiem)'))
        .addStringOption(option =>
          option.setName('weekday')
            .setDescription('Dzień tygodnia (0-6, 0=niedziela, * dla każdego, można podać wiele wartości oddzielonych przecinkiem)'))
        .addBooleanOption(option =>
          option.setName('embed')
            .setDescription('Czy wysłać jako osadzoną wiadomość (embed)'))
        .addStringOption(option =>
          option.setName('color')
            .setDescription('Kolor embeda (np. #3498db)')))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Wyświetl wszystkie harmonogramy wiadomości'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('info')
        .setDescription('Pokaż szczegóły harmonogramu')
        .addStringOption(option =>
          option.setName('id')
            .setDescription('ID harmonogramu')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('edit')
        .setDescription('Edytuj istniejący harmonogram')
        .addStringOption(option =>
          option.setName('id')
            .setDescription('ID harmonogramu do edycji')
            .setRequired(true))
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Kanał, na którym będą publikowane wiadomości'))
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Nazwa harmonogramu'))
        .addStringOption(option =>
          option.setName('message')
            .setDescription('Treść wiadomości do wysłania'))
        .addStringOption(option =>
          option.setName('minute')
            .setDescription('Minuta (0-59, * dla każdej, można podać wiele wartości oddzielonych przecinkiem)'))
        .addStringOption(option =>
          option.setName('hour')
            .setDescription('Godzina (0-23, * dla każdej, można podać wiele wartości oddzielonych przecinkiem)'))
        .addStringOption(option =>
          option.setName('day')
            .setDescription('Dzień miesiąca (1-31, * dla każdego, można podać wiele wartości oddzielonych przecinkiem)'))
        .addStringOption(option =>
          option.setName('month')
            .setDescription('Miesiąc (1-12, * dla każdego, można podać wiele wartości oddzielonych przecinkiem)'))
        .addStringOption(option =>
          option.setName('weekday')
            .setDescription('Dzień tygodnia (0-6, 0=niedziela, * dla każdego, można podać wiele wartości oddzielonych przecinkiem)'))
        .addBooleanOption(option =>
          option.setName('embed')
            .setDescription('Czy wysłać jako osadzoną wiadomość (embed)'))
        .addStringOption(option =>
          option.setName('color')
            .setDescription('Kolor embeda (np. #3498db)')))
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete')
        .setDescription('Usuń harmonogram wiadomości')
        .addStringOption(option =>
          option.setName('id')
            .setDescription('ID harmonogramu do usunięcia')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('pause')
        .setDescription('Wstrzymaj harmonogram wiadomości')
        .addStringOption(option =>
          option.setName('id')
            .setDescription('ID harmonogramu do wstrzymania')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('resume')
        .setDescription('Wznów wstrzymany harmonogram wiadomości')
        .addStringOption(option =>
          option.setName('id')
            .setDescription('ID harmonogramu do wznowienia')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('test')
        .setDescription('Wyślij testową wiadomość z harmonogramu')
        .addStringOption(option =>
          option.setName('id')
            .setDescription('ID harmonogramu do przetestowania')
            .setRequired(true))),

  async execute(interaction) {
    const { client } = require('../bot');
    
    // Sprawdź czy Live Feed Manager jest zainicjalizowany
    if (!client.liveFeedManager) {
      return interaction.reply({
        content: 'System Live Feed nie jest jeszcze zainicjalizowany.',
        ephemeral: true
      });
    }
    
    const subcommand = interaction.options.getSubcommand();
    
    try {
      // Utwórz nowy harmonogram
      if (subcommand === 'create') {
        const channel = interaction.options.getChannel('channel');
        const name = interaction.options.getString('name');
        const message = interaction.options.getString('message');
        const minute = interaction.options.getString('minute') || '*';
        const hour = interaction.options.getString('hour') || '*';
        const day = interaction.options.getString('day') || '*';
        const month = interaction.options.getString('month') || '*';
        const weekday = interaction.options.getString('weekday') || '*';
        const embed = interaction.options.getBoolean('embed') || false;
        const color = interaction.options.getString('color') || '#3498db';
        
        // Sprawdź czy kanał jest tekstowy
        if (channel.type !== 0) { // 0 = kanał tekstowy
          return interaction.reply({
            content: 'Live Feed można utworzyć tylko dla kanału tekstowego!',
            ephemeral: true
          });
        }
        
        // Walidacja wartości
        if (!validateCronValue(minute, 0, 59) || 
            !validateCronValue(hour, 0, 23) || 
            !validateCronValue(day, 1, 31) || 
            !validateCronValue(month, 1, 12) || 
            !validateCronValue(weekday, 0, 6)) {
          return interaction.reply({
            content: 'Nieprawidłowe wartości harmonogramu! Minuty (0-59), godziny (0-23), dni (1-31), miesiące (1-12), dni tygodnia (0-6).',
            ephemeral: true
          });
        }
        
        // Przygotuj dane
        const feedData = {
          guildId: interaction.guild.id,
          channelId: channel.id,
          name: name,
          message: message,
          schedule: {
            minute: minute,
            hour: hour,
            dayOfMonth: day,
            month: month,
            dayOfWeek: weekday
          },
          embed: embed,
          embedColor: color,
          createdBy: interaction.user.id
        };
        
        await interaction.deferReply();
        
        // Dodaj feed
        const newFeed = await client.liveFeedManager.addFeed(feedData);
        
        // Przygotuj informację o harmonogramie
        const scheduleText = formatSchedule(newFeed.schedule);
        
        // Odpowiedź
        const embedReply = new EmbedBuilder()
          .setTitle('Utworzono nowy Live Feed')
          .setColor('#2ecc71')
          .setDescription(`Harmonogram "${name}" został utworzony pomyślnie!`)
          .addFields(
            { name: 'ID', value: newFeed._id.toString() },
            { name: 'Kanał', value: `<#${channel.id}>` },
            { name: 'Harmonogram', value: scheduleText },
            { name: 'Wiadomość', value: message.length > 1024 ? message.substring(0, 1021) + '...' : message }
          )
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embedReply] });
      }
      
      // Wyświetl listę harmonogramów
      else if (subcommand === 'list') {
        await interaction.deferReply();
        
        // Pobierz wszystkie feedy dla tego serwera
        const feeds = await client.liveFeedManager.getGuildFeeds(interaction.guild.id);
        
        if (feeds.length === 0) {
          return interaction.editReply('Nie ma jeszcze żadnych harmonogramów Live Feed na tym serwerze.');
        }
        
        // Przygotuj odpowiedź
        const embed = new EmbedBuilder()
          .setTitle('Live Feed - Lista harmonogramów')
          .setColor('#3498db')
          .setDescription(`Znaleziono ${feeds.length} harmonogramów na tym serwerze:`)
          .setTimestamp();
        
        // Dodaj informacje o każdym harmonogramie
        feeds.forEach((feed, index) => {
          const scheduleText = formatSchedule(feed.schedule);
          const statusText = feed.isActive ? '✅ Aktywny' : '⏸️ Wstrzymany';
          
          embed.addFields({
            name: `${index + 1}. ${feed.name} (${statusText})`,
            value: `ID: \`${feed._id}\`\nKanał: <#${feed.channelId}>\nHarmonogram: ${scheduleText}\nOstatnie uruchomienie: ${feed.lastRun ? `<t:${Math.floor(feed.lastRun.getTime() / 1000)}:R>` : 'Nigdy'}`
          });
        });
        
        await interaction.editReply({ embeds: [embed] });
      }
      
      // Pokaż szczegóły harmonogramu
      else if (subcommand === 'info') {
        const feedId = interaction.options.getString('id');
        
        await interaction.deferReply();
        
        // Pobierz feed
        const feed = await client.liveFeedManager.getFeed(feedId);
        
        if (!feed) {
          return interaction.editReply(`Nie znaleziono harmonogramu o ID \`${feedId}\`.`);
        }
        
        // Sprawdź czy feed należy do tego serwera
        if (feed.guildId !== interaction.guild.id) {
          return interaction.editReply('Ten harmonogram nie należy do tego serwera.');
        }
        
        // Przygotuj informację o harmonogramie
        const scheduleText = formatSchedule(feed.schedule);
        const statusText = feed.isActive ? '✅ Aktywny' : '⏸️ Wstrzymany';
        
        // Pobierz informacje o twórcy
        let creatorInfo = 'Nieznany';
        try {
          const creator = await interaction.client.users.fetch(feed.createdBy);
          creatorInfo = `${creator.tag} (${feed.createdBy})`;
        } catch (error) {
          creatorInfo = `Nieznany (${feed.createdBy})`;
        }
        
        // Odpowiedź
        const embed = new EmbedBuilder()
          .setTitle(`Live Feed - ${feed.name}`)
          .setColor(feed.embed ? feed.embedColor : '#3498db')
          .setDescription(`Status: ${statusText}`)
          .addFields(
            { name: 'ID', value: feed._id.toString() },
            { name: 'Kanał', value: `<#${feed.channelId}>` },
            { name: 'Harmonogram', value: scheduleText },
            { name: 'Wiadomość', value: feed.message.length > 1024 ? feed.message.substring(0, 1021) + '...' : feed.message },
            { name: 'Format', value: feed.embed ? `Embed (kolor: ${feed.embedColor})` : 'Zwykła wiadomość' },
            { name: 'Utworzony przez', value: creatorInfo },
            { name: 'Utworzony', value: `<t:${Math.floor(feed.createdAt.getTime() / 1000)}:F>` },
            { name: 'Ostatnie uruchomienie', value: feed.lastRun ? `<t:${Math.floor(feed.lastRun.getTime() / 1000)}:R>` : 'Nigdy' },
            { name: 'Następne uruchomienie', value: feed.nextRun ? `<t:${Math.floor(feed.nextRun.getTime() / 1000)}:R>` : 'Nieznane' }
          )
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
      }
      
      // Edytuj istniejący harmonogram
      else if (subcommand === 'edit') {
        const feedId = interaction.options.getString('id');
        
        await interaction.deferReply();
        
        // Pobierz feed
        const feed = await client.liveFeedManager.getFeed(feedId);
        
        if (!feed) {
          return interaction.editReply(`Nie znaleziono harmonogramu o ID \`${feedId}\`.`);
        }
        
        // Sprawdź czy feed należy do tego serwera
        if (feed.guildId !== interaction.guild.id) {
          return interaction.editReply('Ten harmonogram nie należy do tego serwera.');
        }
        
        // Pobierz wartości do aktualizacji
        const updateData = {};
        
        // Kanał
        const channel = interaction.options.getChannel('channel');
        if (channel) {
          // Sprawdź czy kanał jest tekstowy
          if (channel.type !== 0) { // 0 = kanał tekstowy
            return interaction.editReply('Live Feed można ustawić tylko dla kanału tekstowego!');
          }
          updateData.channelId = channel.id;
        }
        
        // Nazwa
        const name = interaction.options.getString('name');
        if (name) updateData.name = name;
        
        // Wiadomość
        const message = interaction.options.getString('message');
        if (message) updateData.message = message;
        
        // Parametry harmonogramu
        const schedule = {};
        let hasScheduleChanges = false;
        
        const minute = interaction.options.getString('minute');
        if (minute !== null) {
          if (!validateCronValue(minute, 0, 59)) {
            return interaction.editReply('Nieprawidłowa wartość minuty (0-59)');
          }
          schedule.minute = minute;
          hasScheduleChanges = true;
        }
        
        const hour = interaction.options.getString('hour');
        if (hour !== null) {
          if (!validateCronValue(hour, 0, 23)) {
            return interaction.editReply('Nieprawidłowa wartość godziny (0-23)');
          }
          schedule.hour = hour;
          hasScheduleChanges = true;
        }
        
        const day = interaction.options.getString('day');
        if (day !== null) {
          if (!validateCronValue(day, 1, 31)) {
            return interaction.editReply('Nieprawidłowa wartość dnia miesiąca (1-31)');
          }
          schedule.dayOfMonth = day;
          hasScheduleChanges = true;
        }
        
        const month = interaction.options.getString('month');
        if (month !== null) {
          if (!validateCronValue(month, 1, 12)) {
            return interaction.editReply('Nieprawidłowa wartość miesiąca (1-12)');
          }
          schedule.month = month;
          hasScheduleChanges = true;
        }
        
        const weekday = interaction.options.getString('weekday');
        if (weekday !== null) {
          if (!validateCronValue(weekday, 0, 6)) {
            return interaction.editReply('Nieprawidłowa wartość dnia tygodnia (0-6, gdzie 0=niedziela)');
          }
          schedule.dayOfWeek = weekday;
          hasScheduleChanges = true;
        }
        
        if (hasScheduleChanges) {
          updateData.schedule = schedule;
        }
        
        // Embed
        const embed = interaction.options.getBoolean('embed');
        if (embed !== null) updateData.embed = embed;
        
        // Kolor
        const color = interaction.options.getString('color');
        if (color) updateData.embedColor = color;
        
        // Sprawdź czy są jakieś zmiany
        if (Object.keys(updateData).length === 0) {
          return interaction.editReply('Nie wprowadzono żadnych zmian do harmonogramu.');
        }
        
        // Aktualizuj feed
        const updatedFeed = await client.liveFeedManager.updateFeed(feedId, updateData);
        
        // Przygotuj informację o harmonogramie
        const scheduleText = formatSchedule(updatedFeed.schedule);
        
        // Odpowiedź
        const embed = new EmbedBuilder()
          .setTitle('Live Feed został zaktualizowany')
          .setColor('#f39c12')
          .setDescription(`Harmonogram "${updatedFeed.name}" został pomyślnie zaktualizowany!`)
          .addFields(
            { name: 'ID', value: updatedFeed._id.toString() },
            { name: 'Kanał', value: `<#${updatedFeed.channelId}>` },
            { name: 'Harmonogram', value: scheduleText },
            { name: 'Format', value: updatedFeed.embed ? `Embed (kolor: ${updatedFeed.embedColor})` : 'Zwykła wiadomość' }
          )
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
      }
      
      // Usuń harmonogram
      else if (subcommand === 'delete') {
        const feedId = interaction.options.getString('id');
        
        await interaction.deferReply();
        
        // Pobierz feed
        const feed = await client.liveFeedManager.getFeed(feedId);
        
        if (!feed) {
          return interaction.editReply(`Nie znaleziono harmonogramu o ID \`${feedId}\`.`);
        }
        
        // Sprawdź czy feed należy do tego serwera
        if (feed.guildId !== interaction.guild.id) {
          return interaction.editReply('Ten harmonogram nie należy do tego serwera.');
        }
        
        // Zapisz dane do odpowiedzi
        const feedName = feed.name;
        
        // Usuń feed
        await client.liveFeedManager.deleteFeed(feedId);
        
        // Odpowiedź
        await interaction.editReply(`Harmonogram **${feedName}** (ID: ${feedId}) został pomyślnie usunięty.`);
      }
      
      // Wstrzymaj harmonogram
      else if (subcommand === 'pause') {
        const feedId = interaction.options.getString('id');
        
        await interaction.deferReply();
        
        // Pobierz feed
        const feed = await client.liveFeedManager.getFeed(feedId);
        
        if (!feed) {
          return interaction.editReply(`Nie znaleziono harmonogramu o ID \`${feedId}\`.`);
        }
        
        // Sprawdź czy feed należy do tego serwera
        if (feed.guildId !== interaction.guild.id) {
          return interaction.editReply('Ten harmonogram nie należy do tego serwera.');
        }
        
        // Sprawdź czy feed nie jest już wstrzymany
        if (!feed.isActive) {
          return interaction.editReply(`Harmonogram "${feed.name}" jest już wstrzymany.`);
        }
        
        // Wstrzymaj feed
        await client.liveFeedManager.updateFeed(feedId, { isActive: false });
        
        // Odpowiedź
        await interaction.editReply(`Harmonogram **${feed.name}** (ID: ${feedId}) został wstrzymany.`);
      }
      
      // Wznów harmonogram
      else if (subcommand === 'resume') {
        const feedId = interaction.options.getString('id');
        
        await interaction.deferReply();
        
        // Pobierz feed
        const feed = await client.liveFeedManager.getFeed(feedId);
        
        if (!feed) {
          return interaction.editReply(`Nie znaleziono harmonogramu o ID \`${feedId}\`.`);
        }
        
        // Sprawdź czy feed należy do tego serwera
        if (feed.guildId !== interaction.guild.id) {
          return interaction.editReply('Ten harmonogram nie należy do tego serwera.');
        }
        
        // Sprawdź czy feed nie jest już aktywny
        if (feed.isActive) {
          return interaction.editReply(`Harmonogram "${feed.name}" jest już aktywny.`);
        }
        
        // Wznów feed
        await client.liveFeedManager.updateFeed(feedId, { isActive: true });
        
        // Odpowiedź
        await interaction.editReply(`Harmonogram **${feed.name}** (ID: ${feedId}) został wznowiony.`);
      }
      
      // Testuj harmonogram
      else if (subcommand === 'test') {
        const feedId = interaction.options.getString('id');
        
        await interaction.deferReply();
        
        // Pobierz feed
        const feed = await client.liveFeedManager.getFeed(feedId);
        
        if (!feed) {
          return interaction.editReply(`Nie znaleziono harmonogramu o ID \`${feedId}\`.`);
        }
        
        // Sprawdź czy feed należy do tego serwera
        if (feed.guildId !== interaction.guild.id) {
          return interaction.editReply('Ten harmonogram nie należy do tego serwera.');
        }
        
        // Wykonaj feed
        await client.liveFeedManager.executeFeed(feed);
        
        // Odpowiedź
        await interaction.editReply(`Testowa wiadomość z harmonogramu **${feed.name}** została wysłana do kanału <#${feed.channelId}>.`);
      }
    } catch (error) {
      logger.error(`Błąd podczas wykonywania komendy livefeed: ${error.stack}`);
      
      if (interaction.deferred) {
        await interaction.editReply({
          content: `Wystąpił błąd podczas wykonywania komendy: ${error.message}`,
          ephemeral: true
        }).catch(console.error);
      } else {
        await interaction.reply({
          content: `Wystąpił błąd podczas wykonywania komendy: ${error.message}`,
          ephemeral: true
        }).catch(console.error);
      }
    }
  }
};

// Funkcje pomocnicze

// Walidacja wartości harmonogramu
function validateCronValue(value, min, max) {
  // Dla gwiazdki (każda wartość)
  if (value === '*') return true;
  
  // Dla wielu wartości oddzielonych przecinkiem
  if (value.includes(',')) {
    const parts = value.split(',').map(p => p.trim());
    return parts.every(part => {
      const num = parseInt(part);
      return !isNaN(num) && num >= min && num <= max;
    });
  }
  
  // Dla pojedynczej wartości
  const num = parseInt(value);
  return !isNaN(num) && num >= min && num <= max;
}

// Formatowanie harmonogramu do czytelnej postaci
function formatSchedule(schedule) {
  const minute = formatCronPart(schedule.minute, 'minuta', 'minuty', 'minut');
  const hour = formatCronPart(schedule.hour, 'godzina', 'godziny', 'godzin');
  const day = formatCronPart(schedule.dayOfMonth, 'dzień', 'dni', 'dni');
  const month = formatCronPart(schedule.month, 'miesiąc', 'miesiące', 'miesięcy');
  const weekday = formatCronPart(schedule.dayOfWeek, 'dzień tygodnia', 'dni tygodnia', 'dni tygodnia', true);
  
  return `${minute}, ${hour}, ${day}, ${month}, ${weekday}`;
}

// Formatowanie części harmonogramu
function formatCronPart(value, singular, plural1, plural2, isWeekday = false) {
  if (value === '*') {
    return `Każdy ${singular}`;
  }
  
  const values = value.split(',').map(v => v.trim());
  
  if (isWeekday) {
    // Przekształć numery dni tygodnia na nazwy
    const weekdays = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
    const namedValues = values.map(v => weekdays[parseInt(v)]);
    
    if (namedValues.length === 1) {
      return `Co ${namedValues[0]}`;
    } else {
      return `W dniach: ${namedValues.join(', ')}`;
    }
  } else {
    if (values.length === 1) {
      return `Co ${values[0]} (${singular})`;
    } else {
      return `W ${plural1}: ${values.join(', ')}`;
    }
  }
}