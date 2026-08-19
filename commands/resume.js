module.exports = {
  name: 'resume',
  description: 'Melanjutkan musik yang dijeda',
  async execute(message, args, botInstance) {
    const voiceChannel = message.member?.voice.channel;
    if (!voiceChannel) {
      return message.reply({ content: '❌ Kamu harus berada di Voice Channel terlebih dahulu!' });
    }

    const resumed = botInstance.musicManager.resume();
    if (resumed) {
      message.reply({ content: '▶️ Musik dilanjutkan.' }).catch(() => null);
    } else {
      message.reply({ content: '❌ Musik tidak dijeda atau tidak ada musik aktif.' }).catch(() => null);
    }
  }
};
