// Plik: src/utils/giveawayManager.js
const { GiveawaysManager } = require('discord-giveaways');
const logger = require('./logger');
const Giveaway = require('../models/Giveaway');

// Inicjalizacja menedżera giveaway'ów z niestandardowym przechowywaniem danych (MongoDB)
function setupGiveawaysManager(client) {  // Dodaj parametr client
    if (!client) {
        throw new Error("Client jest wymagany do inicjalizacji GiveawaysManager!");
    }
    
    logger.debug("Inicjalizacja GiveawaysManager z klientem Discord");
    
    const GiveawayManagerWithOwnDatabase = class extends GiveawaysManager {
        // Zapisywanie giveaway w bazie danych
        async saveGiveaway(messageId, giveawayData) {
            try {
                await Giveaway.create({
                    messageId,
                    ...giveawayData
                });
                return true;
            } catch (error) {
                logger.error(`Błąd podczas zapisywania giveaway: ${error.stack}`);
                return false;
            }
        }

        // Aktualizacja giveaway w bazie danych
        async editGiveaway(messageId, giveawayData) {
            try {
                await Giveaway.findOneAndUpdate(
                    { messageId },
                    { $set: giveawayData }
                );
                return true;
            } catch (error) {
                logger.error(`Błąd podczas aktualizacji giveaway: ${error.stack}`);
                return false;
            }
        }

        // Usuwanie giveaway z bazy danych
        async deleteGiveaway(messageId) {
            try {
                await Giveaway.findOneAndDelete({ messageId });
                return true;
            } catch (error) {
                logger.error(`Błąd podczas usuwania giveaway: ${error.stack}`);
                return false;
            }
        }

        // Pobieranie wszystkich giveaway'ów z bazy danych
        async getAllGiveaways() {
            try {
                return await Giveaway.find().lean();
            } catch (error) {
                logger.error(`Błąd podczas pobierania wszystkich giveaway'ów: ${error.stack}`);
                return [];
            }
        }
    };

    // Tworzenie instancji menedżera giveaway'ów
    const manager = new GiveawayManagerWithOwnDatabase(client, {
        default: {
            botsCanWin: false,
            embedColor: '#3498db',
            embedColorEnd: '#e74c3c',
            reaction: '🎉',
            lastChance: {
                enabled: true,
                content: '⚠️ **OSTATNIA SZANSA** ⚠️',
                threshold: 5000, // 5 sekund przed końcem
                embedColor: '#ffcc00'
            }
        }
    });

    // Nasłuchiwanie zdarzeń giveaway
    manager.on('giveawayReactionAdded', (giveaway, member, reaction) => {
        logger.info(`${member.user.tag} dołączył do giveaway'u #${giveaway.messageId}`);
    });

    manager.on('giveawayReactionRemoved', (giveaway, member, reaction) => {
        logger.info(`${member.user.tag} anulował udział w giveaway'u #${giveaway.messageId}`);
    });

    manager.on('giveawayEnded', (giveaway, winners) => {
        logger.info(`Giveaway #${giveaway.messageId} zakończony! Zwycięzcy: ${winners.map(w => w.user.tag).join(', ')}`);
    });

    return manager;
}

module.exports = { setupGiveawaysManager };