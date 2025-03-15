const { Events, EmbedBuilder } = require('discord.js');
const Guild = require('../models/Guild');
const UserRole = require('../models/UserRole');
const logger = require('../utils/logger');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        try {
            // Sprawdź, czy użytkownik ma zapisane role w bazie danych
            const userRoleData = await UserRole.findOne({ 
                guildId: member.guild.id,
                userId: member.id
            });
            
            if (shouldRestoreRoles && userRoleData && userRoleData.roles.length > 0) {
                // Przygotuj role do przywrócenia
                const rolesToRestore = userRoleData.roles.filter(roleId => {
                    const role = member.guild.roles.cache.get(roleId);
                    // Ignoruj role, które nie istnieją lub są zarządzane przez integracje
                    return role && !role.managed;
                });
                
                if (rolesToRestore.length > 0) {
                    try {
                        // Spróbuj przywrócić role
                        await member.roles.add(rolesToRestore);
                        logger.info(`Przywrócono ${rolesToRestore.length} ról dla użytkownika ${member.user.tag} (${member.id}) na serwerze ${member.guild.name}`);
                        
                        // Opcjonalnie przywróć również poprzedni pseudonim
                        if (userRoleData.nickname) {
                            try {
                                await member.setNickname(userRoleData.nickname);
                                logger.info(`Przywrócono pseudonim "${userRoleData.nickname}" dla użytkownika ${member.user.tag}`);
                            } catch (nickError) {
                                logger.warn(`Nie można przywrócić pseudonimu dla ${member.user.tag}: ${nickError.message}`);
                            }
                        }
                    } catch (roleError) {
                        logger.error(`Błąd podczas przywracania ról dla ${member.user.tag}: ${roleError.message}`);
                    }
                }
            }
        } catch (error) {
            logger.error(`Błąd podczas sprawdzania zapisanych ról: ${error.stack}`);
        }
        
        // Pobierz konfigurację serwera
        const guildSettings = await Guild.findOne({ guildId: member.guild.id });

        // Jeśli nie ma konfiguracji lub nie ustawiono kanału powitalnego, to zakończ
        if (!guildSettings || !guildSettings.welcomeChannel) return;

        try {
            // Pobierz kanał powitalny
            const welcomeChannel = await member.guild.channels.fetch(guildSettings.welcomeChannel);

            if (!welcomeChannel) {
                logger.warn(`Nie znaleziono kanału powitalnego ${guildSettings.welcomeChannel} na serwerze ${member.guild.name}`);
                return;
            }

            // Utwórz wiadomość powitalną
            const welcomeEmbed = new EmbedBuilder()
            .setTitle('Witamy na serwerze!')
            .setDescription(`Witaj ${member} na serwerze **${member.guild.name}**!`)
            .setColor('#3498db')
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'Użytkownik', value: member.user.tag },
                { name: 'ID użytkownika', value: member.id },
                { name: 'Konto utworzone', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>` }
            )
            .setFooter({ text: `Jesteś ${member.guild.memberCount} członkiem serwera!` })
            .setTimestamp();

            // Dodaj informację o przywróconych rolach, jeśli jakieś były
            if (userRoleData && userRoleData.roles.length > 0) {
                const restoredRoles = userRoleData.roles
                    .map(roleId => {
                        const role = member.guild.roles.cache.get(roleId);
                        return role ? role.name : null;
                    })
                    .filter(Boolean)
                    .join(', ');
                
                if (restoredRoles) {
                    welcomeEmbed.addFields({ 
                        name: 'Przywrócone role', 
                        value: restoredRoles 
                    });
                }
            }

            // Wyślij wiadomość powitalną
            await welcomeChannel.send({ embeds: [welcomeEmbed] });

            logger.info(`Wysłano wiadomość powitalną dla ${member.user.tag} na serwerze ${member.guild.name}`);
        } catch (error) {
            logger.error(`Błąd podczas wysyłania wiadomości powitalnej:`, error);
        }
    },
};