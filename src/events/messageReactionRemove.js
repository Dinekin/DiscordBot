// src/events/messageReactionRemove.js - naprawiona wersja z lepszym logowaniem
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
            logger.debug(`Usunięto reakcję: ${user.tag} usunął emoji ${reaction.emoji.name || reaction.emoji.id} z wiadomości ${reaction.message.id}`);
            
            // Sprawdź, czy reakcja jest częściowa i załaduj ją w całości
            if (reaction.partial) {
                try {
                    await reaction.fetch();
                    logger.debug('Częściowa reakcja została pobrana w całości');
                } catch (error) {
                    logger.error(`Błąd podczas pobierania reakcji: ${error.message}`);
                    return;
                }
            }

            // Sprawdź, czy wiadomość jest częściowa i załaduj ją
            if (reaction.message.partial) {
                try {
                    await reaction.message.fetch();
                    logger.debug('Częściowa wiadomość została pobrana w całości');
                } catch (error) {
                    logger.error(`Błąd podczas pobierania wiadomości: ${error.message}`);
                    return;
                }
            }

            // Pobierz informacje o serwerze
            const guildSettings = await Guild.findOne({ guildId: reaction.message.guildId });
            logger.debug(`Ustawienia serwera dla ${reaction.message.guildId}: ${JSON.stringify(guildSettings ? guildSettings.modules : 'brak')}`);
            
            // === LOGOWANIE REAKCJI ===
            if (guildSettings && guildSettings.modules?.messageLog) {
                await logReactionRemove(reaction, user, guildSettings);
            } else {
                logger.debug(`Logowanie reakcji wyłączone lub brak ustawień serwera dla ${reaction.message.guildId}`);
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

// Funkcja pomocnicza do logowania usunięcia reakcji - ulepszona wersja
async function logReactionRemove(reaction, user, guildSettings) {
    try {
        // Sprawdź czy kanał logów istnieje
        if (!guildSettings.messageLogChannel) {
            logger.debug('Brak kanału logów w ustawieniach serwera');
            return;
        }
        
        const logChannel = await reaction.message.guild.channels.fetch(guildSettings.messageLogChannel).catch(() => null);
        if (!logChannel) {
            logger.warn(`Kanał logów ${guildSettings.messageLogChannel} nie istnieje`);
            return;
        }
        
        // Nie loguj jeśli to jest ten sam kanał
        if (logChannel.id === reaction.message.channel.id) {
            logger.debug('Pomijam logowanie - to jest kanał logów');
            return;
        }
        
        // Sprawdź, czy mamy logować tylko usunięte wiadomości
        if (guildSettings.logDeletedOnly) {
            logger.debug('Logowanie tylko usuniętych wiadomości - pomijam reakcje');
            return;
        }
        
        // Znajdź log wiadomości i zaktualizuj go
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
                logger.debug(`Zaktualizowano log reakcji dla wiadomości ${reaction.message.id}`);
            }
        }
        
        // Przygotuj informacje o emoji do wyświetlenia
        const emojiDisplay = reaction.emoji.id 
            ? `<${reaction.emoji.animated ? 'a' : ''}:${reaction.emoji.name}:${reaction.emoji.id}>`
            : reaction.emoji.name;
        
        // Przygotuj embed z logiem
        const logEmbed = {
            color: 0xe74c3c, // Czerwony dla usunięcia
            author: {
                name: user.tag,
                icon_url: user.displayAvatarURL({ dynamic: true })
            },
            description: `**Usunął reakcję ${emojiDisplay} z [wiadomości](${reaction.message.url}) w <#${reaction.message.channel.id}>**`,
            fields: [
                {
                    name: '🔢 Pozostała liczba tej reakcji',
                    value: reaction.count.toString(),
                    inline: true
                }
            ],
            footer: {
                text: `Wiadomość ID: ${reaction.message.id} | User ID: ${user.id}`
            },
            timestamp: new Date()
        };
        
        // Dodaj informacje o autorze oryginalnej wiadomości jeśli dostępne
        if (reaction.message.author) {
            logEmbed.fields.push({
                name: '👤 Autor wiadomości',
                value: `${reaction.message.author.tag}`,
                inline: true
            });
        }
        
        // Dodaj fragment treści wiadomości jeśli dostępna
        if (reaction.message.content && reaction.message.content.trim()) {
            const contentPreview = reaction.message.content.length > 100 
                ? reaction.message.content.substring(0, 97) + '...' 
                : reaction.message.content;
            
            logEmbed.fields.push({
                name: '💬 Fragment wiadomości',
                value: contentPreview,
                inline: false
            });
        }
        
        // Wyślij log
        await logChannel.send({ embeds: [logEmbed] });
        
        logger.info(`✅ Zalogowano usunięcie reakcji ${emojiDisplay} przez ${user.tag} z wiadomości ${reaction.message.id}`);
        
    } catch (error) {
        logger.error(`❌ Błąd podczas logowania usunięcia reakcji: ${error.stack}`);
    }
}