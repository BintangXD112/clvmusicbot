module.exports = {
  name: 'shuffle',
  description: 'Mengacak antrean lagu berikutnya',
  async execute(message, args, botInstance) {
    const voiceChannel = message.member?.voice.channel;
    if (!voiceChannel) {
      return message.reply({ content: '❌ Kamu harus berada di Voice Channel terlebih dahulu!' });
    }

    const isShuffled = botInstance.musicManager.queue.toggleShuffle();
    if (isShuffled) {
      message.reply({ content: '🔀 Antrean lagu berikutnya berhasil diacak!' }).catch(() => null);
    } else {
      message.reply({ content: '➡️ Mode acak (shuffle) dinonaktifkan.' }).catch(() => null);
    }
  }
};
