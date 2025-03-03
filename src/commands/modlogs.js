// Dodaj ten plik jako src/commands/modlogs.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const MessageLog = require('../models/MessageLog');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('modlogs')
    .setDescription('Wyświetla logi moderacyjne użytkownika')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Użytkownik, którego logi chcesz zobaczyć')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('limit')
        .setDescription('Liczba logów do wyświetlenia (domyślnie: 5)')
        .setMinValue(1)
        .setMaxValue(25))
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Typ akcji moderacyjnej')
        .addChoices(
          { name: 'Wszystkie', value: 'all' },
          { name: 'Bany', value: 'ban' },
          { name: 'Kicki', value: 'kick' },
          { name: 'Timeouty', value: 'timeout' },
          { name: 'Zmiany pseudonimu', value: 'nickname' },
          { name: 'Zmiany ról', value: 'role' }
        )),

  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      const user = interaction.options.getUser('user');
      const limit = interaction.options.getInteger('limit') || 5;
      const type = interaction.options.getString('type') || 'all';
      
      // Przygotuj zapytanie do bazy danych
      let query = {
        guildId: interaction.guild.id
      };
      
      // Filtruj według typu akcji moderacyjnej
      if (type === 'all') {
        // Pobierz wszystkie typy akcji moderacyjnych związane z użytkownikiem
        query.$or = [
          { 'modActions.targetId': user.id },
          { 'nicknameChanges.userId': user.id },
          { 'roleChanges.userId': user.id }
        ];
      } else if (type === 'ban') {
        query['modActions.targetId'] = user.id;
        query['modActions.type'] = { $in: ['ban', 'unban'] };
      } else if (type === 'kick') {
        query['modActions.targetId'] = user.id;
        query['modActions.type'] = 'kick';
      } else if (type === 'timeout') {
        query['modActions.targetId'] = user.id;
        query['modActions.type'] = { $in: ['timeout', 'remove_timeout'] };
      } else if (type === 'nickname') {
        query['nicknameChanges.userId'] = user.id;
      } else if (type === 'role') {
        query['roleChanges.userId'] = user.id;
      }
      
      // Wykonaj zapytanie do bazy danych
      const logs = await MessageLog.find(query)
        .sort({ createdAt: -1 })
        .limit(limit);
      
      if (logs.length === 0) {
        return interaction.editReply(`Nie znaleziono logów moderacyjnych dla użytkownika ${user.tag}.`);
      }
      
      // Przygotuj embed z wynikami
      const embed = new EmbedBuilder()
        .setTitle(`Logi moderacyjne: ${user.tag}`)
        .setColor(0x546E7A)
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: `ID użytkownika: ${user.id}` })
        .setTimestamp();
      
      // Przygotuj listę akcji moderacyjnych
      let actions = [];
      
      // Przetwórz logi i wyciągnij odpowiednie akcje
      for (const log of logs) {
        // Ban/unban/kick/timeout
        if (log.modActions) {
          for (const action of log.modActions) {
            if (action.targetId === user.id && (type === 'all' || type === action.type)) {
              const timestamp = action.createdAt || log.createdAt;
              const relativeTime = `<t:${Math.floor(timestamp.getTime() / 1000)}:R>`;
              
              let actionText = '';
              
              switch (action.type) {
                case 'ban':
                  actionText = `🔨 **Ban** - ${action.reason}`;
                  if (action.duration) {
                    actionText += ` (Czas: ${action.duration})`;
                  }
                  break;
                case 'unban':
                  actionText = `🔓 **Odbanowanie** - ${action.reason}`;
                  break;
                case 'kick':
                  actionText = `👢 **Wyrzucenie** - ${action.reason}`;
                  break;
                case 'timeout':
                  actionText = `🔇 **Wyciszenie** - ${action.reason} (Czas: ${action.duration})`;
                  break;
                case 'remove_timeout':
                  actionText = `🔊 **Zdjęcie wyciszenia** - ${action.reason}`;
                  break;
              }
              
              actionText += ` | Przez: ${action.moderatorTag} | ${relativeTime}`;
              actions.push(actionText);
            }
          }
        }
        
        // Zmiany pseudonimu
        if (log.nicknameChanges && (type === 'all' || type === 'nickname')) {
          for (const change of log.nicknameChanges) {
            if (change.userId === user.id) {
              const timestamp = change.createdAt || log.createdAt;
              const relativeTime = `<t:${Math.floor(timestamp.getTime() / 1000)}:R>`;
              
              const oldNick = change.oldNickname || '*Brak*';
              const newNick = change.newNickname || '*Brak*';
              
              const actionText = `✏️ **Zmiana pseudonimu** - ${oldNick} → ${newNick} | Przez: ${change.changedByTag} | ${relativeTime}`;
              actions.push(actionText);
            }
          }
        }
        
        // Zmiany ról
        if (log.roleChanges && (type === 'all' || type === 'role')) {
          for (const change of log.roleChanges) {
            if (change.userId === user.id) {
              const timestamp = change.createdAt || log.createdAt;
              const relativeTime = `<t:${Math.floor(timestamp.getTime() / 1000)}:R>`;
              
              let actionText = '';
              if (change.type === 'add') {
                actionText = `➕ **Dodanie roli** - ${change.roleName} | Przez: ${change.changedByTag} | ${relativeTime}`;
              } else if (change.type === 'remove') {
                actionText = `➖ **Usunięcie roli** - ${change.roleName} | Przez: ${change.changedByTag} | ${relativeTime}`;
              }
              
              actions.push(actionText);
            }
          }
        }
      }
      
      // Dodaj akcje do embeda jako pola
      if (actions.length > 0) {
        // Jeśli mamy więcej akcji niż 25 (limit Discord), grupujemy je
        if (actions.length <= 25) {
          for (let i = 0; i < actions.length; i++) {
            embed.addFields({ name: `Akcja #${i+1}`, value: actions[i] });
          }
        } else {
          // Grupuj akcje po 10 w polu
          for (let i = 0; i < Math.min(actions.length, 3); i++) {
            const start = i * 10;
            const end = Math.min(start + 10, actions.length);
            const fieldActions = actions.slice(start, end).join('\n\n');
            
            embed.addFields({ name: `Akcje ${start+1}-${end}`, value: fieldActions });
          }
          
          // Jeśli jest więcej akcji niż możemy pokazać
          if (actions.length > 30) {
            embed.addFields({ name: `Pozostałe akcje`, value: `Znaleziono jeszcze ${actions.length - 30} akcji, które nie zostały wyświetlone.` });
          }
        }
      } else {
        embed.setDescription('Nie znaleziono logów moderacyjnych dla tego użytkownika.');
      }
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error(`Błąd podczas wykonywania komendy modlogs: ${error.stack}`);
      return interaction.editReply({
        content: `Wystąpił błąd podczas pobierania logów moderacyjnych: ${error.message}`
      });
    }
  }
};