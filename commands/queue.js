const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'queue',
  description: 'Menampilkan antrean lagu saat ini',
  async execute(message, args, botInstance) {
    const queue = botInstance.musicManager.queue;
    if (queue.songs.length === 0) {
      return message.reply({ content: '📭 Antrean lagu saat ini kosong.' });
    }

    const currentSong = queue.getCurrentSong();
    // Get all songs from current index onwards
    const upcoming = queue.songs.slice(queue.currentIndex + 1);

    const embed = new EmbedBuilder()
      .setColor('#3B82F6')
      .setTitle('📋 Antrean Lagu');

    if (currentSong) {
      embed.addFields({ 
        name: '▶️ Sedang Diputar', 
        value: `**[${currentSong.title}](${currentSong.url})**\noleh ${currentSong.artist}\n*(Diminta oleh: ${currentSong.requestedBy})*` 
      });
    }

    if (upcoming.length > 0) {
      const list = upcoming.slice(0, 10).map((song, index) => {
        return `\`#${index + 1}\` **[${song.title}](${song.url})** — ${song.artist}\n*(Diminta oleh: ${song.requestedBy})*`;
      }).join('\n\n');

      const extraText = upcoming.length > 10 ? `\n\n*...dan ${upcoming.length - 10} lagu berikutnya di queue.*` : '';
      embed.addFields({ name: '⏭️ Antrean Berikutnya', value: list + extraText });
    } else {
      embed.addFields({ name: '⏭️ Antrean Berikutnya', value: 'Tidak ada lagu berikutnya. Gunakan `!music <lagu>` untuk menambah!' });
    }

    embed.addFields(
      { name: 'Total Lagu', value: `${queue.songs.length} lagu`, inline: true },
      { name: 'Loop Mode', value: `🔁 ${queue.loopMode.toUpperCase()}`, inline: true },
      { name: 'Shuffle', value: queue.shuffle ? '🔀 ON' : '➡️ OFF', inline: true }
    );

    message.reply({ embeds: [embed] }).catch(() => null);
  }
};
