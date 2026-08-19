module.exports = {
  name: 'stop',
  description: 'Menghentikan musik, membersihkan queue, dan kembali ke mode AFK',
  async execute(message, args, botInstance) {
    const voiceChannel = message.member?.voice.channel;
    if (!voiceChannel) {
      return message.reply({ content: '❌ Kamu harus berada di Voice Channel terlebih dahulu!' });
    }

    botInstance.musicManager.stop();
    message.reply({ content: '⏹️ Musik dihentikan, queue dibersihkan. Bot kembali ke mode AFK 24/7.' }).catch(() => null);
  }
};
