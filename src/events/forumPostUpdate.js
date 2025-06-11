// Plik: src/events/forumPostUpdate.js
// Dedykowany event handler dla logowania zmian w postach forum
const { Events, EmbedBuilder, ChannelType } = require('discord.js');
const Guild = require('../models/Guild');
const logger = require('../utils/logger');

module.exports = {
  name: Events.ThreadUpdate,
  async execute(oldThread, newThread) {
    try {
      // Sprawdź czy to jest post na forum
      if (!newThread.parent || newThread.parent.type !== ChannelType.GuildForum) {
        return; // To nie jest post forum, ignoruj
      }
      
      // Sprawdź czy funkcja logowania jest włączona na serwerze
      const guildSettings = await Guild.findOne({ guildId: newThread.guild?.id });
      
      // Jeśli nie ma guildSettings lub funkcja nie jest włączona, zakończ
      if (!newThread.guild || !guildSettings || !guildSettings.modules?.messageLog) return;
      
      // Sprawdź, czy mamy logować tylko usunięte wiadomości
      if (guildSettings.logDeletedOnly) {
        return;
      }
      
      // Sprawdź czy kanał logów istnieje
      if (!guildSettings.messageLogChannel) return;
      
      const logChannel = await newThread.guild.channels.fetch(guildSettings.messageLogChannel).catch(() => null);
      if (!logChannel || logChannel.id === newThread.parent.id) return;
      
      // Przygotuj listę zmian
      const changes = [];
      let importantChange = false;
      
      // Sprawdź czy zmienił się tytuł postu
      if (oldThread.name !== newThread.name) {
        changes.push({
          name: '📝 Tytuł postu',
          value: `**Przed:** ${oldThread.name}\n**Po:** ${newThread.name}`,
          inline: false
        });
        importantChange = true;
      }
      
      // Sprawdź czy zmieniły się tagi
      if (oldThread.appliedTags?.toString() !== newThread.appliedTags?.toString()) {
        let oldTags = 'Brak tagów';
        let newTags = 'Brak tagów';
        
        if (oldThread.appliedTags && oldThread.appliedTags.length > 0) {
          oldTags = oldThread.appliedTags.map(tagId => {
            const tag = oldThread.parent?.availableTags.find(t => t.id === tagId);
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
        
        if (newThread.appliedTags && newThread.appliedTags.length > 0) {
          newTags = newThread.appliedTags.map(tagId => {
            const tag = newThread.parent?.availableTags.find(t => t.id === tagId);
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
        
        changes.push({
          name: '🏷️ Tagi',
          value: `**Przed:** ${oldTags}\n**Po:** ${newTags}`,
          inline: false
        });
        importantChange = true;
      }
      
      // Sprawdź czy post został zarchiwizowany
      if (!oldThread.archived && newThread.archived) {
        changes.push({
          name: '📁 Status',
          value: '**Post został zarchiwizowany**',
          inline: false
        });
        importantChange = true;
      }
      
      // Sprawdź czy post został odarchiwizowany
      if (oldThread.archived && !newThread.archived) {
        changes.push({
          name: '📂 Status',
          value: '**Post został odarchiwizowany**',
          inline: false
        });
        importantChange = true;
      }
      
      // Sprawdź czy post został zablokowany
      if (!oldThread.locked && newThread.locked) {
        changes.push({
          name: '🔒 Status',
          value: '**Post został zablokowany**',
          inline: false
        });
        importantChange = true;
      }
      
      // Sprawdź czy post został odblokowany
      if (oldThread.locked && !newThread.locked) {
        changes.push({
          name: '🔓 Status',
          value: '**Post został odblokowany**',
          inline: false
        });
        importantChange = true;
      }
      
      // Sprawdź czy post został przypięty
      if (!oldThread.pinned && newThread.pinned) {
        changes.push({
          name: '📌 Status',
          value: '**Post został przypięty**',
          inline: false
        });
        importantChange = true;
      }
      
      // Sprawdź czy post został odpięty
      if (oldThread.pinned && !newThread.pinned) {
        changes.push({
          name: '📌 Status',
          value: '**Post został odpięty**',
          inline: false
        });
        importantChange = true;
      }
      
      // Sprawdź czy zmienił się slowmode
      if (oldThread.rateLimitPerUser !== newThread.rateLimitPerUser) {
        const oldRate = oldThread.rateLimitPerUser || 0;
        const newRate = newThread.rateLimitPerUser || 0;
        
        changes.push({
          name: '🐌 Slowmode',
          value: `**Przed:** ${oldRate === 0 ? 'Wyłączony' : `${oldRate} sekund`}\n**Po:** ${newRate === 0 ? 'Wyłączony' : `${newRate} sekund`}`,
          inline: true
        });
      }
      
      // Sprawdź czy zmienił się czas auto-archiwizacji
      if (oldThread.autoArchiveDuration !== newThread.autoArchiveDuration) {
        changes.push({
          name: '⏱️ Auto-archiwizacja',
          value: `**Przed:** ${formatArchiveDuration(oldThread.autoArchiveDuration)}\n**Po:** ${formatArchiveDuration(newThread.autoArchiveDuration)}`,
          inline: true
        });
      }
      
      // Jeśli nie wykryto zmian, zakończ
      if (changes.length === 0) return;
      
      // Przygotuj informacje o autorze postu
      let authorInfo = 'Nieznany autor';
      if (newThread.ownerId) {
        try {
          const author = await newThread.guild.members.fetch(newThread.ownerId);
          authorInfo = `${author.user.tag} (${author})`;
        } catch (error) {
          authorInfo = `<@${newThread.ownerId}>`;
        }
      }
      
      // Określ kolor na podstawie typu zmiany
      let embedColor = 0xF1C40F; // Żółty dla zwykłych zmian
      if (newThread.archived) embedColor = 0x95A5A6; // Szary dla zarchiwizowanych
      else if (newThread.locked) embedColor = 0xE74C3C; // Czerwony dla zablokowanych
      else if (newThread.pinned) embedColor = 0x3498DB; // Niebieski dla przypiętych
      else if (importantChange) embedColor = 0x9B59B6; // Fioletowy dla ważnych zmian
      
      // Przygotuj embed z informacjami o aktualizacji postu
      const embed = new EmbedBuilder()
        .setTitle('✏️ Zaktualizowano post forum')
        .setColor(embedColor)
        .setDescription(`**Post:** ${newThread.name}`)
        .addFields(
          { name: '🗂️ Forum', value: `<#${newThread.parent.id}> (${newThread.parent.name})`, inline: true },
          { name: '👤 Autor postu', value: authorInfo, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: `ID postu: ${newThread.id}` });
      
      // Dodaj wykryte zmiany
      changes.forEach(change => {
        embed.addFields(change);
      });
      
      // Dodaj link do postu
      embed.addFields({ 
        name: '🔗 Link do postu', 
        value: `[Przejdź do postu](https://discord.com/channels/${newThread.guild.id}/${newThread.id})`,
        inline: true 
      });
      
      // Dodaj statystyki postu
      const stats = [];
      if (newThread.messageCount !== undefined && newThread.messageCount !== null) {
        stats.push(`💬 ${newThread.messageCount} wiadomości`);
      }
      if (newThread.memberCount !== undefined && newThread.memberCount !== null) {
        stats.push(`👥 ${newThread.memberCount} uczestników`);
      }
      
      if (stats.length > 0) {
        embed.addFields({ 
          name: '📊 Statystyki', 
          value: stats.join(' | '),
          inline: true 
        });
      }
      
      // Dodaj obecny status postu
      const statusParts = [];
      if (newThread.archived) statusParts.push('📁 Zarchiwizowany');
      if (newThread.locked) statusParts.push('🔒 Zablokowany');
      if (newThread.pinned) statusParts.push('📌 Przypięty');
      
      if (statusParts.length > 0) {
        embed.addFields({ 
          name: '📋 Obecny status', 
          value: statusParts.join(' | '),
          inline: false 
        });
      }
      
      // Dodaj obecne tagi
      if (newThread.appliedTags && newThread.appliedTags.length > 0) {
        const currentTags = newThread.appliedTags.map(tagId => {
          const tag = newThread.parent.availableTags.find(t => t.id === tagId);
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
        
        embed.addFields({ 
          name: '🏷️ Obecne tagi', 
          value: currentTags,
          inline: false 
        });
      }
      
      // Dodaj miniaturkę autora
      if (newThread.ownerId) {
        try {
          const author = await newThread.guild.members.fetch(newThread.ownerId);
          embed.setThumbnail(author.user.displayAvatarURL({ dynamic: true }));
        } catch (error) {
          // Ignoruj błąd
        }
      }
      
      await logChannel.send({ embeds: [embed] });
      
      logger.info(`Zalogowano aktualizację postu forum "${newThread.name}" w ${newThread.parent.name}`);
      
    } catch (error) {
      logger.error(`Błąd podczas logowania aktualizacji postu forum: ${error.stack}`);
    }
  }
};

// Funkcja pomocnicza do formatowania czasu archiwizacji
function formatArchiveDuration(minutes) {
  if (!minutes) return 'Nieznany';
  
  if (minutes === 60) return '1 godzina';
  if (minutes === 1440) return '1 dzień';
  if (minutes === 4320) return '3 dni';
  if (minutes === 10080) return '1 tydzień';
  
  return `${minutes} minut`;
}