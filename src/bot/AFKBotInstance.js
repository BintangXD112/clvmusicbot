'use strict';
/**
 * src/bot/AFKBotInstance.js
 * Class AFKBotInstance: satu instance bot Discord AFK yang berjalan 24/7.
 * Mengelola koneksi voice, command handler, music manager, dan presence.
 */

const fs   = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection
} = require('@discordjs/voice');

const { addLog }      = require('../logger');
const MusicManager    = require('../../music/MusicManager');
const LOG_COLORS      = require('../colors');

// ─────────────────────────────────────────────────────────────────────────────
// SHARED STATE (module-level → shared across all bot instances in one process)
// ─────────────────────────────────────────────────────────────────────────────

/** Mencegah multiple bot menangani pesan yang sama. */
const handledMessageIds = new Set();

/** Toggle fitur musik. Dapat diubah via !disablemusic / !enablemusic. */
let MUSIC_DISABLED = (process.env.MUSIC_DISABLED === 'true');

// ─────────────────────────────────────────────────────────────────────────────
// Helper: otorisasi admin
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cek apakah member Discord berhak menjalankan admin command.
 * Priority: OWNER_IDS env var (comma-separated IDs).
 * Fallback: ManageGuild permission.
 * @param {import('discord.js').GuildMember} member
 * @returns {boolean}
 */
function isOwnerOrAdmin(member) {
  const ownerIdsRaw = process.env.OWNER_IDS || '';
  const ownerIds    = ownerIdsRaw.split(',').map(id => id.trim()).filter(Boolean);
  if (ownerIds.length > 0) return ownerIds.includes(member.user.id);
  return member.permissions.has('ManageGuild');
}

// ─────────────────────────────────────────────────────────────────────────────
// Class AFKBotInstance
// ─────────────────────────────────────────────────────────────────────────────

class AFKBotInstance {
  constructor(config, index) {
    this.index  = index;
    this.name   = config.name || `Bot #${index + 1}`;
    this.token  = config.token;
    this.guildId = config.guildId;

    this.defaultVoiceChannelId = config.voiceChannelId;
    this.targetVoiceChannelId  = config.voiceChannelId;
    this.targetUserId          = config.targetUserId || null;
    this.allowMove             = config.allowMove !== false;

    this.selfMute = config.selfMute !== undefined ? !!config.selfMute : true;
    this.selfDeaf = config.selfDeaf !== undefined ? !!config.selfDeaf : true;

    this.presenceType = config.presenceType || 'WATCHING';
    this.presenceText = config.presenceText || 'Dashboard';

    this.isConnecting        = false;
    this.status              = config.stopped ? 'Stopped' : 'Connecting';
    this.reconnectTimer      = null;
    this.healthInterval      = null;
    this.botTag              = this.name;
    this.guildName           = null;
    this.connectedChannelName = null;

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    });

    this.musicManager   = new MusicManager(this);
    this.isPlayingMusic = false;
    this.commands       = new Map();
    this.loadCommands();
    this.setupEvents();
  }

  // ── Presence ──────────────────────────────────────────────────────────────

  updatePresence() {
    if (!this.client || !this.client.isReady()) return;
    try {
      const typeMap = {
        PLAYING:   ActivityType.Playing,
        LISTENING: ActivityType.Listening,
        WATCHING:  ActivityType.Watching,
        COMPETING: ActivityType.Competing,
        CUSTOM:    ActivityType.Custom
      };
      const activityType = typeMap[String(this.presenceType).toUpperCase()] !== undefined
        ? typeMap[String(this.presenceType).toUpperCase()]
        : ActivityType.Watching;

      const activityText = this.presenceText || 'Dashboard';
      this.client.user.setPresence({
        activities: [{ name: activityText, type: activityType }],
        status: 'online'
      });
      this.logInfo(`[PRESENCE] Mengatur presence ke: ${this.presenceType} - "${activityText}"`);
    } catch (err) {
      this.logError(`Gagal memperbarui status presence: ${err.message}`);
    }
  }

  // ── Logger helpers ─────────────────────────────────────────────────────────

  log(level, color, message, extra = '') {
    const prefix = `${color}[${this.botTag}]${LOG_COLORS.reset}`;
    console.log(`${prefix} ${message}`, extra);
    addLog(level, this.botTag, message, extra);
  }

  logError(message, extra = '')   { this.log('ERROR',   LOG_COLORS.red,    `[ERROR] ${message}`, extra); }
  logWarn(message, extra = '')    { this.log('WARN',    LOG_COLORS.yellow,  `[WARN] ${message}`,  extra); }
  logSuccess(message, extra = '') { this.log('SUCCESS', LOG_COLORS.green,   `${message}`,         extra); }
  logInfo(message, extra = '')    { this.log('INFO',    LOG_COLORS.cyan,    `${message}`,         extra); }

  // ── Commands ───────────────────────────────────────────────────────────────

  loadCommands() {
    const commandsPath = path.join(__dirname, '..', '..', 'commands');
    if (!fs.existsSync(commandsPath)) fs.mkdirSync(commandsPath);

    const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
    for (const file of commandFiles) {
      try {
        const filePath = path.join(commandsPath, file);
        delete require.cache[require.resolve(filePath)];
        const command = require(filePath);
        if (command.name && typeof command.execute === 'function') {
          this.commands.set(command.name, command);
          this.logInfo(`Command loaded: !${command.name}`);
        }
      } catch (err) {
        this.logError(`Gagal memuat command ${file}:`, err.message);
      }
    }
  }

  // ── Discord Event Setup ────────────────────────────────────────────────────

  setupEvents() {
    // ─ Ready ─
    this.client.once('ready', async () => {
      this.status = 'Online';
      this.botTag = `${this.name} (${this.client.user.tag})`;
      this.logSuccess(`===========================================`);
      this.logSuccess(`✅ Bot Online & Siap AFK! Logged in as: ${this.client.user.tag}`);
      if (this.targetUserId) this.logInfo(`🎯 Mode Auto-Follow Aktif untuk User ID: ${this.targetUserId}`);
      this.logSuccess(`===========================================`);

      try {
        const g = await this.client.guilds.fetch(this.guildId).catch(() => null);
        if (g) this.guildName = g.name;
      } catch (_) {}

      this.connectToVoiceChannel();
      this.updatePresence();

      // Health check setiap 30 detik
      if (this.healthInterval) clearInterval(this.healthInterval);
      this.healthInterval = setInterval(() => {
        if (this.status === 'Stopped' || this.isPlayingMusic) return;
        const conn = getVoiceConnection(this.guildId, this.client.user.id);
        if (!conn || conn.state.status === VoiceConnectionStatus.Destroyed) {
          this.logWarn(`[HEALTH CHECK] Bot tidak berada di Voice Channel. Reconnecting...`);
          this.connectToVoiceChannel();
        }
      }, 30_000);
    });

    // ─ Message Commands ─
    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      const prefix = process.env.MUSIC_PREFIX || '!';
      if (!message.content.startsWith(prefix)) return;

      const args        = message.content.slice(prefix.length).trim().split(/ +/);
      const commandName = args.shift().toLowerCase();

      // Deduplication: hanya bot pertama yang menangani pesan yang sama
      const msgKey = `${message.id}:${commandName}`;
      if (handledMessageIds.has(msgKey)) return;
      handledMessageIds.add(msgKey);
      setTimeout(() => handledMessageIds.delete(msgKey), 10_000);

      // ── Toggle musik ───────────────────────────────────────────────────────
      if (commandName === 'disablemusic') {
        if (!isOwnerOrAdmin(message.member)) {
          return message.reply({ content: '❌ Kamu tidak punya izin untuk melakukan ini. Hanya Owner yang terdaftar yang bisa menggunakan command ini.' }).catch(() => null);
        }
        MUSIC_DISABLED = true;
        process.env.MUSIC_DISABLED = 'true';
        return message.reply({ content: '🔇 **Fitur musik dinonaktifkan.** Semua command musik tidak akan berfungsi sampai `!enablemusic` dijalankan.' }).catch(() => null);
      }

      if (commandName === 'enablemusic') {
        if (!isOwnerOrAdmin(message.member)) {
          return message.reply({ content: '❌ Kamu tidak punya izin untuk melakukan ini. Hanya Owner yang terdaftar yang bisa menggunakan command ini.' }).catch(() => null);
        }
        MUSIC_DISABLED = false;
        process.env.MUSIC_DISABLED = 'false';
        return message.reply({ content: '🔊 **Fitur musik diaktifkan kembali.** Bot siap memutar lagu!' }).catch(() => null);
      }

      // ── Musik disabled guard ───────────────────────────────────────────────
      const musicCommands = ['music', 'skip', 'stop', 'pause', 'resume', 'queue', 'nowplaying', 'volume', 'shuffle', 'loop'];
      if (MUSIC_DISABLED && musicCommands.includes(commandName)) {
        return message.reply({
          content: '🔧 **Fitur musik sedang dalam perbaikan.** Gunakan `!enablemusic` untuk mengaktifkan kembali (admin only).'
        }).catch(() => null);
      }

      const command = this.commands.get(commandName);
      if (!command) return;

      try {
        await command.execute(message, args, this);
      } catch (error) {
        this.logError(`Gagal menjalankan command !${commandName}: ${error.message}`);
        message.reply({ content: `❌ Terjadi kesalahan saat menjalankan command ini: ${error.message}` }).catch(() => null);
      }
    });

    // ─ Voice State Update ─
    this.client.on('voiceStateUpdate', (oldState, newState) => {
      // Skenario A: Target user yang di-follow pindah VC
      if (this.targetUserId && newState.id === this.targetUserId) {
        const userChannelId = newState.channelId;
        if (userChannelId && userChannelId !== this.targetVoiceChannelId) {
          this.logInfo(`[FOLLOW] Target User (${newState.member?.user?.tag || this.targetUserId}) pindah ke VC baru (${userChannelId}). Mengikuti...`);
          this.targetVoiceChannelId = userChannelId;
          this.scheduleInstantReconnect(300);
        } else if (!userChannelId && this.targetVoiceChannelId !== this.defaultVoiceChannelId) {
          this.logInfo(`[FOLLOW] Target User keluar dari VC. Kembali ke Default VC (${this.defaultVoiceChannelId})...`);
          this.targetVoiceChannelId = this.defaultVoiceChannelId;
          this.scheduleInstantReconnect(300);
        }
        return;
      }

      // Skenario B: Event berkaitan dengan bot ini sendiri
      if (newState.id !== this.client.user?.id) return;

      if (this.isPlayingMusic) {
        if (!newState.channelId) {
          this.logWarn(`[EVENT] Bot musik terputus dari Voice Channel secara eksternal. Membersihkan state musik...`);
          if (this.musicManager) this.musicManager.cleanup();
          this.isPlayingMusic = false;
          this.scheduleInstantReconnect(1000);
        }
        return;
      }

      const currentChannelId = newState.channelId;

      if (!currentChannelId) {
        this.connectedChannelName = null;
        this.logWarn(`[EVENT] Bot terputus/dikeluarkan dari Voice Channel.`);
        if (this.targetVoiceChannelId !== this.defaultVoiceChannelId) {
          this.logInfo(`[TEMP-VC] Reset target VC kembali ke Default VC (${this.defaultVoiceChannelId})...`);
          this.targetVoiceChannelId = this.defaultVoiceChannelId;
        }
        this.scheduleInstantReconnect(500);
        return;
      }

      if (currentChannelId !== this.targetVoiceChannelId) {
        if (this.allowMove) {
          this.logSuccess(`[TEMP-VC / MOVE] Bot dipindahkan ke Voice Channel baru (${currentChannelId}). Menetap di VC ini.`);
          this.targetVoiceChannelId = currentChannelId;
        } else {
          this.logWarn(`[EVENT] Bot dipindahkan ke VC lain (${currentChannelId}). Kembali ke VC asal (${this.targetVoiceChannelId})...`);
          this.scheduleInstantReconnect(500);
        }
      }
    });

    // ─ Error ─
    this.client.on('error', (err) => {
      this.status = 'Error';
      this.logError(`Discord Client Error:`, err.message);
    });
  }

  // ── Voice Connection ───────────────────────────────────────────────────────

  async connectToVoiceChannel() {
    if (this.isConnecting || this.status === 'Stopped') return;
    this.isConnecting = true;

    const targetVC = this.targetVoiceChannelId || this.defaultVoiceChannelId;

    try {
      const guild = await this.client.guilds.fetch(this.guildId).catch(() => null);
      if (!guild) {
        this.logError(`Server/Guild dengan ID ${this.guildId} tidak ditemukan.`);
        this.isConnecting = false;
        this.status = 'Error';
        return;
      }
      this.guildName = guild.name;

      const channel = await guild.channels.fetch(targetVC).catch(() => null);
      if (!channel || !channel.isVoiceBased()) {
        this.logWarn(`Voice Channel dengan ID ${targetVC} tidak ditemukan/sudah dihapus. Reset ke Default VC (${this.defaultVoiceChannelId})...`);
        this.targetVoiceChannelId = this.defaultVoiceChannelId;
        this.isConnecting = false;
        if (targetVC !== this.defaultVoiceChannelId) this.scheduleInstantReconnect(500);
        return;
      }

      this.connectedChannelName = channel.name;
      this.logInfo(`[VOICE] Mencoba masuk ke Voice Channel: "${channel.name}" (${channel.id})...`);

      const connection = joinVoiceChannel({
        channelId:       channel.id,
        guildId:         guild.id,
        adapterCreator:  guild.voiceAdapterCreator,
        selfMute:        this.selfMute,
        selfDeaf:        this.selfDeaf,
        group:           this.client.user.id
      });

      connection.on(VoiceConnectionStatus.Ready, () => {
        this.logSuccess(`[SUCCESS] Berhasil masuk ke VC "${channel.name}" & stay AFK 24/7!`);
        this.isConnecting = false;
        this.status = 'Online';
      });

      connection.on(VoiceConnectionStatus.Disconnected, async () => {
        this.logWarn(`Terputus dari Voice Channel. Memulai prosedur Auto-Reconnect...`);
        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5_000)
          ]);
          this.logSuccess(`[RECOVERED] Koneksi Voice berhasil dipulihkan secara otomatis.`);
        } catch {
          this.logWarn(`Pemulihan otomatis gagal. Membuat ulang koneksi instan...`);
          try { connection.destroy(); } catch (_) {}
          this.isConnecting = false;
          this.scheduleInstantReconnect();
        }
      });

      connection.on(VoiceConnectionStatus.Destroyed, () => {
        this.logWarn(`Koneksi Voice dihancurkan. Menghubungkan kembali...`);
        this.isConnecting = false;
        if (this.status !== 'Stopped') this.scheduleInstantReconnect();
      });

    } catch (error) {
      this.logError(`Gagal saat menghubungkan ke Voice Channel: ${error.message}`);
      this.isConnecting = false;
      this.scheduleInstantReconnect();
    }
  }

  scheduleInstantReconnect(delayMs = 1000) {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.status === 'Stopped') return;
    this.reconnectTimer = setTimeout(() => this.connectToVoiceChannel(), delayMs);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async start() {
    this.status = 'Connecting';
    this.logInfo(`Memulai proses login bot...`);
    try {
      await this.client.login(this.token);
    } catch (err) {
      this.status = 'Error';
      this.logError(`Gagal Login ke Discord! Periksa Token Bot Anda.`, err.message);
    }
  }

  destroy() {
    this.status = 'Stopped';
    if (this.healthInterval) clearInterval(this.healthInterval);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const connection = getVoiceConnection(this.guildId, this.client.user?.id);
    if (connection) try { connection.destroy(); } catch (_) {}
    try { this.client.destroy(); } catch (_) {}
  }

  // ── Management Actions ─────────────────────────────────────────────────────

  async moveVoiceChannel(newVoiceChannelId) {
    if (this.isPlayingMusic && this.musicManager) {
      this.musicManager.cleanup();
      this.isPlayingMusic = false;
    }
    this.targetVoiceChannelId  = newVoiceChannelId;
    this.defaultVoiceChannelId = newVoiceChannelId;
    this.logInfo(`[ADMIN] Memindahkan bot ke Voice Channel baru (${newVoiceChannelId})...`);
    this.destroyVoiceConnection();
    await this.connectToVoiceChannel();
    return true;
  }

  destroyVoiceConnection() {
    const connection = getVoiceConnection(this.guildId, this.client.user?.id);
    if (connection) try { connection.destroy(); } catch (_) {}
  }

  async fetchGuildVoiceChannels() {
    if (!this.client.isReady()) return null;
    try {
      const guild = await this.client.guilds.fetch(this.guildId);
      if (!guild) return null;
      const channels      = await guild.channels.fetch();
      const voiceChannels = [];
      channels.forEach(ch => {
        if (ch && ch.isVoiceBased()) {
          voiceChannels.push({
            id:          ch.id,
            name:        ch.name,
            memberCount: ch.members ? ch.members.size : 0,
            isCurrent:   ch.id === this.targetVoiceChannelId
          });
        }
      });
      return voiceChannels.sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      this.logError(`Gagal mengambil Voice Channels: ${err.message}`);
      return null;
    }
  }

  setSelfMute(muteState) {
    this.selfMute = !!muteState;
    const connection = getVoiceConnection(this.guildId, this.client.user?.id);
    if (connection) this.connectToVoiceChannel(); // Re-join with updated state
    return true;
  }

  setSelfDeaf(deafState) {
    this.selfDeaf = !!deafState;
    const connection = getVoiceConnection(this.guildId, this.client.user?.id);
    if (connection) this.connectToVoiceChannel(); // Re-join with updated state
    return true;
  }

  // ── Status ─────────────────────────────────────────────────────────────────

  getStatusSummary() {
    return {
      index:                this.index,
      name:                 this.name,
      token:                this.token,
      guildId:              this.guildId,
      guildName:            this.guildName || this.guildId,
      defaultVoiceChannelId: this.defaultVoiceChannelId,
      targetVoiceChannelId:  this.targetVoiceChannelId,
      connectedChannelId:    this.targetVoiceChannelId,
      connectedChannelName:  this.connectedChannelName || this.targetVoiceChannelId,
      targetUserId:          this.targetUserId,
      allowMove:             this.allowMove,
      status:                this.status,
      ping:                  this.client.ws ? this.client.ws.ping : 0,
      avatar:                this.client.user ? this.client.user.displayAvatarURL() : null,
      tag:                   this.client.user ? this.client.user.tag                : null,
      id:                    this.client.user ? this.client.user.id                 : null,
      selfMute:              this.selfMute,
      selfDeaf:              this.selfDeaf,
      presenceType:          this.presenceType,
      presenceText:          this.presenceText
    };
  }
}

module.exports = AFKBotInstance;
