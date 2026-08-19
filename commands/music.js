const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const GeminiMusicAgent = require('../ai/GeminiMusicAgent');
const { defaultSource } = require('../music/MusicSource');

module.exports = {
  name: 'music',
  description: 'Memutar musik di Voice Channel',
  async execute(message, args, botInstance) {
    const query = args.join(' ');
    if (!query) {
      return message.reply({ content: '💡 Gunakan: `!music <nama lagu / URL / permintaan natural>`\nContoh: `!music Hindia lagu galau` atau `!music https://www.youtube.com/watch?v=...`' });
    }

    // 1. Check if user is in voice channel
    const voiceChannel = message.member?.voice.channel;
    if (!voiceChannel) {
      return message.reply({ content: '❌ Kamu harus berada di Voice Channel terlebih dahulu!' });
    }

    // 2. Check permissions
    const permissions = voiceChannel.permissionsFor(message.client.user);
    if (!permissions.has(PermissionsBitField.Flags.Connect)) {
      return message.reply({ content: '❌ Aku tidak memiliki izin untuk terhubung (Connect) ke Voice Channel kamu.' });
    }
    if (!permissions.has(PermissionsBitField.Flags.Speak)) {
      return message.reply({ content: '❌ Aku tidak memiliki izin untuk berbicara (Speak) di Voice Channel kamu.' });
    }

    const searchMsg = await message.reply({ content: '🔎 Mencari lagu...' }).catch(() => null);

    try {
      // 3. Get context for Gemini Assistant
      const current = botInstance.musicManager.queue.getCurrentSong();
      const previous = botInstance.musicManager.queue.getPreviousSong();
      const queueSongs = botInstance.musicManager.queue.songs.slice(botInstance.musicManager.queue.currentIndex + 1, botInstance.musicManager.queue.currentIndex + 6);

      const context = {
        currentSong: current,
        previousSong: previous,
        queue: queueSongs
      };

      // 4. Query Gemini API
      const parsed = await GeminiMusicAgent.parseQuery(query, context);
      
      // Helper function to resolve search and play
      const searchAndPlay = async (searchQuery, requestedBy) => {
        const results = await defaultSource.search(searchQuery);
        if (!results || results.length === 0) return null;
        const song = results[0];
        song.requestedBy = requestedBy;
        return song;
      };

      // 5. Handle URL
      if (parsed.type === 'url') {
        const songs = await defaultSource.getMetadata(parsed.url);
        if (!songs || songs.length === 0) {
          if (searchMsg) searchMsg.edit({ content: '❌ Lagu atau playlist tidak ditemukan.' }).catch(() => null);
          return;
        }

        // Add requestedBy details
        songs.forEach(s => s.requestedBy = message.author.tag);

        const firstSong = songs[0];
        const res = await botInstance.musicManager.play(firstSong, voiceChannel, message.channel);

        if (songs.length > 1) {
          // It's a playlist URL
          for (let i = 1; i < songs.length; i++) {
            botInstance.musicManager.queue.add(songs[i]);
          }
          if (searchMsg) {
            searchMsg.edit({ content: `✅ Memutar **${firstSong.title}** & menambahkan **${songs.length - 1}** lagu dari playlist ke queue.` }).catch(() => null);
          }
        } else {
          // Single song URL
          if (res.immediate) {
            if (searchMsg) searchMsg.delete().catch(() => null);
          } else {
            if (searchMsg) {
              const embed = new EmbedBuilder()
                .setColor('#3B82F6')
                .setTitle('➕ Ditambahkan ke Queue')
                .setDescription(`**[${firstSong.title}](${firstSong.url})**\noleh ${firstSong.artist}`)
                .setThumbnail(firstSong.thumbnail)
                .addFields({ name: 'Posisi Queue', value: `#${res.position}`, inline: true })
                .setFooter({ text: 'Discord Premium Music Player' });
              searchMsg.edit({ content: '', embeds: [embed] }).catch(() => null);
            }
          }
        }
        return;
      }

      // 6. Handle playlist query (e.g. "5 lagu dari hindia")
      if (parsed.type === 'playlist' && Array.isArray(parsed.queries) && parsed.queries.length > 0) {
        const firstQuery = parsed.queries[0];
        const firstSong = await searchAndPlay(firstQuery, message.author.tag);
        
        if (!firstSong) {
          if (searchMsg) searchMsg.edit({ content: '❌ Lagu pertama dari playlist tidak ditemukan.' }).catch(() => null);
          return;
        }

        await botInstance.musicManager.play(firstSong, voiceChannel, message.channel);

        if (searchMsg) {
          searchMsg.edit({ content: `🎵 Memulai playlist... Memutar **${firstSong.title}**. Mencari sisa lagu...` }).catch(() => null);
        }

        // Search the remaining queries in background/parallel to avoid locking up
        let successCount = 0;
        for (let i = 1; i < parsed.queries.length; i++) {
          try {
            const song = await searchAndPlay(parsed.queries[i], message.author.tag);
            if (song) {
              botInstance.musicManager.queue.add(song);
              successCount++;
            }
          } catch (_) {}
        }

        if (searchMsg) {
          searchMsg.edit({ content: `✅ Memutar **${firstSong.title}** & menambahkan **${successCount}** lagu playlist lainnya ke queue.` }).catch(() => null);
        }
        return;
      }

      // 7. Handle standard search or recommendation
      const songQuery = parsed.query || query;
      const song = await searchAndPlay(songQuery, message.author.tag);

      if (!song) {
        if (searchMsg) searchMsg.edit({ content: `❌ Lagu tidak ditemukan untuk pencarian: **${songQuery}**` }).catch(() => null);
        return;
      }

      const res = await botInstance.musicManager.play(song, voiceChannel, message.channel);

      if (res.immediate) {
        if (searchMsg) searchMsg.delete().catch(() => null);
      } else {
        if (searchMsg) {
          const embed = new EmbedBuilder()
            .setColor('#3B82F6')
            .setTitle('➕ Ditambahkan ke Queue')
            .setDescription(`**[${song.title}](${song.url})**\noleh ${song.artist}`)
            .setThumbnail(song.thumbnail)
            .addFields({ name: 'Posisi Queue', value: `#${res.position}`, inline: true })
            .setFooter({ text: 'Discord Premium Music Player' });
          searchMsg.edit({ content: '', embeds: [embed] }).catch(() => null);
        }
      }

    } catch (err) {
      botInstance.logError(`Gagal memproses pencarian musik: ${err.message}`);
      if (searchMsg) searchMsg.edit({ content: `❌ Terjadi kesalahan saat mencari lagu: ${err.message}` }).catch(() => null);
    }
  }
};
