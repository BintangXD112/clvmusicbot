module.exports = {
  name: 'skip',
  description: 'Melompati lagu yang sedang diputar',
  async execute(message, args, botInstance) {
    const voiceChannel = message.member?.voice.channel;
    if (!voiceChannel) {
      return message.reply({ content: '❌ Kamu harus berada di Voice Channel terlebih dahulu!' });
    }

    const skipped = botInstance.musicManager.skip();
    if (skipped) {
      message.reply({ content: '⏭️ Lagu dilompati.' }).catch(() => null);
    } else {
      message.reply({ content: '❌ Tidak ada lagu di queue yang sedang diputar untuk dilompati.' }).catch(() => null);
    }
  }
};
