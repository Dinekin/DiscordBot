const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const Guild = require('../models/Guild');
const UserRole = require('../models/UserRole');
const logger = require('../utils/logger');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    try {
      // Najpierw zapisujemy role użytkownika
      const roles = member.roles.cache
        .filter(role => role.id !== member.guild.id) // Filtruj @everyone
        .map(role => role.id);
      
      // Zapisz role w bazie danych
      if (roles.length > 0) {
        await UserRole.findOneAndUpdate(
          { guildId: member.guild.id, userId: member.id },
          { 
            roles: roles,
            nickname: member.nickname,
            leftAt: new Date()
          },
          { upsert: true, new: true }
        );
        
        logger.info(`Zapisano ${roles.length} ról dla użytkownika ${member.user.tag} (${member.id}) na serwerze ${member.guild.name}`);
      }
      
      // Sprawdź czy funkcja logowania wiadomości jest włączona na serwerze
      const guildSettings = await Guild.findOne({ guildId: member.guild?.id });
      
      // Jeśli nie ma guildSettings lub funkcja nie jest włączona, zakończ
      if (!member.guild || !guildSettings || !guildSettings.modules?.messageLog) return;
      
      // Sprawdź czy kanał logów istnieje
      if (!guildSettings.messageLogChannel) return;
      
      const logChannel = await member.guild.channels.fetch(guildSettings.messageLogChannel).catch(() => null);
      if (!logChannel) return;
      
      // Sprawdź, czy użytkownik został wyrzucony
      let wasKicked = false;
      let kickExecutor = null;
      let kickReason = "Nie podano powodu";
      
      try {
        // Poczekaj chwilę, aby upewnić się, że wpis w dzienniku audytu jest dostępny
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const auditLogs = await member.guild.fetchAuditLogs({
          limit: 1,
          type: AuditLogEvent.MemberKick
        });
        
        const kickLog = auditLogs.entries.first();
        
        // Sprawdź, czy wpis w dzienniku audytu dotyczy tego użytkownika i jest niedawny (ostatnie 5 sekund)
        if (kickLog && kickLog.target.id === member.user.id) {
          const timeDifference = Date.now() - kickLog.createdTimestamp;
          
          // Jeśli wpis jest z ostatnich 5 sekund, uznaj to za kick
          if (timeDifference < 5000) {
            wasKicked = true;
            kickExecutor = kickLog.executor;
            if (kickLog.reason) kickReason = kickLog.reason;
          }
        }
      } catch (error) {
        logger.error(`Błąd podczas pobierania dziennika audytu dla kicka: ${error.message}`);
      }
      
      if (wasKicked) {
        // Przygotuj embed z informacjami o wyrzuceniu
        const kickEmbed = new EmbedBuilder()
          .setTitle('Wyrzucono użytkownika')
          .setColor(0xFF9900)
          .setDescription(`**Użytkownik:** ${member.user.tag} (${member.user.id})`)
          .addFields(
            { name: 'Powód', value: kickReason },
            { name: 'Wyrzucony przez', value: kickExecutor ? `${kickExecutor.tag} (${kickExecutor.id})` : 'Nie można ustalić' }
          )
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
          .setTimestamp()
          .setFooter({ text: `ID użytkownika: ${member.user.id}` });
        
        await logChannel.send({ embeds: [kickEmbed] });
      } else {
        // Przygotuj embed z informacjami o opuszczeniu serwera
        const leaveEmbed = new EmbedBuilder()
          .setTitle('Użytkownik opuścił serwer')
          .setColor(0x808080)
          .setDescription(`**Użytkownik:** ${member.user.tag} (${member.user.id})`)
          .addFields(
            { name: 'Dołączył', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` }
          )
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
          .setTimestamp()
          .setFooter({ text: `ID użytkownika: ${member.user.id}` });
        
        // Sprawdź, czy użytkownik miał jakieś role
        if (member.roles.cache.size > 1) { // > 1 ponieważ @everyone jest zawsze dostępna
          const roles = member.roles.cache
            .filter(role => role.id !== member.guild.id) // Filtruj @everyone
            .sort((a, b) => b.position - a.position) // Sortuj od najwyższej
            .map(role => role.toString())
            .join(', ');
          
          leaveEmbed.addFields({ name: 'Role', value: roles || 'Brak' });
        }
        
        await logChannel.send({ embeds: [leaveEmbed] });
      }
    } catch (error) {
      logger.error(`Błąd podczas logowania opuszczenia serwera: ${error.stack}`);
    }
  }
};