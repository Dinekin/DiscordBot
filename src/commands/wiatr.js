const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wiatr')
        .setDescription('Wyświetla informacje o wybranym wietrze z odpowiednimi rolami')
        .addStringOption(option =>
            option.setName('typ')
                .setDescription('Wybierz typ wiatru')
                .setRequired(true)
                .addChoices(
                    // Główne wiatry
                    { name: 'Boreasz', value: 'boreasz' },
                    { name: 'Euros', value: 'euros' },
                    { name: 'Notos', value: 'notos' },
                    { name: 'Zefir', value: 'zefir' },
                    { name: 'Iapis', value: 'iapis' },
                    { name: 'Kajkias', value: 'kajkias' },
                    { name: 'Apeliotes', value: 'apeliotes' },
                    { name: 'Euronotos', value: 'euronotos' },
                    { name: 'Libonotos', value: 'libonotos' },
                    { name: 'Lips', value: 'lips' },
                    { name: 'Skiron', value: 'skiron' },
                    { name: 'Trakiusz', value: 'trakiusz' },
                    // Kombinacje
                    { name: 'EK (Euros-Kajkias)', value: 'ek' },
                    { name: 'EA (Euros-Apeliotes)', value: 'ea' },
                    { name: 'ZL (Zefir-Lips)', value: 'zl' },
                    { name: 'ZS (Zefir-Skiron)', value: 'zs' }
                )),

    async execute(interaction) {
        try {
            const windType = interaction.options.getString('typ');
            
            // Pobierz wszystkie ID ról z zmiennych środowiskowych
            const roleIds = {
                boreasz: process.env.BOREASZ_ROLE_ID,
                trakiusz: process.env.TRAKIUSZ_ROLE_ID,
                iapis: process.env.IAPIS_ROLE_ID,
                skiron: process.env.SKIRON_ROLE_ID,
                kajkias: process.env.KAJKIAS_ROLE_ID,
                euros: process.env.EUROS_ROLE_ID,
                apeliotes: process.env.APELIOTES_ROLE_ID,
                euronotos: process.env.EURONOTOS_ROLE_ID,
                notos: process.env.NOTOS_ROLE_ID,
                libonotos: process.env.LIBONOTOS_ROLE_ID,
                lips: process.env.LIPS_ROLE_ID,
                zefir: process.env.ZEFIR_ROLE_ID
            };

            // Sprawdź czy wszystkie podstawowe role są zdefiniowane
            const missingRoles = Object.entries(roleIds).filter(([name, id]) => !id);
            if (missingRoles.length > 0) {
                return interaction.reply({
                    content: `Błąd konfiguracji: Brakuje definicji ról: ${missingRoles.map(([name]) => name.toUpperCase()).join(', ')} w zmiennych środowiskowych.`,
                    ephemeral: true
                });
            }

            // Funkcja pomocnicza do tworzenia tagów ról - poprawiona
            const createRoleTag = (roleName) => {
                const roleId = roleIds[roleName];
                if (!roleId) {
                    console.warn(`Brak ID roli dla: ${roleName}`);
                    return `@${roleName.charAt(0).toUpperCase() + roleName.slice(1)}`;
                }
                
                // Sprawdź czy rola istnieje w guild
                const role = interaction.guild.roles.cache.get(roleId);
                if (!role) {
                    console.warn(`Rola o ID ${roleId} nie istnieje w serwerze`);
                    return `@${roleName.charAt(0).toUpperCase() + roleName.slice(1)}`;
                }
                
                return `<@&${roleId}>`;
            };

            // Definicje wszystkich wiatrów
            const windPatterns = {
                boreasz: {
                    roles: ['boreasz', 'trakiusz', 'iapis', 'skiron', 'kajkias'],
                    pattern: (r) => `${r.boreasz} +7 ${r.trakiusz} | ${r.iapis} +6 ${r.skiron} | ${r.kajkias} +5`
                },
                euros: {
                    roles: ['euros', 'kajkias', 'apeliotes', 'iapis', 'euronotos'],
                    pattern: (r) => `${r.euros} +7 ${r.kajkias} | ${r.apeliotes} +5 ${r.iapis} | ${r.euronotos} +4`
                },
                notos: {
                    roles: ['notos', 'libonotos', 'euronotos', 'lips', 'apeliotes'],
                    pattern: (r) => `${r.notos} +7 ${r.libonotos} | ${r.euronotos} +6 ${r.lips} | ${r.apeliotes} +5`
                },
                zefir: {
                    roles: ['zefir', 'skiron', 'lips', 'trakiusz', 'libonotos'],
                    pattern: (r) => `${r.zefir} +7 ${r.skiron} | ${r.lips} +5 ${r.trakiusz} | ${r.libonotos} +4`
                },
                iapis: {
                    roles: ['iapis', 'boreasz', 'kajkias', 'trakiusz', 'euros', 'skiron'],
                    pattern: (r) => `${r.iapis} +7 ${r.boreasz} | ${r.kajkias} +6 ${r.trakiusz} +5 ${r.euros} | ${r.skiron} +4`
                },
                kajkias: {
                    roles: ['kajkias', 'iapis', 'boreasz', 'euros', 'trakiusz'],
                    pattern: (r) => `${r.kajkias} +7 ${r.iapis} +6 ${r.boreasz} | ${r.euros} +5 ${r.trakiusz} +4`
                },
                apeliotes: {
                    roles: ['apeliotes', 'euronotos', 'notos', 'euros', 'libonotos'],
                    pattern: (r) => `${r.apeliotes} +7 ${r.euronotos} +6 ${r.notos} | ${r.euros} +5 ${r.libonotos} +4`
                },
                euronotos: {
                    roles: ['euronotos', 'notos', 'apeliotes', 'libonotos', 'lips', 'euros'],
                    pattern: (r) => `${r.euronotos} +7 ${r.notos} | ${r.apeliotes} +6 ${r.libonotos} +5 ${r.lips} | ${r.euros} +4`
                },
                libonotos: {
                    roles: ['libonotos', 'lips', 'notos', 'euronotos', 'zefir', 'apeliotes'],
                    pattern: (r) => `${r.libonotos} +7 ${r.lips} | ${r.notos} +6 ${r.euronotos} +5 ${r.zefir} | ${r.apeliotes} +4`
                },
                lips: {
                    roles: ['lips', 'libonotos', 'zefir', 'notos', 'euronotos'],
                    pattern: (r) => `${r.lips} +7 ${r.libonotos} +6 ${r.zefir} | ${r.notos} +5 ${r.euronotos} +4`
                },
                skiron: {
                    roles: ['skiron', 'trakiusz', 'zefir', 'boreasz', 'iapis'],
                    pattern: (r) => `${r.skiron} +7 ${r.trakiusz} +6 ${r.zefir} | ${r.boreasz} +5 ${r.iapis} +4`
                },
                trakiusz: {
                    roles: ['trakiusz', 'skiron', 'boreasz', 'iapis', 'zefir', 'kajkias'],
                    pattern: (r) => `${r.trakiusz} +7 ${r.skiron} | ${r.boreasz} +6 ${r.iapis} +5 ${r.zefir} | ${r.kajkias} +4`
                },
                // Kombinacje
                ek: {
                    roles: ['kajkias', 'euros', 'iapis', 'boreasz', 'apeliotes'],
                    pattern: (r) => `${r.kajkias} | ${r.euros} +6 ${r.iapis} +5 ${r.boreasz} | ${r.apeliotes} +4`
                },
                ea: {
                    roles: ['euros', 'apeliotes', 'euronotos', 'kajkias', 'notos'],
                    pattern: (r) => `${r.euros} | ${r.apeliotes} +6 ${r.euronotos} +5 ${r.kajkias} | ${r.notos} +4`
                },
                zl: {
                    roles: ['zefir', 'lips', 'libonotos', 'skiron', 'notos'],
                    pattern: (r) => `${r.zefir} | ${r.lips} +6 ${r.libonotos} +5 ${r.skiron} | ${r.notos} +4`
                },
                zs: {
                    roles: ['skiron', 'zefir', 'trakiusz', 'boreasz', 'lips'],
                    pattern: (r) => `${r.skiron} | ${r.zefir} +6 ${r.trakiusz} +5 ${r.boreasz} | ${r.lips} +4`
                }
            };

            // Sprawdź czy wybrany wiatr istnieje
            const windConfig = windPatterns[windType];
            if (!windConfig) {
                return interaction.reply({
                    content: 'Nieznany typ wiatru!',
                    ephemeral: true
                });
            }

            // Utwórz obiekty tagów ról
            const roleTags = {};
            windConfig.roles.forEach(roleName => {
                roleTags[roleName] = createRoleTag(roleName);
            });

            // Wygeneruj wiadomość używając wzorca
            const windMessage = windConfig.pattern(roleTags);

            // Sprawdź długość wiadomości
            if (windMessage.length > 2000) {
                return interaction.reply({
                    content: 'Wiadomość jest za długa! Skontaktuj się z administratorem.',
                    ephemeral: true
                });
            }

            // Przygotuj listę ID ról do tagowania (tylko te które istnieją w serwerze)
            const validRoleIds = [];
            
            for (const roleName of windConfig.roles) {
                const roleId = roleIds[roleName];
                if (roleId) {
                    // Sprawdź czy rola istnieje w serwerze
                    const role = interaction.guild.roles.cache.get(roleId);
                    if (role) {
                        validRoleIds.push(roleId);
                    }
                }
            }

            // Opcje reply - uproszczone i bezpieczne
            const replyOptions = {
                content: windMessage
            };

            // Dodaj allowedMentions tylko jeśli są valide role
            if (validRoleIds.length > 0) {
                replyOptions.allowedMentions = {
                    roles: validRoleIds
                };
            }

            console.log('Wysyłanie reply z opcjami:', JSON.stringify(replyOptions, null, 2));

            await interaction.reply(replyOptions);

        } catch (error) {
            console.error('Błąd podczas wykonywania komendy wiatr:', error);
            
            // Dodaj więcej szczegółów błędu
            console.error('Stack trace:', error.stack);
            
            const errorMessage = 'Wystąpił błąd podczas wykonywania komendy.';
            
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({
                        content: errorMessage,
                        ephemeral: true
                    });
                } else {
                    await interaction.reply({
                        content: errorMessage,
                        ephemeral: true
                    });
                }
            } catch (replyError) {
                console.error('Błąd podczas wysyłania odpowiedzi błędu:', replyError);
            }
        }
    },
};