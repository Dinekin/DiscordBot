// src/events/forumPostDelete.js - zdarzenie usunięcia postu na forum
const { Events, EmbedBuilder, ChannelType, AuditLogEvent } = require('discord.js');
const Guild = require('../models/Guild');
const MessageLog = require('../models/MessageLog');
const logger = require('../utils/logger');

module.exports = {
  name: Events.ThreadDelete,
  async execute(thread) {
    try {
      // Sprawdź czy to jest post na forum
      if (!thread.parent || thread.parent.type !== ChannelType.GuildForum) {
        return; // To nie jest post forum, ignoruj
      }
      
      // Sprawdź czy funkcja logowania jest włączona na serwerze
      const guildSettings = await Guild.findOne({ guildId: thread.guild?.id });
      
      // Jeśli nie ma guildSettings lub funkcja nie jest włączona, zakończ
      if (!thread.guild || !guildSettings || !guildSettings.modules?.messageLog) return;
      
      // Sprawdź czy kanał logów istnieje
      if (!guildSettings.messageLogChannel) return;
      
      const logChannel = await thread.guild.channels.fetch(guildSettings.messageLogChannel).catch(() => null);
      if (!logChannel || logChannel.id === thread.parent.id) return;
      
      // Pobierz informacje z dziennika audytu o usunięciu wątku
      let executor = null;
      let reason = "Nie podano powodu";
      
      try {
        // Poczekaj chwilę na wpis w dzienniku audytu
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const auditLogs = await thread.guild.fetchAuditLogs({
          limit: 1,
          type: AuditLogEvent.ThreadDelete
        });
        
        const threadLog = auditLogs.entries.first();
        
        if (threadLog && threadLog.target?.id === thread.id) {
          executor = threadLog.executor;
          if (threadLog.reason) reason = threadLog.reason;
        }
      } catch (error) {
        logger.error(`Błąd podczas pobierania dziennika audytu dla usunięcia postu forum: ${error.message}`);
      }
      
      // Przygotuj informacje o autorze postu
      let authorInfo = 'Nieznany autor';
      if (thread.ownerId) {
        try {
          const author = await thread.guild.members.fetch(thread.ownerId);
          authorInfo = `${author.user.tag} (${author})`;
        } catch (error) {
          authorInfo = `<@${thread.ownerId}>`;
        }
      }
      
      // Przygotuj informacje o tagach
      let tagsInfo = 'Brak tagów';
      if (thread.appliedTags && thread.appliedTags.length > 0) {
        tagsInfo = thread.appliedTags.map(tagId => {
          const tag = thread.parent?.availableTags.find(t => t.id === tagId);
          if (tag) {
            let tagText = tag.name;
            if (tag.emoji) {
              const emojiText = tag.emoji.id 
                ? `<:${tag.emoji.name}:${tag.emoji.id}>` 
                : tag.emoji.name;
              tagText = `${emojiText} ${tagText}`;
            }
            return `\`${tagText}\``;
          }
          return `\`${tagId}\``;
        }).join(' ');
      }
      
      // Przygotuj embed z informacjami o usuniętym poście forum
      const embed = new EmbedBuilder()
        .setTitle('🗑️ Usunięto post forum')
        .setColor(0xE74C3C)
        .setDescription(`**Tytuł:** ${thread.name}`)
        .addFields(
          { name: '🗂️ Forum', value: `<#${thread.parent.id}> (${thread.parent.name})`, inline: true },
          { name: '👤 Autor postu', value: authorInfo, inline: true },
          { name: '🆔 ID postu', value: thread.id, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: `ID postu: ${thread.id}` });
      
      // Dodaj informacje o tagach
      if (tagsInfo !== 'Brak tagów') {
        embed.addFields({ 
          name: '🏷️ Tagi', 
          value: tagsInfo,
          inline: false 
        });
      }
      
      // Dodaj informacje o moderatorze który usunął (jeśli różny od autora)
      if (executor) {
        if (executor.id !== thread.ownerId) {
          embed.addFields({ 
            name: '🛡️ Usunięty przez moderatora', 
            value: `${executor.tag} (${executor.id})`,
            inline: true 
          });
        } else {
          embed.addFields({ 
            name: '👤 Usunięty przez', 
            value: 'Autora postu',
            inline: true 
          });
        }
      }
      
      // Dodaj powód usunięcia
      if (reason !== "Nie podano powodu") {
        embed.addFields({ 
          name: '📝 Powód usunięcia', 
          value: reason,
          inline: false 
        });
      }
      
      // Dodaj informacje o czasie utworzenia i istnienia
      if (thread.createdAt) {
        embed.addFields({ 
          name: '📅 Utworzony', 
          value: `<t:${Math.floor(thread.createdAt.getTime() / 1000)}:F>`,
          inline: true 
        });
        
        // Oblicz jak długo istniał post
        const existedFor = new Date() - thread.createdAt;
        const days = Math.floor(existedFor / (1000 * 60 * 60 * 24));
        const hours = Math.floor((existedFor % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((existedFor % (1000 * 60 * 60)) / (1000 * 60));
        
        let duration = '';
        if (days > 0) duration += `${days} dni `;
        if (hours > 0) duration += `${hours} godz `;
        if (minutes > 0) duration += `${minutes} min`;
        
        if (duration.trim()) {
          embed.addFields({ 
            name: '⏱️ Czas istnienia', 
            value: duration.trim(),
            inline: true 
          });
        }
      }
      
      // Dodaj statystyki postu przed usunięciem
      const stats = [];
      if (thread.messageCount !== undefined && thread.messageCount !== null) {
        stats.push(`💬 ${thread.messageCount} wiadomości`);
      }
      if (thread.memberCount !== undefined && thread.memberCount !== null) {
        stats.push(`👥 ${thread.memberCount} uczestników`);
      }
      
      if (stats.length > 0) {
        embed.addFields({ 
          name: '📊 Statystyki przed usunięciem', 
          value: stats.join(' | '),
          inline: true 
        });
      }
      
      // Dodaj status przed usunięciem
      const statusParts = [];
      if (thread.archived) statusParts.push('📁 Zarchiwizowany');
      if (thread.locked) statusParts.push('🔒 Zablokowany');
      if (thread.pinned) statusParts.push('📌 Przypięty');
      
      if (statusParts.length > 0) {
        embed.addFields({ 
          name: '📋 Status przed usunięciem', 
          value: statusParts.join(' | '),
          inline: false 
        });
      }
      
      // Dodaj informacje o slowmode jeśli było ustawione
      if (thread.rateLimitPerUser && thread.rateLimitPerUser > 0) {
        embed.addFields({ 
          name: '🐌 Slowmode', 
          value: `${thread.rateLimitPerUser} sekund`,
          inline: true 
        });
      }
      
      // Dodaj informacje o automatycznej archiwizacji
      if (thread.autoArchiveDuration) {
        embed.addFields({ 
          name: '⏱️ Auto-archiwizacja', 
          value: formatArchiveDuration(thread.autoArchiveDuration),
          inline: true 
        });
      }
      
      // Dodaj ostrzeżenie o utraconych danych
      embed.addFields({ 
        name: '⚠️ Ostrzeżenie', 
        value: 'Wszystkie wiadomości i załączniki w tym poście zostały trwale utracone!',
        inline: false 
      });
      
      // Dodaj informacje o forum
      if (thread.parent.availableTags && thread.parent.availableTags.length > 0) {
        embed.addFields({ 
          name: '📊 Forum miało dostępnych tagów', 
          value: thread.parent.availableTags.length.toString(),
          inline: true 
        });
      }
      
      // Dodaj miniaturkę autora
      if (thread.ownerId) {
        try {
          const author = await thread.guild.members.fetch(thread.ownerId);
          embed.setThumbnail(author.user.displayAvatarURL({ dynamic: true }));
        } catch (error) {
          // Ignoruj błąd
        }
      }
      
      // Sprawdź czy to była akcja moderacyjna czy samoistne usunięcie
      const isModerationAction = executor && executor.id !== thread.ownerId;
      if (isModerationAction) {
        embed.setColor(0x992D22); // Ciemniejszy czerwony dla akcji moderacyjnych
      }
      
      await logChannel.send({ embeds: [embed] });

      // Zapisz informacje o usunięciu postu forum do bazy danych
      await logForumPostDeleteToDatabase(thread, executor, reason);

      logger.info(`Zalogowano usunięcie postu forum "${thread.name}" przez ${executor ? executor.tag : 'nieznany'} w ${thread.parent.name}`);

    } catch (error) {
      logger.error(`Błąd podczas logowania usunięcia postu forum: ${error.stack}`);
    }
  }
};

// Funkcja do zapisywania usunięcia postu forum do bazy danych
async function logForumPostDeleteToDatabase(thread, executor, reason) {
  try {
    // Znajdź lub utwórz dokument MessageLog dla tego postu
    let messageLog = await MessageLog.findOne({
      guildId: thread.guild.id,
      channelId: thread.id
    });

    if (!messageLog) {
      messageLog = new MessageLog({
        guildId: thread.guild.id,
        channelId: thread.id,
        messageId: `forum-post-delete-${thread.id}-${Date.now()}`, // Unikalne ID dla usunięcia postu forum
        authorId: thread.ownerId || 'system',
        authorTag: thread.ownerId ? 'Unknown' : 'System',
        content: '',
        threadLogs: []
      });
    }

    // Dodaj log postu forum
    messageLog.threadLogs.push({
      type: 'forum_post_delete',
      threadId: thread.id,
      threadName: thread.name,
      parentId: thread.parent?.id,
      parentName: thread.parent?.name,
      authorId: thread.ownerId,
      authorTag: 'Unknown', // Pobierzemy to później jeśli potrzebne
      isForumPost: true,
      appliedTags: thread.appliedTags || [],
      moderatorId: executor?.id,
      moderatorTag: executor?.tag,
      reason: reason
    });

    await messageLog.save();
    logger.info(`Zapisano usunięcie postu forum ${thread.name} w bazie danych`);
  } catch (error) {
    logger.error(`Błąd podczas zapisywania usunięcia postu forum do bazy danych: ${error.stack}`);
  }
}

// Funkcja pomocnicza do formatowania czasu archiwizacji
function formatArchiveDuration(minutes) {
  if (!minutes) return 'Nieznany';
  
  if (minutes === 60) return '1 godzina';
  if (minutes === 1440) return '1 dzień';
  if (minutes === 4320) return '3 dni';
  if (minutes === 10080) return '1 tydzień';
  
  return `${minutes} minut`;
}
