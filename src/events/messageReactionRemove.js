// src/events/messageReactionRemove.js - z logowaniem reakcji
const { Events } = require('discord.js');
const ReactionRole = require('../models/ReactionRole');
const MessageLog = require('../models/MessageLog');
const Guild = require('../models/Guild');
const logger = require('../utils/logger');

module.exports = {
    name: Events.MessageReactionRemove,
    async execute(reaction, user) {
        // Ignoruj reakcje od botów
        if (user.bot) return;

        try {
            logger.debug(`Reakcja usunięta: ${user.tag} usunął emoji ${reaction.emoji.name || reaction.emoji.id} z wiadomości ${reaction.message.id}`);
            
            // Sprawdź, czy reakcja jest częściowa i załaduj ją w całości
            if (reaction.partial) {
                try {
                    await reaction.fetch();
                    logger.debug('Reakcja częściowa została pobrana w całości');
                } catch (error) {
                    logger.error(`Błąd podczas pobierania reakcji: ${error.message}`);
                    return;
                }
            }

            // Pobierz informacje o serwerze
            const guildSettings = await Guild.findOne({ guildId: reaction.message.guildId });
            logger.debug(`Ustawienia serwera: ${JSON.stringify(guildSettings ? guildSettings.modules : 'brak')}`);
            
            // === LOGOWANIE REAKCJI ===
            if (guildSettings && guildSettings.modules?.messageLog) {
                await logReactionRemove(reaction, user, guildSettings);
            }
            
            // === SYSTEM RÓL REAKCJI ===
            // Sprawdź czy moduł reaction roles jest włączony
            if (guildSettings && guildSettings.modules && guildSettings.modules.reactionRoles === false) {
                logger.debug('Moduł reaction roles jest wyłączony, przerywam obsługę ról');
                return;
            }

            // Znajdź reakcję w bazie danych
            const reactionRole = await ReactionRole.findOne({
                guildId: reaction.message.guildId,
                messageId: reaction.message.id
            });

            if (!reactionRole) {
                logger.debug(`Nie znaleziono konfiguracji reaction role dla wiadomości ${reaction.message.id}`);
                return;
            }

            // Sprawdź, czy emoji jest w bazie danych
            const emojiIdentifier = reaction.emoji.id || reaction.emoji.name;
            logger.debug(`Szukam emoji: ${emojiIdentifier} w konfiguracji ról`);
            
            const roleInfo = reactionRole.roles.find(r => r.emoji === emojiIdentifier);

            if (!roleInfo) {
                logger.debug(`Nie znaleziono roli dla emoji ${emojiIdentifier}`);
                return;
            }

            try {
                // Usuń rolę użytkownikowi
                const guild = reaction.message.guild;
                const member = await guild.members.fetch(user.id);
                
                // Pobierz rolę, aby sprawdzić czy istnieje
                const role = await guild.roles.fetch(roleInfo.roleId).catch(err => {
                    logger.error(`Nie można znaleźć roli ${roleInfo.roleId}: ${err.message}`);
                    return null;
                });
                
                if (!role) {
                    logger.error(`Rola o ID ${roleInfo.roleId} nie istnieje na serwerze`);
                    return;
                }
                
                await member.roles.remove(roleInfo.roleId);
                logger.info(`Usunięto rolę ${role.name} użytkownikowi ${member.user.tag}`);

                // Sprawdź, czy powiadomienia są włączone
                if (roleInfo.notificationEnabled && guildSettings.notificationChannel) {
                    try {
                        const notificationChannel = await guild.channels.fetch(guildSettings.notificationChannel);
                        
                        if (notificationChannel) {
                            await notificationChannel.send(
                                `Użytkownik ${user} usunął rolę ${role.name} poprzez usunięcie reakcji w kanale <#${reaction.message.channel.id}>`
                            );
                        }
                    } catch (notifError) {
                        logger.error(`Błąd podczas wysyłania powiadomienia: ${notifError.message}`);
                    }
                }
            } catch (error) {
                logger.error(`Błąd podczas usuwania roli: ${error.stack}`);
            }
        } catch (error) {
            logger.error(`Ogólny błąd podczas obsługi usunięcia reakcji: ${error.stack}`);
        }
    },
};

// Funkcja pomocnicza do logowania usunięcia reakcji
async function logReactionRemove(reaction, user, guildSettings) {
    try {
        // Sprawdź czy kanał logów istnieje i czy to nie jest kanał logów
        if (!guildSettings.messageLogChannel) return;
        
        const logChannel = await reaction.message.guild.channels.fetch(guildSettings.messageLogChannel).catch(() => null);
        if (!logChannel || logChannel.id === reaction.message.channel.id) return;
        
        // Sprawdź, czy mamy logować tylko usunięte wiadomości
        if (guildSettings.logDeletedOnly) return;
        
        // Znajdź log wiadomości
        const messageLog = await MessageLog.findOne({ messageId: reaction.message.id });
        
        if (messageLog) {
            // Przygotuj informacje o emoji
            const emoji = reaction.emoji;
            
            // Znajdź reakcję w logu
            const reactionIndex = messageLog.reactions.findIndex(r => 
                (r.id && r.id === emoji.id) || (!r.id && r.name === emoji.name)
            );
            
            if (reactionIndex !== -1) {
                // Aktualizuj reakcję
                messageLog.reactions[reactionIndex].count = reaction.count;
                
                // Usuń użytkownika z listy jeśli tam jest
                const userIndex = messageLog.reactions[reactionIndex].users.indexOf(user.id);
                if (userIndex !== -1) {
                    messageLog.reactions[reactionIndex].users.splice(userIndex, 1);
                }
                
                // Jeśli nie ma więcej tej reakcji, usuń ją z logu
                if (reaction.count === 0) {
                    messageLog.reactions.splice(reactionIndex, 1);
                }
                
                await messageLog.save();
            }
        }
        
        // Wyślij log na kanał (opcjonalnie)
        const emojiDisplay = emoji.id 
            ? `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`
            : emoji.name;
        
        const logEmbed = {
            color: 0xe74c3c,
            author: {
                name: user.tag,
                icon_url: user.displayAvatarURL({ dynamic: true })
            },
            description: `**Usunął reakcję ${emojiDisplay} z [wiadomości](${reaction.message.url}) w <#${reaction.message.channel.id}>**`,
            fields: [
                {
                    name: 'Pozostała liczba tej reakcji',
                    value: reaction.count.toString(),
                    inline: true
                }
            ],
            footer: {
                text: `Wiadomość ID: ${reaction.message.id} | User ID: ${user.id}`
            },
            timestamp: new Date()
        };
        
        await logChannel.send({ embeds: [logEmbed] });
        
        logger.debug(`Zalogowano usunięcie reakcji ${emojiDisplay} przez ${user.tag}`);
    } catch (error) {
        logger.error(`Błąd podczas logowania usunięcia reakcji: ${error.stack}`);
    }
}