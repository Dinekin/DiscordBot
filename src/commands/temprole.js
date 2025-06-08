// src/commands/temprole.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const TempRole = require('../models/TempRole');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('temprole')
    .setDescription('Zarządza rolami czasowymi użytkowników')
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator | 
      PermissionFlagsBits.ManageGuild | 
      PermissionFlagsBits.ManageRoles | 
      PermissionFlagsBits.ManageMessages
  )
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Przyznaje użytkownikowi rolę na określony czas')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Użytkownik, któremu chcesz przyznać rolę')
            .setRequired(true))
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('Rola do przyznania')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('duration')
            .setDescription('Czas trwania (np. 7d, 24h, 30m)')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('reason')
            .setDescription('Powód przyznania roli')))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Usuwa rolę czasową użytkownika')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Użytkownik, któremu chcesz usunąć rolę')
            .setRequired(true))
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('Rola do usunięcia')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Wyświetla listę ról czasowych użytkownika')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Użytkownik, którego role chcesz zobaczyć')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('check')
        .setDescription('Sprawdza i usuwa wygasłe role (tylko dla administratorów)'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('debug')
        .setDescription('Informacje debugowania systemu ról czasowych (tylko administratorzy)')),

  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      
      if (subcommand === 'add') {
        const user = interaction.options.getUser('user');
        const member = interaction.options.getMember('user');
        const role = interaction.options.getRole('role');
        const durationStr = interaction.options.getString('duration');
        const reason = interaction.options.getString('reason') || 'Nie podano powodu';
        
        if (!member) {
          return interaction.reply({
            content: `Użytkownik ${user.tag} nie jest obecnie na serwerze.`,
            ephemeral: true
          });
        }
        
        if (!role) {
          return interaction.reply({
            content: 'Nie znaleziono podanej roli.',
            ephemeral: true
          });
        }
        
        // Sprawdź, czy rola może być przyznana
        if (role.managed || role.position >= interaction.member.roles.highest.position) {
          return interaction.reply({
            content: 'Nie możesz przyznać tej roli. Sprawdź, czy rola nie jest zarządzana lub wyższa od twojej najwyższej roli.',
            ephemeral: true
          });
        }
        
        // Sprawdź czy bot może zarządzać tą rolą
        const botMember = interaction.guild.members.me;
        if (role.position >= botMember.roles.highest.position) {
          return interaction.reply({
            content: 'Nie mogę zarządzać tą rolą, ponieważ jest wyższa niż moja najwyższa rola.',
            ephemeral: true
          });
        }
        
        // Parsuj czas trwania
        const { milliseconds, text } = parseDuration(durationStr);
        
        if (milliseconds <= 0) {
          return interaction.reply({
            content: 'Nieprawidłowy format czasu trwania. Użyj formatu takiego jak "1d", "12h", "30m" lub "60s".',
            ephemeral: true
          });
        }
        
        // Sprawdź czy użytkownik już ma tę rolę czasową
        const existingTempRole = await TempRole.findOne({
          guildId: interaction.guild.id,
          userId: user.id,
          roleId: role.id
        });
        
        if (existingTempRole) {
          return interaction.reply({
            content: `Użytkownik ${user.tag} już posiada tę rolę czasową. Usuń ją najpierw, jeśli chcesz ją przedłużyć.`,
            ephemeral: true
          });
        }
        
        // Oblicz datę wygaśnięcia
        const expiresAt = new Date(Date.now() + milliseconds);
        
        // Dodaj rolę użytkownikowi
        await member.roles.add(role.id, `Rola czasowa: ${reason} (wygasa: ${expiresAt.toISOString()})`);
        
        // Zapisz informacje o roli czasowej w bazie danych
        const tempRoleDoc = await TempRole.create({
          guildId: interaction.guild.id,
          userId: user.id,
          roleId: role.id,
          addedAt: new Date(),
          expiresAt: expiresAt,
          addedBy: interaction.user.id,
          reason: reason
        });
        
        // Przygotuj embed z informacjami
        const embed = new EmbedBuilder()
          .setTitle('✅ Przyznano rolę czasową')
          .setColor(role.color || 0x3498db)
          .setDescription(`Użytkownikowi ${user.tag} przyznano rolę **${role.name}** na czas określony.`)
          .addFields(
            { name: 'Użytkownik', value: `${user.tag} (${user.id})` },
            { name: 'Rola', value: `${role.name} (${role.id})` },
            { name: 'Czas trwania', value: text },
            { name: 'Wygaśnie', value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>` },
            { name: 'Powód', value: reason },
            { name: 'ID w bazie', value: tempRoleDoc._id.toString() }
          )
          .setThumbnail(user.displayAvatarURL({ dynamic: true }))
          .setTimestamp()
          .setFooter({ text: `Przyznane przez: ${interaction.user.tag}` });
        
        logger.info(`✅ Dodano rolę czasową ${role.name} użytkownikowi ${user.tag} na ${text} (wygasa: ${expiresAt.toISOString()}) - ID: ${tempRoleDoc._id}`);
        
        return interaction.reply({ embeds: [embed] });
      }
      
      if (subcommand === 'remove') {
        const user = interaction.options.getUser('user');
        const member = interaction.options.getMember('user');
        const role = interaction.options.getRole('role');
        
        // Sprawdź, czy istnieje taka rola czasowa
        const tempRole = await TempRole.findOne({
          guildId: interaction.guild.id,
          userId: user.id,
          roleId: role.id
        });
        
        if (!tempRole) {
          return interaction.reply({
            content: `Użytkownik ${user.tag} nie ma przypisanej roli czasowej ${role.name}.`,
            ephemeral: true
          });
        }
        
        // Usuń rolę z bazy danych
        await TempRole.deleteOne({
          guildId: interaction.guild.id,
          userId: user.id,
          roleId: role.id
        });
        
        // Jeśli użytkownik jest na serwerze, usuń mu również rolę
        if (member && member.roles.cache.has(role.id)) {
          await member.roles.remove(role.id, 'Usunięto rolę czasową');
        }
        
        logger.info(`🗑️ Usunięto rolę czasową ${role.name} użytkownikowi ${user.tag}`);
        
        return interaction.reply({
          content: `✅ Pomyślnie usunięto rolę czasową ${role.name} użytkownikowi ${user.tag}.`,
          ephemeral: true
        });
      }
      
      if (subcommand === 'list') {
        const user = interaction.options.getUser('user');
        
        // Pobierz wszystkie role czasowe użytkownika
        const tempRoles = await TempRole.find({
          guildId: interaction.guild.id,
          userId: user.id
        });
        
        if (tempRoles.length === 0) {
          return interaction.reply({
            content: `Użytkownik ${user.tag} nie ma przypisanych ról czasowych.`,
            ephemeral: true
          });
        }
        
        // Przygotuj embed z listą ról
        const embed = new EmbedBuilder()
          .setTitle(`📋 Role czasowe użytkownika ${user.tag}`)
          .setColor(0x3498db)
          .setThumbnail(user.displayAvatarURL({ dynamic: true }))
          .setTimestamp();
        
        // Dodaj informacje o każdej roli
        for (const tempRole of tempRoles) {
          const role = interaction.guild.roles.cache.get(tempRole.roleId);
          const roleName = role ? role.name : `Nieznana rola (${tempRole.roleId})`;
          const addedBy = await interaction.client.users.fetch(tempRole.addedBy).catch(() => null);
          
          const now = new Date();
          const timeLeft = tempRole.expiresAt - now;
          const isExpired = timeLeft <= 0;
          
          embed.addFields({
            name: `${isExpired ? '🔴' : '🟢'} ${roleName}`,
            value: `${isExpired ? '**WYGASŁA**' : `Wygasa: <t:${Math.floor(tempRole.expiresAt.getTime() / 1000)}:R>`}\nPowód: ${tempRole.reason}\nDodane przez: ${addedBy ? addedBy.tag : 'Nieznany użytkownik'}\nID: \`${tempRole._id}\``
          });
        }
        
        return interaction.reply({ embeds: [embed] });
      }
      
      if (subcommand === 'check') {
        // Tylko administratorzy mogą ręcznie sprawdzać wygasłe role
        if (!interaction.member.permissions.has('Administrator')) {
          return interaction.reply({
            content: 'Tylko administratorzy mogą używać tej komendy.',
            ephemeral: true
          });
        }
        
        await interaction.deferReply({ ephemeral: true });
        
        // Importuj i wykonaj funkcję sprawdzania wygasłych ról
        const { checkExpiredRoles } = require('../utils/checkExpiredRoles');
        const result = await checkExpiredRoles(interaction.client);
        
        return interaction.editReply({
          content: `✅ Sprawdzono role czasowe.\n📊 Przetworzono: ${result.processed}\n🗑️ Usunięto: ${result.removed}\n❌ Błędów: ${result.errors}`,
          ephemeral: true
        });
      }
      
      if (subcommand === 'debug') {
        // Tylko administratorzy mogą używać debugowania
        if (!interaction.member.permissions.has('Administrator')) {
          return interaction.reply({
            content: 'Tylko administratorzy mogą używać tej komendy.',
            ephemeral: true
          });
        }
        
        await interaction.deferReply({ ephemeral: true });
        
        try {
          // Sprawdź status checker-a
          const { getExpiredRoleCheckerStatus } = require('../utils/checkExpiredRoles');
          const checkerStatus = getExpiredRoleCheckerStatus();
          
          // Sprawdź ile jest wygasłych ról w bazie
          const now = new Date();
          const expiredCount = await TempRole.countDocuments({
            expiresAt: { $lte: now }
          });
          
          // Sprawdź wszystkie role czasowe na tym serwerze
          const allTempRoles = await TempRole.find({
            guildId: interaction.guild.id
          }).sort({ expiresAt: 1 });
          
          // Sprawdź role czasowe dla wszystkich serwerów
          const totalTempRoles = await TempRole.countDocuments();
          
          const embed = new EmbedBuilder()
            .setTitle('🔧 Debug - System Ról Czasowych')
            .setColor(0xe74c3c)
            .addFields(
              { 
                name: '⚙️ Status Checker-a', 
                value: checkerStatus.isRunning ? '🟢 Działa' : '🔴 Nie działa',
                inline: true
              },
              { 
                name: '📊 Wygasłe role (globalne)', 
                value: expiredCount.toString(),
                inline: true
              },
              { 
                name: '📋 Role czasowe (ten serwer)', 
                value: allTempRoles.length.toString(),
                inline: true
              },
              { 
                name: '🌍 Role czasowe (wszystkie serwery)', 
                value: totalTempRoles.toString(),
                inline: true
              },
              { 
                name: '🕐 Obecny czas', 
                value: `<t:${Math.floor(now.getTime() / 1000)}:F>`,
                inline: true
              },
              { 
                name: '🆔 Interval ID', 
                value: checkerStatus.intervalId ? checkerStatus.intervalId.toString() : 'Brak',
                inline: true
              }
            )
            .setTimestamp();
          
          // Dodaj informacje o rolach czasowych na tym serwerze
          if (allTempRoles.length > 0) {
            const rolesInfo = allTempRoles.slice(0, 5).map((tempRole, index) => {
              const isExpired = tempRole.expiresAt <= now;
              const timeInfo = isExpired 
                ? `🔴 Wygasła <t:${Math.floor(tempRole.expiresAt.getTime() / 1000)}:R>`
                : `🟢 Wygasa <t:${Math.floor(tempRole.expiresAt.getTime() / 1000)}:R>`;
              
              return `${index + 1}. <@${tempRole.userId}> - <@&${tempRole.roleId}>\n${timeInfo}\nID: \`${tempRole._id}\``;
            }).join('\n\n');
            
            embed.addFields({
              name: `📋 Role czasowe na tym serwerze (${Math.min(allTempRoles.length, 5)}/${allTempRoles.length})`,
              value: rolesInfo || 'Brak'
            });
            
            if (allTempRoles.length > 5) {
              embed.addFields({
                name: 'ℹ️ Uwaga',
                value: `Pokazano tylko 5 z ${allTempRoles.length} ról czasowych`
              });
            }
          }
          
          // Dodaj przycisk do manualnego sprawdzenia
          embed.addFields({
            name: '🔧 Akcje debugowania',
            value: 'Użyj `/temprole check` aby ręcznie sprawdzić i usunąć wygasłe role'
          });
          
          await interaction.editReply({ embeds: [embed] });
          
        } catch (error) {
          logger.error(`Błąd podczas debugowania ról czasowych: ${error.stack}`);
          await interaction.editReply({
            content: `Wystąpił błąd podczas debugowania: ${error.message}`,
            ephemeral: true
          });
        }
      }
    } catch (error) {
      logger.error(`Błąd podczas wykonywania komendy temprole: ${error.stack}`);
      
      return interaction.reply({
        content: `Wystąpił błąd podczas wykonywania komendy: ${error.message}`,
        ephemeral: true
      });
    }
  }
};

// Funkcja pomocnicza do przetwarzania czasu trwania
function parseDuration(durationStr) {
  const durationRegex = /^(\d+)(d|h|m|s)$/i;
  const match = durationRegex.exec(durationStr);
  
  if (!match) return { milliseconds: 0, text: '' };
  
  const amount = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  
  let milliseconds = 0;
  let text = '';
  
  switch (unit) {
    case 'd':
      milliseconds = amount * 24 * 60 * 60 * 1000;
      text = `${amount} ${amount === 1 ? 'dzień' : 'dni'}`;
      break;
    case 'h':
      milliseconds = amount * 60 * 60 * 1000;
      text = `${amount} ${amount === 1 ? 'godzina' : (amount < 5 ? 'godziny' : 'godzin')}`;
      break;
    case 'm':
      milliseconds = amount * 60 * 1000;
      text = `${amount} ${amount === 1 ? 'minuta' : (amount < 5 ? 'minuty' : 'minut')}`;
      break;
    case 's':
      milliseconds = amount * 1000;
      text = `${amount} ${amount === 1 ? 'sekunda' : (amount < 5 ? 'sekundy' : 'sekund')}`;
      break;
  }
  
  return { milliseconds, text };
}