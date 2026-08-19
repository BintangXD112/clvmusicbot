const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'help',
  description: 'Menampilkan daftar perintah bot musik',
  async execute(message, args, botInstance) {
    const prefix = process.env.MUSIC_PREFIX || '!';

    const embed = new EmbedBuilder()
      .setColor('#10B981')
      .setTitle('📚 Panduan Perintah Musik')
      .setDescription(`Gunakan prefix \`${prefix}\` untuk menjalankan perintah musik di bawah ini:`)
      .addFields(
        { name: `🎵 ${prefix}music <query/URL/permintaan>`, value: 'Memutar musik/playlist (YouTube). Mendukung pencarian natural (misal: "putar 5 lagu hindia" atau "lagu galau hindia" atau "yang mirip lagu ini").' },
        { name: `⏭️ ${prefix}skip`, value: 'Melompati lagu yang sedang diputar ke lagu berikutnya di antrean.' },
        { name: `⏸️ ${prefix}pause`, value: 'Menjeda (pause) pemutaran musik.' },
        { name: `▶️ ${prefix}resume`, value: 'Melanjutkan pemutaran musik yang dijeda.' },
        { name: `⏹️ ${prefix}stop`, value: 'Menghentikan musik, mengosongkan seluruh antrean, dan mengembalikan bot ke channel AFK.' },
        { name: `📋 ${prefix}queue`, value: 'Melihat daftar antrean lagu saat ini.' },
        { name: `🔍 ${prefix}nowplaying`, value: 'Menampilkan informasi lagu yang sedang diputar.' },
        { name: `🔊 ${prefix}volume [0-100]`, value: 'Mengatur volume pemutaran musik bot.' },
        { name: `🔁 ${prefix}loop`, value: 'Mengubah mode loop (OFF ➡️ TRACK ➡️ QUEUE).' },
        { name: `🔀 ${prefix}shuffle`, value: 'Mengacak urutan antrean lagu berikutnya.' },
        { name: `📚 ${prefix}help`, value: 'Menampilkan panduan bantuan perintah ini.' },
        { name: '\u200b', value: '**⚙️ Command Admin** *(Butuh izin Manage Server)*' },
        { name: `🔇 ${prefix}disablemusic`, value: 'Menonaktifkan fitur musik. Semua command musik akan menampilkan pesan "sedang dalam perbaikan".' },
        { name: `🔊 ${prefix}enablemusic`, value: 'Mengaktifkan kembali fitur musik setelah di-disable.' }
      )
      .setFooter({ text: 'Discord Premium Music Bot' });

    message.reply({ embeds: [embed] }).catch(() => null);
  }
};
