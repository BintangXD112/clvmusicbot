module.exports = {
  name: 'loop',
  description: 'Mengatur mode pengulangan (Loop) lagu',
  async execute(message, args, botInstance) {
    const voiceChannel = message.member?.voice.channel;
    if (!voiceChannel) {
      return message.reply({ content: '❌ Kamu harus berada di Voice Channel terlebih dahulu!' });
    }

    const newMode = botInstance.musicManager.queue.toggleLoop();
    const modesText = {
      off: '🚫 Loop dinonaktifkan.',
      track: '🔂 Mengulang lagu saat ini saja.',
      queue: '🔁 Mengulang seluruh antrean lagu.'
    };

    message.reply({ content: modesText[newMode] || `Mode loop: ${newMode.toUpperCase()}` }).catch(() => null);
  }
};
