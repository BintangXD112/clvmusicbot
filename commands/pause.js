module.exports = {
  name: 'pause',
  description: 'Menjeda musik yang sedang diputar',
  async execute(message, args, botInstance) {
    const voiceChannel = message.member?.voice.channel;
    if (!voiceChannel) {
      return message.reply({ content: '❌ Kamu harus berada di Voice Channel terlebih dahulu!' });
    }

    const paused = botInstance.musicManager.pause();
    if (paused) {
      message.reply({ content: '⏸️ Musik dijeda.' }).catch(() => null);
    } else {
      message.reply({ content: '❌ Tidak ada musik yang sedang dimainkan untuk dijeda.' }).catch(() => null);
    }
  }
};
