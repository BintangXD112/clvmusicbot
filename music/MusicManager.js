const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
const MusicQueue = require('./MusicQueue');
const MusicPlayer = require('./MusicPlayer');
const { defaultSource } = require('./MusicSource');
const { EmbedBuilder } = require('discord.js');

class MusicManager {
  constructor(botInstance) {
    this.botInstance = botInstance;
    this.queue = new MusicQueue();
    this.player = new MusicPlayer();
    
    this.voiceConnection = null;
    this.textChannel = null;
    this.idleTimeout = null;
    this.isActive = false; // Indicates if currently playing music or managing active queue

    this.setupPlayerListeners();
  }

  setupPlayerListeners() {
    this.player.on('trackEnd', () => {
      this.onTrackEnd();
    });

    this.player.on('error', (error) => {
      this.botInstance.logError(`[MUSIC PLAYER ERROR] ${error.message}`);
      if (this.textChannel) {
        this.textChannel.send({ content: `❌ Gagal memutar audio: ${error.message}` }).catch(() => null);
      }
      // Play next song on error
      this.onTrackEnd();
    });
  }

  joinVoice(voiceChannel, textChannel) {
    this.textChannel = textChannel;
    this.isActive = true;
    this.botInstance.isPlayingMusic = true;
    
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: this.botInstance.guildId,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfMute: false, // Must be unmuted to speak!
      selfDeaf: true,  // Deafened is fine since it doesn't listen
      group: this.botInstance.client.user.id
    });

    this.voiceConnection = connection;
    connection.subscribe(this.player.player);
  }

  async play(song, voiceChannel, textChannel) {
    // Only (re)join if we are not already connected to this voice channel
    const existingConnection = getVoiceConnection(this.botInstance.guildId, this.botInstance.client.user.id);
    const alreadyConnected = existingConnection && this.voiceConnection &&
      this.voiceConnection.joinConfig && this.voiceConnection.joinConfig.channelId === voiceChannel.id;

    if (!alreadyConnected) {
      this.joinVoice(voiceChannel, textChannel);
    } else {
      // Already connected – just update text channel reference
      this.textChannel = textChannel;
      this.isActive = true;
      this.botInstance.isPlayingMusic = true;
      if (this.idleTimeout) {
        clearTimeout(this.idleTimeout);
        this.idleTimeout = null;
      }
    }

    const isQueueEmpty = this.queue.isEmpty();
    this.queue.add(song);

    if (isQueueEmpty) {
      // If queue was empty/not playing, play immediately
      this.queue.currentIndex = this.queue.songs.length - 1;
      await this.startPlayback(this.queue.getCurrentSong());
      return { immediate: true };
    } else {
      // Add to queue message
      return { immediate: false, position: this.queue.songs.length - this.queue.currentIndex };
    }
  }

  async startPlayback(song) {
    if (!song) {
      this.onTrackEnd();
      return;
    }

    try {
      this.botInstance.logInfo(`[MUSIC] Memutar lagu: ${song.title} — ${song.artist}`);
      const audioStream = await defaultSource.getAudioStream(song.url);
      
      this.player.playStream(audioStream);

      // Send playing message
      if (this.textChannel) {
        const embed = new EmbedBuilder()
          .setColor('#10B981') // Premium green
          .setTitle('🎵 Mulai Diputar')
          .setDescription(`**[${song.title}](${song.url})**\noleh ${song.artist}`)
          .setThumbnail(song.thumbnail)
          .addFields(
            { name: 'Durasi', value: this.formatDuration(song.duration), inline: true },
            { name: 'Diminta oleh', value: `${song.requestedBy}`, inline: true }
          )
          .setFooter({ text: 'Discord Premium Music Player' });

        this.textChannel.send({ embeds: [embed] }).catch(() => null);
      }
    } catch (error) {
      this.botInstance.logError(`Gagal memulai audio playback untuk ${song.title}: ${error.message}`);
      if (this.textChannel) {
        this.textChannel.send({ content: `❌ Gagal memutar lagu: **${song.title}**. Melanjutkan ke lagu berikutnya...` }).catch(() => null);
      }
      this.onTrackEnd();
    }
  }

  async onTrackEnd() {
    const nextSong = this.queue.next();
    if (nextSong) {
      await this.startPlayback(nextSong);
    } else {
      if (this.textChannel) {
        this.textChannel.send({ content: '📭 Semua lagu di queue telah selesai diputar. Bot akan disconnect dalam 1 menit.' }).catch(() => null);
      }
      this.startIdleTimeout();
    }
  }

  startIdleTimeout() {
    if (this.idleTimeout) clearTimeout(this.idleTimeout);
    const timeoutSec = parseInt(process.env.IDLE_TIMEOUT, 10);
    const timeoutMs = isNaN(timeoutSec) ? 60000 : timeoutSec * 1000;
    this.idleTimeout = setTimeout(() => {
      if (this.textChannel) {
        this.textChannel.send({ content: '💤 Meninggalkan Voice Channel karena tidak ada aktivitas.' }).catch(() => null);
      }
      this.disconnectAndReturnToAFK();
    }, timeoutMs);
  }

  skip() {
    if (this.queue.isEmpty()) return false;
    // stop() already raises _switchingTrack guard inside MusicPlayer,
    // but we also need to advance the queue first so onTrackEnd plays the right song.
    // Let the trackEnd event do the actual advancement – it will call queue.next() which
    // has already been primed. We just stop the current player track.
    this.player.stop(); // triggers AudioPlayerStatus.Idle → trackEnd → onTrackEnd
    return true;
  }

  pause() {
    if (!this.player.isPlaying()) return false;
    this.player.pause();
    return true;
  }

  resume() {
    if (!this.player.isPaused()) return false;
    this.player.resume();
    return true;
  }

  stop() {
    this.disconnectAndReturnToAFK();
    return true;
  }

  cleanup() {
    this.player.stop();
    this.queue.clear();
    
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }

    if (this.voiceConnection) {
      try {
        this.voiceConnection.destroy();
      } catch (_) {}
      this.voiceConnection = null;
    }

    this.isActive = false;
    this.botInstance.isPlayingMusic = false;
  }

  disconnectAndReturnToAFK() {
    this.botInstance.logInfo('[MUSIC] Prosedur disconnect music dan kembali ke AFK dijalankan.');
    this.cleanup();

    // Reset voice target to default voice channel
    this.botInstance.targetVoiceChannelId = this.botInstance.defaultVoiceChannelId;

    // Wait slightly then rejoin AFK channel
    setTimeout(() => {
      if (!this.botInstance.isPlayingMusic && this.botInstance.status !== 'Stopped') {
        this.botInstance.logInfo('[MUSIC] Reconnecting bot ke default Voice Channel AFK...');
        this.botInstance.connectToVoiceChannel();
      }
    }, 1000);
  }

  formatDuration(sec) {
    if (!sec) return '00:00';
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = Math.floor(sec % 60);
    
    if (hrs > 0) {
      return `${hrs}:${mins < 10 ? '0' + mins : mins}:${secs < 10 ? '0' + secs : secs}`;
    }
    return `${mins < 10 ? '0' + mins : mins}:${secs < 10 ? '0' + secs : secs}`;
  }
}

module.exports = MusicManager;
