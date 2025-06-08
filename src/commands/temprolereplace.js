// src/commands/temprolereplace.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const TempRoleReplace = require('../models/TempRoleReplace');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('temprolereplace')
    .setDescription('Zarządza rolami czasowymi z automatyczną zamianą na inne role')
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator | 
      PermissionFlagsBits.ManageGuild | 
      PermissionFlagsBits.ManageRoles | 
      PermissionFlagsBits.ManageMessages
  )
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Przyznaje rolę czasową z automatyczną zamianą na inną po wygaśnięciu')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Użytkownik, któremu chcesz przyznać rolę')
            .setRequired(true))
        .addRoleOption(option =>
          option.setName('temprole')
            .setDescription('Rola czasowa do przyznania')
            .setRequired(true))
        .addRoleOption(option =>
          option.setName('finalrole')
            .setDescription('Rola, która zostanie przyznana po wygaśnięciu roli czasowej')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('duration')
            .setDescription('Czas trwania roli czasowej (np. 7d, 24h, 30m)')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('reason')
            .setDescription('Powód przyznania roli'))
        .addBooleanOption(option =>
          option.setName('remove_temp')
            .setDescription('Czy usunąć rolę czasową po zamianie (domyślnie: tak)')))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Usuwa rolę czasową z automatyczną zamianą')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Użytkownik')
            .setRequired(true))
        .addRoleOption(option =>
          option.setName('temprole')
            .setDescription('Rola czasowa do usunięcia')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Wyświetla listę ról czasowych z automatyczną zamianą')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Użytkownik (opcjonalnie - bez tego pokazuje wszystkich)'))),

  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      
      if (subcommand === 'add') {
        const user = interaction.options.getUser('user');
        const member = interaction.options.getMember('user');
        const tempRole = interaction.options.getRole('temprole');
        const finalRole = interaction.options.getRole('finalrole');
        const durationStr = interaction.options.getString('duration');
        const reason = interaction.options.getString('reason') || 'Nie podano powodu';
        const removeTemp = interaction.options.getBoolean('remove_temp') ?? true;
        
        if (!member) {
          return interaction.reply({
            content: `Użytkownik ${user.tag} nie jest obecnie na serwerze.`,
            ephemeral: true
          });
        }
        
        // Sprawdź role
        if (!tempRole || !finalRole) {
          return interaction.reply({
            content: 'Nie znaleziono jednej z podanych ról.',
            ephemeral: true
          });
        }
        
        if (tempRole.id === finalRole.id) {
          return interaction.reply({
            content: 'Rola czasowa i końcowa nie mogą być takie same.',
            ephemeral: true
          });
        }
        
        // Sprawdź uprawnienia
        const botMember = interaction.guild.members.me;
        if (tempRole.position >= botMember.roles.highest.position || 
            finalRole.position >= botMember.roles.highest.position) {
          return interaction.reply({
            content: 'Nie mogę zarządzać jedną z tych ról - są wyższe niż moja najwyższa rola.',
            ephemeral: true
          });
        }
        
        if (tempRole.position >= interaction.member.roles.highest.position || 
            finalRole.position >= interaction.member.roles.highest.position) {
          return interaction.reply({
            content: 'Nie możesz zarządzać jedną z tych ról - są wyższe niż twoja najwyższa rola.',
            ephemeral: true
          });
        }
        
        // Parsuj czas trwania
        const { milliseconds, text } = parseDuration(durationStr);
        
        if (milliseconds <= 0) {
          return interaction.reply({
            content: 'Nieprawidłowy format czasu trwania. Użyj formatu jak "1d", "12h", "30m" lub "60s".',
            ephemeral: true
          });
        }
        
        // Sprawdź czy użytkownik już ma taką rolę czasową
        const existing = await TempRoleReplace.findOne({
          guildId: interaction.guild.id,
          userId: user.id,
          tempRoleId: tempRole.id
        });
        
        if (existing) {
          return interaction.reply({
            content: `Użytkownik ${user.tag} już ma przypisaną tę rolę czasową z automatyczną zamianą.`,
            ephemeral: true
          });
        }
        
        // Oblicz datę wygaśnięcia
        const expiresAt = new Date(Date.now() + milliseconds);
        
        // Dodaj rolę czasową użytkownikowi
        await member.roles.add(tempRole.id, `Rola czasowa z zamianą: ${reason}`);
        
        // Usuń rolę końcową jeśli ją ma (żeby nie było konfliktu)
        if (member.roles.cache.has(finalRole.id)) {
          await member.roles.remove(finalRole.id, 'Usunięto przed przyznaniem roli czasowej');
        }
        
        // Zapisz w bazie danych
        const tempRoleDoc = await TempRoleReplace.create({
          guildId: interaction.guild.id,
          userId: user.id,
          tempRoleId: tempRole.id,
          finalRoleId: finalRole.id,
          addedAt: new Date(),
          expiresAt: expiresAt,
          addedBy: interaction.user.id,
          reason: reason,
          removeTempRole: removeTemp
        });
        
        // Przygotuj embed
        const embed = new EmbedBuilder()
          .setTitle('✅ Przyznano rolę czasową z automatyczną zamianą')
          .setColor(tempRole.color || 0x3498db)
          .setDescription(`Użytkownikowi ${user.tag} przyznano rolę czasową z automatyczną zamianą.`)
          .addFields(
            { name: 'Użytkownik', value: `${user.tag} (${user.id})` },
            { name: 'Rola czasowa', value: `${tempRole.name} (${tempRole.id})` },
            { name: 'Rola końcowa', value: `${finalRole.name} (${finalRole.id})` },
            { name: 'Czas trwania', value: text },
            { name: 'Zamiana nastąpi', value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>` },
            { name: 'Usunąć rolę czasową?', value: removeTemp ? 'Tak' : 'Nie' },
            { name: 'Powód', value: reason },
            { name: 'ID w bazie', value: tempRoleDoc._id.toString() }
          )
          .setThumbnail(user.displayAvatarURL({ dynamic: true }))
          .setTimestamp()
          .setFooter({ text: `Przyznane przez: ${interaction.user.tag}` });
        
        logger.info(`✅ Dodano rolę czasową z zamianą: ${tempRole.name} → ${finalRole.name} dla ${user.tag} na ${text}`);
        
        return interaction.reply({ embeds: [embed] });
      }
      
      if (subcommand === 'remove') {
        const user = interaction.options.getUser('user');
        const member = interaction.options.getMember('user');
        const tempRole = interaction.options.getRole('temprole');
        
        // Znajdź w bazie danych
        const tempRoleDoc = await TempRoleReplace.findOne({
          guildId: interaction.guild.id,
          userId: user.id,
          tempRoleId: tempRole.id
        });
        
        if (!tempRoleDoc) {
          return interaction.reply({
            content: `Użytkownik ${user.tag} nie ma przypisanej tej roli czasowej z automatyczną zamianą.`,
            ephemeral: true
          });
        }
        
        // Usuń z bazy danych
        await TempRoleReplace.deleteOne({ _id: tempRoleDoc._id });
        
        // Usuń rolę czasową jeśli użytkownik ją ma
        if (member && member.roles.cache.has(tempRole.id)) {
          await member.roles.remove(tempRole.id, 'Usunięto rolę czasową z automatyczną zamianą');
        }
        
        logger.info(`🗑️ Usunięto rolę czasową z zamianą ${tempRole.name} dla ${user.tag}`);
        
        return interaction.reply({
          content: `✅ Usunięto rolę czasową ${tempRole.name} z automatyczną zamianą dla użytkownika ${user.tag}.`,
          ephemeral: true
        });
      }
      
      if (subcommand === 'list') {
        const user = interaction.options.getUser('user');
        
        await interaction.deferReply({ ephemeral: true });
        
        // Przygotuj zapytanie
        const query = { guildId: interaction.guild.id };
        if (user) {
          query.userId = user.id;
        }
        
        const tempRoles = await TempRoleReplace.find(query).sort({ expiresAt: 1 });
        
        if (tempRoles.length === 0) {
          const message = user 
            ? `Użytkownik ${user.tag} nie ma ról czasowych z automatyczną zamianą.`
            : 'Na tym serwerze nie ma ról czasowych z automatyczną zamianą.';
          return interaction.editReply(message);
        }
        
        const embed = new EmbedBuilder()
          .setTitle(`📋 Role czasowe z automatyczną zamianą ${user ? `- ${user.tag}` : ''}`)
          .setColor(0x3498db)
          .setTimestamp();
        
        if (user) {
          embed.setThumbnail(user.displayAvatarURL({ dynamic: true }));
        }
        
        const now = new Date();
        
        // Dodaj informacje o każdej roli (maksymalnie 10)
        for (let i = 0; i < Math.min(tempRoles.length, 10); i++) {
          const tempRoleDoc = tempRoles[i];
          const tempRole = interaction.guild.roles.cache.get(tempRoleDoc.tempRoleId);
          const finalRole = interaction.guild.roles.cache.get(tempRoleDoc.finalRoleId);
          const targetUser = user || await interaction.client.users.fetch(tempRoleDoc.userId).catch(() => null);
          
          const tempRoleName = tempRole ? tempRole.name : `Nieznana (${tempRoleDoc.tempRoleId})`;
          const finalRoleName = finalRole ? finalRole.name : `Nieznana (${tempRoleDoc.finalRoleId})`;
          const userName = targetUser ? targetUser.tag : `Nieznany (${tempRoleDoc.userId})`;
          
          const isExpired = tempRoleDoc.expiresAt <= now;
          const timeInfo = isExpired 
            ? `🔴 **WYGASŁA** <t:${Math.floor(tempRoleDoc.expiresAt.getTime() / 1000)}:R>`
            : `🟢 Zamiana <t:${Math.floor(tempRoleDoc.expiresAt.getTime() / 1000)}:R>`;
          
          embed.addFields({
            name: `${isExpired ? '🔴' : '🟢'} ${user ? '' : `${userName} - `}${tempRoleName} → ${finalRoleName}`,
            value: `${timeInfo}\nUsunąć rolę czasową: ${tempRoleDoc.removeTempRole ? 'Tak' : 'Nie'}\nPowód: ${tempRoleDoc.reason}\nID: \`${tempRoleDoc._id}\``
          });
        }
        
        if (tempRoles.length > 10) {
          embed.addFields({
            name: 'ℹ️ Uwaga',
            value: `Pokazano tylko 10 z ${tempRoles.length} ról czasowych`
          });
        }
        
        return interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      logger.error(`Błąd podczas wykonywania komendy temprolereplace: ${error.stack}`);
      
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