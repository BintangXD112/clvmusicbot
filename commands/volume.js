module.exports = {
  name: 'volume',
  description: 'Mengubah atau melihat volume audio bot (0-100)',
  async execute(message, args, botInstance) {
    const voiceChannel = message.member?.voice.channel;
    if (!voiceChannel) {
      return message.reply({ content: '❌ Kamu harus berada di Voice Channel terlebih dahulu!' });
    }

    const currentVolume = botInstance.musicManager.player.getVolumePercent();

    if (args.length === 0) {
      return message.reply({ content: `🔊 Volume suara bot saat ini: **${currentVolume}%**` });
    }

    const volumeLevel = parseInt(args[0], 10);
    if (isNaN(volumeLevel) || volumeLevel < 0 || volumeLevel > 100) {
      return message.reply({ content: '❌ Gunakan angka antara **0** dan **100** untuk mengatur volume.' });
    }

    const newVolume = botInstance.musicManager.player.setVolume(volumeLevel);
    message.reply({ content: `🔊 Volume berhasil diubah dari **${currentVolume}%** menjadi **${newVolume}%**.` }).catch(() => null);
  }
};
