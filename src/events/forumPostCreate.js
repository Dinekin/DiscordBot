// src/events/forumPostCreate.js - zdarzenie utworzenia postu na forum
const { Events, EmbedBuilder, ChannelType } = require('discord.js');
const Guild = require('../models/Guild');
const MessageLog = require('../models/MessageLog');
const logger = require('../utils/logger');

// Funkcja do pobierania treści pierwszej wiadomości z postu forum
async function getForumPostContent(thread) {
  try {
    // Dla postów forum, pierwsza wiadomość to starter message
    const messages = await thread.messages.fetch({ limit: 1 });
    const starterMessage = messages.first();
    
    if (!starterMessage) return null;
    
    let content = {
      text: '',
      attachments: [],
      embeds: [],
      stickers: []
    };
    
    // Pobierz treść tekstową
    if (starterMessage.content && starterMessage.content.trim()) {
      content.text = starterMessage.content;
    }
    
    // Pobierz załączniki
    if (starterMessage.attachments && starterMessage.attachments.size > 0) {
      content.attachments = Array.from(starterMessage.attachments.values()).map(attachment => ({
        name: attachment.name,
        url: attachment.url,
        contentType: attachment.contentType,
        size: attachment.size
      }));
    }
    
    // Pobierz embeddy
    if (starterMessage.embeds && starterMessage.embeds.length > 0) {
      content.embeds = starterMessage.embeds.map(embed => ({
        title: embed.title,
        description: embed.description,
        url: embed.url,
        type: embed.type
      }));
    }
    
    // Pobierz naklejki
    if (starterMessage.stickers && starterMessage.stickers.size > 0) {
      content.stickers = Array.from(starterMessage.stickers.values()).map(sticker => ({
        name: sticker.name,
        url: sticker.url
      }));
    }
    
    return content;
  } catch (error) {
    logger.error(`Błąd podczas pobierania treści postu forum: ${error.message}`);
    return null;
  }
}

// Funkcja do formatowania treści postu
function formatPostContent(content) {
  if (!content) return '*Nie można pobrać treści*';
  
  let parts = [];
  
  // Dodaj treść tekstową
  if (content.text) {
    parts.push(content.text);
  }
  
  // Dodaj informacje o załącznikach
  if (content.attachments.length > 0) {
    const attachmentInfo = content.attachments.map(a => `📎 ${a.name}`).join(', ');
    parts.push(`\n**Załączniki:** ${attachmentInfo}`);
  }
  
  // Dodaj informacje o embeddach
  if (content.embeds.length > 0) {
    const embedInfo = content.embeds.map(e => {
      let info = [];
      if (e.title) info.push(`"${e.title}"`);
      if (e.description) info.push(e.description.substring(0, 50) + (e.description.length > 50 ? '...' : ''));
      return info.join(' - ');
    }).join(', ');
    parts.push(`\n**Embeddy:** ${embedInfo}`);
  }
  
  // Dodaj informacje o naklejkach
  if (content.stickers.length > 0) {
    const stickerInfo = content.stickers.map(s => `🏷️ ${s.name}`).join(', ');
    parts.push(`\n**Naklejki:** ${stickerInfo}`);
  }
  
  if (parts.length === 0) {
    return '*Post bez treści*';
  }
  
  return parts.join('');
}

module.exports = {
  name: Events.ThreadCreate,
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
      
      // Poczekaj chwilę na pełne załadowanie postu
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Pobierz treść pierwszej wiadomości z postu
      const postContent = await getForumPostContent(thread);
      
      // Przygotuj informacje o autorze
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
          const tag = thread.parent.availableTags.find(t => t.id === tagId);
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
      
      // Sformatuj treść postu
      const formattedContent = formatPostContent(postContent);
      const truncatedContent = formattedContent.length > 1000 
        ? formattedContent.substring(0, 997) + '...' 
        : formattedContent;
      
      // Przygotuj embed z informacjami o nowym poście forum
      const embed = new EmbedBuilder()
        .setTitle('📝 Nowy post na forum')
        .setColor(0x9B59B6)
        .setDescription(`**Tytuł:** ${thread.name}`)
        .addFields(
          { name: '🗂️ Forum', value: `<#${thread.parent.id}> (${thread.parent.name})`, inline: true },
          { name: '👤 Autor', value: authorInfo, inline: true },
          { name: '🏷️ Tagi', value: tagsInfo, inline: false }
        )
        .setTimestamp()
        .setFooter({ text: `ID postu: ${thread.id}` });
      
      // Dodaj treść postu
      if (truncatedContent !== '*Post bez treści*') {
        embed.addFields({ 
          name: '📄 Treść postu', 
          value: truncatedContent,
          inline: false 
        });
      }
      
      // Dodaj link do postu
      embed.addFields({ 
        name: '🔗 Link do postu', 
        value: `[Przejdź do postu](https://discord.com/channels/${thread.guild.id}/${thread.id})`,
        inline: true 
      });
      
      // Dodaj informacje o ustawieniach postu
      const settings = [];
      if (thread.locked) settings.push('🔒 Zablokowany');
      if (thread.pinned) settings.push('📌 Przypięty');
      if (thread.archived) settings.push('📁 Zarchiwizowany');
      if (thread.rateLimitPerUser > 0) settings.push(`🐌 Slowmode: ${thread.rateLimitPerUser}s`);
      
      if (settings.length > 0) {
        embed.addFields({ 
          name: '⚙️ Ustawienia', 
          value: settings.join(' | '),
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
      
      // Dodaj obrazek z załącznika jeśli istnieje
      if (postContent?.attachments?.length > 0) {
        const imageAttachment = postContent.attachments.find(a => 
          a.contentType && a.contentType.startsWith('image/')
        );
        
        if (imageAttachment) {
          embed.setImage(imageAttachment.url);
        }
      }
      
      // Dodaj informacje o liczbie dostępnych tagów w forum
      if (thread.parent.availableTags && thread.parent.availableTags.length > 0) {
        embed.addFields({ 
          name: '📊 Forum ma dostępnych tagów', 
          value: thread.parent.availableTags.length.toString(),
          inline: true 
        });
      }
      
      await logChannel.send({ embeds: [embed] });

      // Zapisz informacje o utworzeniu postu forum do bazy danych
      await logForumPostCreateToDatabase(thread, postContent);

      logger.info(`Zalogowano nowy post forum "${thread.name}" przez ${authorInfo} w ${thread.parent.name}`);

    } catch (error) {
      logger.error(`Błąd podczas logowania nowego postu forum: ${error.stack}`);
    }
  }
};

// Funkcja do zapisywania utworzenia postu forum do bazy danych
async function logForumPostCreateToDatabase(thread, postContent) {
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
        messageId: `forum-post-create-${thread.id}-${Date.now()}`, // Unikalne ID dla utworzenia postu forum
        authorId: thread.ownerId || 'system',
        authorTag: thread.ownerId ? 'Unknown' : 'System',
        content: postContent?.text || '',
        attachments: postContent?.attachments || [],
        embeds: postContent?.embeds || [],
        stickers: postContent?.stickers || [],
        threadLogs: []
      });
    }

    // Dodaj log postu forum
    messageLog.threadLogs.push({
      type: 'forum_post_create',
      threadId: thread.id,
      threadName: thread.name,
      parentId: thread.parent?.id,
      parentName: thread.parent?.name,
      authorId: thread.ownerId,
      authorTag: 'Unknown', // Pobierzemy to później jeśli potrzebne
      isForumPost: true,
      appliedTags: thread.appliedTags || [],
      forumContent: postContent
    });

    await messageLog.save();
    logger.info(`Zapisano utworzenie postu forum ${thread.name} w bazie danych`);
  } catch (error) {
    logger.error(`Błąd podczas zapisywania utworzenia postu forum do bazy danych: ${error.stack}`);
  }
}
