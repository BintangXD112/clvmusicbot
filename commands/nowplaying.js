const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'nowplaying',
  description: 'Menampilkan informasi lagu yang sedang diputar',
  async execute(message, args, botInstance) {
    const currentSong = botInstance.musicManager.queue.getCurrentSong();
    if (!currentSong) {
      return message.reply({ content: '❌ Tidak ada musik yang sedang diputar saat ini.' });
    }

    const embed = new EmbedBuilder()
      .setColor('#10B981')
      .setTitle('🎵 Sedang Diputar')
      .setDescription(`**[${currentSong.title}](${currentSong.url})**\noleh ${currentSong.artist}`)
      .setThumbnail(currentSong.thumbnail)
      .addFields(
        { name: 'Diminta oleh', value: `${currentSong.requestedBy}`, inline: true },
        { name: 'Durasi', value: botInstance.musicManager.formatDuration(currentSong.duration), inline: true },
        { name: 'Loop Mode', value: `🔁 ${botInstance.musicManager.queue.loopMode.toUpperCase()}`, inline: true }
      )
      .setFooter({ text: 'Discord Premium Music Player' });

    message.reply({ embeds: [embed] }).catch(() => null);
  }
};
