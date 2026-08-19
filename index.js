require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
const { 
  joinVoiceChannel, 
  VoiceConnectionStatus, 
  entersState, 
  getVoiceConnection 
} = require('@discordjs/voice');

// Import Logger & Web Server
const { addLog } = require('./src/logger');
const { createWebServer } = require('./src/webServer');
const MusicManager = require('./music/MusicManager');

// -------------------------------------------------------------
// SHARED STATE: Prevents multiple bots from handling the same message
// Since all bots run in the same Node.js process, this Set is shared in memory.
// -------------------------------------------------------------
const handledMessageIds = new Set();

// Music feature toggle — set to true to disable all music commands
let MUSIC_DISABLED = (process.env.MUSIC_DISABLED === 'true');

/**
 * Check if a Discord member is authorized to run admin music commands.
 * Priority: OWNER_IDS env variable (comma-separated Discord user IDs).
 * Fallback: ManageGuild server permission (if OWNER_IDS is not set).
 */
function isOwnerOrAdmin(member) {
  const ownerIdsRaw = process.env.OWNER_IDS || '';
  const ownerIds = ownerIdsRaw.split(',').map(id => id.trim()).filter(Boolean);
  if (ownerIds.length > 0) {
    return ownerIds.includes(member.user.id);
  }
  // Fallback: allow anyone with ManageGuild permission
  return member.permissions.has('ManageGuild');
}

// -------------------------------------------------------------
// 1. Helper Log Formatters & Configuration Loader
// -------------------------------------------------------------
const LOG_COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

const BOTS_JSON_PATH = path.join(__dirname, 'bots.json');

/**
 * Load bot configurations from bots.json, numbered .env, or legacy single .env
 */
function loadBotConfigurations() {
  const botsConfig = [];

  // Check 1: bots.json file
  if (fs.existsSync(BOTS_JSON_PATH)) {
    try {
      const rawData = fs.readFileSync(BOTS_JSON_PATH, 'utf8');
      const parsed = JSON.parse(rawData);
      if (Array.isArray(parsed) && parsed.length > 0) {
        parsed.forEach((b, idx) => {
          if (b.token && b.guildId && b.voiceChannelId && b.token !== 'YOUR_BOT_TOKEN_1') {
            botsConfig.push({
              name: b.name || `Bot #${idx + 1}`,
              token: b.token.trim(),
              guildId: b.guildId.trim(),
              voiceChannelId: b.voiceChannelId.trim(),
              targetUserId: b.targetUserId || b.followUserId || null,
              allowMove: b.allowMove !== undefined ? b.allowMove : true,
              selfMute: b.selfMute !== undefined ? !!b.selfMute : true,
              selfDeaf: b.selfDeaf !== undefined ? !!b.selfDeaf : true,
              stopped: b.stopped !== undefined ? !!b.stopped : false
            });
          }
        });
      }
    } catch (err) {
      console.error(`${LOG_COLORS.red}[ERROR] Gagal membaca bots.json:${LOG_COLORS.reset}`, err.message);
    }
  }

  if (botsConfig.length > 0) {
    return botsConfig;
  }

  // Check 2: Numbered environment variables (BOT_1_TOKEN, BOT_2_TOKEN, etc.)
  const numberedBotsMap = {};
  for (const [key, val] of Object.entries(process.env)) {
    if (!val || val.trim() === '') continue;
    const match = key.match(/^BOT_(\d+)_(TOKEN|GUILD_ID|VOICE_CHANNEL_ID|TARGET_USER_ID|FOLLOW_USER_ID)$/);
    if (match) {
      const botIndex = match[1];
      const fieldType = match[2];
      if (!numberedBotsMap[botIndex]) {
        numberedBotsMap[botIndex] = { name: `Bot #${botIndex}`, allowMove: true, selfMute: true, selfDeaf: true, stopped: false };
      }
      if (fieldType === 'TOKEN') numberedBotsMap[botIndex].token = val.trim();
      if (fieldType === 'GUILD_ID') numberedBotsMap[botIndex].guildId = val.trim();
      if (fieldType === 'VOICE_CHANNEL_ID') numberedBotsMap[botIndex].voiceChannelId = val.trim();
      if (fieldType === 'TARGET_USER_ID' || fieldType === 'FOLLOW_USER_ID') numberedBotsMap[botIndex].targetUserId = val.trim();
    }
  }

  const numberedIndices = Object.keys(numberedBotsMap).sort((a, b) => Number(a) - Number(b));
  for (const idx of numberedIndices) {
    const b = numberedBotsMap[idx];
    if (b.token && b.guildId && b.voiceChannelId) {
      botsConfig.push(b);
    }
  }

  if (botsConfig.length > 0) {
    return botsConfig;
  }

  // Check 3: Legacy Single Bot (.env DISCORD_TOKEN, GUILD_ID, VOICE_CHANNEL_ID, TARGET_USER_ID)
  const legacyToken = process.env.DISCORD_TOKEN;
  const legacyGuildId = process.env.GUILD_ID;
  const legacyVCId = process.env.VOICE_CHANNEL_ID;
  const legacyTargetUser = process.env.TARGET_USER_ID || process.env.FOLLOW_USER_ID || null;

  if (
    legacyToken && 
    legacyGuildId && 
    legacyVCId && 
    legacyToken !== 'your_bot_token_here' && 
    legacyGuildId !== 'your_guild_id_here' && 
    legacyVCId !== 'your_voice_channel_id_here'
  ) {
    botsConfig.push({
      name: 'Bot #1',
      token: legacyToken.trim(),
      guildId: legacyGuildId.trim(),
      voiceChannelId: legacyVCId.trim(),
      targetUserId: legacyTargetUser ? legacyTargetUser.trim() : null,
      allowMove: true,
      selfMute: true,
      selfDeaf: true,
      stopped: false
    });
  }

  return botsConfig;
}

/**
 * Save configurations back to bots.json
 */
function saveBotConfigurations(configs) {
  try {
    fs.writeFileSync(BOTS_JSON_PATH, JSON.stringify(configs, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`${LOG_COLORS.red}[ERROR] Gagal menyimpan bots.json:${LOG_COLORS.reset}`, err.message);
    return false;
  }
}

// -------------------------------------------------------------
// 2. AFK Bot Instance Class (Full Controlled & Monitored)
// -------------------------------------------------------------
class AFKBotInstance {
  constructor(config, index) {
    this.index = index;
    this.name = config.name || `Bot #${index + 1}`;
    this.token = config.token;
    this.guildId = config.guildId;

    this.defaultVoiceChannelId = config.voiceChannelId;
    this.targetVoiceChannelId = config.voiceChannelId;
    this.targetUserId = config.targetUserId || null;
    this.allowMove = config.allowMove !== false;

    this.selfMute = config.selfMute !== undefined ? !!config.selfMute : true;
    this.selfDeaf = config.selfDeaf !== undefined ? !!config.selfDeaf : true;

    this.isConnecting = false;
    this.status = config.stopped ? 'Stopped' : 'Connecting'; // 'Connecting', 'Online', 'Disconnected', 'Stopped', 'Error'
    this.reconnectTimer = null;
    this.healthInterval = null;
    this.botTag = this.name;
    this.guildName = null;
    this.connectedChannelName = null;

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    });

    this.musicManager = new MusicManager(this);
    this.isPlayingMusic = false;
    this.commands = new Map();
    this.loadCommands();

    this.setupEvents();
  }

  log(level, color, message, extra = '') {
    const prefix = `${color}[${this.botTag}]${LOG_COLORS.reset}`;
    console.log(`${prefix} ${message}`, extra);
    addLog(level, this.botTag, message, extra);
  }

  logError(message, extra = '') { this.log('ERROR', LOG_COLORS.red, `[ERROR] ${message}`, extra); }
  logWarn(message, extra = '') { this.log('WARN', LOG_COLORS.yellow, `[WARN] ${message}`, extra); }
  logSuccess(message, extra = '') { this.log('SUCCESS', LOG_COLORS.green, `${message}`, extra); }
  logInfo(message, extra = '') { this.log('INFO', LOG_COLORS.cyan, `${message}`, extra); }
  loadCommands() {
    const commandsPath = path.join(__dirname, 'commands');
    if (!fs.existsSync(commandsPath)) {
      fs.mkdirSync(commandsPath);
    }
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
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

  setupEvents() {
    this.client.once('ready', async () => {
      this.status = 'Online';
      this.botTag = `${this.name} (${this.client.user.tag})`;
      this.logSuccess(`===========================================`);
      this.logSuccess(`✅ Bot Online & Siap AFK! Logged in as: ${this.client.user.tag}`);
      if (this.targetUserId) {
        this.logInfo(`🎯 Mode Auto-Follow Aktif untuk User ID: ${this.targetUserId}`);
      }
      this.logSuccess(`===========================================`);

      // Fetch Guild info for display
      try {
        const g = await this.client.guilds.fetch(this.guildId).catch(() => null);
        if (g) this.guildName = g.name;
      } catch (_) {}

      // Connect to Voice Channel
      this.connectToVoiceChannel();

      // Health check interval every 30 seconds
      if (this.healthInterval) clearInterval(this.healthInterval);
      this.healthInterval = setInterval(() => {
        if (this.status === 'Stopped') return;
        // Do not force AFK channel if currently playing music
        if (this.isPlayingMusic) return;
        const activeConnection = getVoiceConnection(this.guildId, this.client.user.id);
        if (!activeConnection || activeConnection.state.status === VoiceConnectionStatus.Destroyed) {
          this.logWarn(`[HEALTH CHECK] Bot terdeteksi tidak berada di Voice Channel. Reconnecting...`);
          this.connectToVoiceChannel();
        }
      }, 30_000);
    });

    // Message command listener
    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      const prefix = process.env.MUSIC_PREFIX || '!';
      if (!message.content.startsWith(prefix)) return;

      const args = message.content.slice(prefix.length).trim().split(/ +/);
      const commandName = args.shift().toLowerCase();

      // --- DEDUPLICATION GUARD ---
      // Multiple bots in the same guild will each see this message.
      // Only the FIRST bot to claim the message ID gets to handle it.
      const msgKey = `${message.id}:${commandName}`;
      if (handledMessageIds.has(msgKey)) return;
      handledMessageIds.add(msgKey);
      // Auto-cleanup after 10 seconds to avoid memory leak
      setTimeout(() => handledMessageIds.delete(msgKey), 10_000);

      // --- DISABLEMUSIC / ENABLEMUSIC (owner/admin only) ---
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

      // --- MUSIC DISABLED CHECK ---
      const musicCommands = ['music','skip','stop','pause','resume','queue','nowplaying','volume','shuffle','loop'];
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


    // Voice State Update Listener: TempVoice / Moved VC / Auto-Follow User
    this.client.on('voiceStateUpdate', (oldState, newState) => {
      // Scenario A: Event dari User Target yang di-follow
      if (this.targetUserId && newState.id === this.targetUserId) {
        const userChannelId = newState.channelId;
        if (userChannelId && userChannelId !== this.targetVoiceChannelId) {
          this.logInfo(`[FOLLOW] Target User (${newState.member?.user?.tag || this.targetUserId}) pindah/membuat VC baru (${userChannelId}). Mengikuti...`);
          this.targetVoiceChannelId = userChannelId;
          this.scheduleInstantReconnect(300);
        } else if (!userChannelId && this.targetVoiceChannelId !== this.defaultVoiceChannelId) {
          this.logInfo(`[FOLLOW] Target User keluar dari VC. Kembali ke Default VC (${this.defaultVoiceChannelId})...`);
          this.targetVoiceChannelId = this.defaultVoiceChannelId;
          this.scheduleInstantReconnect(300);
        }
        return;
      }

      // Scenario B: Event berkaitan dengan Bot ini sendiri
      if (newState.id !== this.client.user?.id) return;

      if (this.isPlayingMusic) {
        const currentChannelId = newState.channelId;
        if (!currentChannelId) {
          this.logWarn(`[EVENT] Bot musik terputus dari Voice Channel secara eksternal. Membersihkan state musik...`);
          if (this.musicManager) {
            this.musicManager.cleanup();
          }
          this.isPlayingMusic = false;
          this.scheduleInstantReconnect(1000);
        }
        return;
      }

      const currentChannelId = newState.channelId;

      // 1. Bot terputus / dikeluarkan dari VC
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

      // 2. Bot dipindahkan ke VC lain
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

    this.client.on('error', (err) => {
      this.status = 'Error';
      this.logError(`Discord Client Error:`, err.message);
    });
  }

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
        if (targetVC !== this.defaultVoiceChannelId) {
          this.scheduleInstantReconnect(500);
        }
        return;
      }

      this.connectedChannelName = channel.name;
      this.logInfo(`[VOICE] Mencoba masuk ke Voice Channel: "${channel.name}" (${channel.id})...`);

      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfMute: this.selfMute,
        selfDeaf: this.selfDeaf,
        group: this.client.user.id
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
            entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
          ]);
          this.logSuccess(`[RECOVERED] Koneksi Voice berhasil dipulihkan secara otomatis.`);
        } catch (error) {
          this.logWarn(`Pemulihan otomatis gagal. Membuat ulang koneksi instan...`);
          try { connection.destroy(); } catch (_) {}
          this.isConnecting = false;
          this.scheduleInstantReconnect();
        }
      });

      connection.on(VoiceConnectionStatus.Destroyed, () => {
        this.logWarn(`Koneksi Voice dihancurkan. Menghubungkan kembali...`);
        this.isConnecting = false;
        if (this.status !== 'Stopped') {
          this.scheduleInstantReconnect();
        }
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
    this.reconnectTimer = setTimeout(() => {
      this.connectToVoiceChannel();
    }, delayMs);
  }

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
    if (connection) {
      try { connection.destroy(); } catch (_) {}
    }
    try { this.client.destroy(); } catch (_) {}
  }

  // Management Actions
  async moveVoiceChannel(newVoiceChannelId) {
    if (this.isPlayingMusic && this.musicManager) {
      this.musicManager.cleanup();
      this.isPlayingMusic = false;
    }
    this.targetVoiceChannelId = newVoiceChannelId;
    this.defaultVoiceChannelId = newVoiceChannelId;
    this.logInfo(`[ADMIN] Memindahkan bot ke Voice Channel baru (${newVoiceChannelId})...`);
    this.destroyVoiceConnection();
    await this.connectToVoiceChannel();
    return true;
  }

  destroyVoiceConnection() {
    const connection = getVoiceConnection(this.guildId, this.client.user?.id);
    if (connection) {
      try { connection.destroy(); } catch (_) {}
    }
  }

  async fetchGuildVoiceChannels() {
    if (!this.client.isReady()) return null;
    try {
      const guild = await this.client.guilds.fetch(this.guildId);
      if (!guild) return null;
      const channels = await guild.channels.fetch();
      const voiceChannels = [];

      channels.forEach(ch => {
        if (ch && ch.isVoiceBased()) {
          voiceChannels.push({
            id: ch.id,
            name: ch.name,
            memberCount: ch.members ? ch.members.size : 0,
            isCurrent: ch.id === this.targetVoiceChannelId
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
    if (connection) {
      this.connectToVoiceChannel(); // Re-join with updated state
    }
    return true;
  }

  setSelfDeaf(deafState) {
    this.selfDeaf = !!deafState;
    const connection = getVoiceConnection(this.guildId, this.client.user?.id);
    if (connection) {
      this.connectToVoiceChannel(); // Re-join with updated state
    }
    return true;
  }

  getStatusSummary() {
    return {
      index: this.index,
      name: this.name,
      token: this.token,
      guildId: this.guildId,
      guildName: this.guildName || this.guildId,
      defaultVoiceChannelId: this.defaultVoiceChannelId,
      targetVoiceChannelId: this.targetVoiceChannelId,
      connectedChannelId: this.targetVoiceChannelId,
      connectedChannelName: this.connectedChannelName || this.targetVoiceChannelId,
      targetUserId: this.targetUserId,
      allowMove: this.allowMove,
      status: this.status,
      ping: this.client.ws ? this.client.ws.ping : 0,
      avatar: this.client.user ? this.client.user.displayAvatarURL() : null,
      tag: this.client.user ? this.client.user.tag : null,
      id: this.client.user ? this.client.user.id : null,
      selfMute: this.selfMute,
      selfDeaf: this.selfDeaf
    };
  }
}

// -------------------------------------------------------------
// 3. Multi-Bot Orchestrator (Backend API for Web Dashboard)
// -------------------------------------------------------------
const activeBotInstances = [];

const botOrchestrator = {
  getBotsSummary() {
    return activeBotInstances.map(bot => bot.getStatusSummary());
  },

  async getGuildVoiceChannels(idx) {
    const bot = activeBotInstances[idx];
    if (!bot) return null;
    return await bot.fetchGuildVoiceChannels();
  },

  async moveBotChannel(idx, voiceChannelId) {
    const bot = activeBotInstances[idx];
    if (!bot) return false;
    const res = await bot.moveVoiceChannel(voiceChannelId);

    persistAllConfigs();
    return res;
  },

  async controlVoiceState(idx, action) {
    const bot = activeBotInstances[idx];
    if (!bot) return { success: false, error: 'Bot tidak ditemukan' };

    let success = false;
    let message = '';

    if (action === 'mute') { bot.setSelfMute(true); success = true; message = 'Bot di-mute'; }
    else if (action === 'unmute') { bot.setSelfMute(false); success = true; message = 'Bot di-unmute'; }
    else if (action === 'deafen') { bot.setSelfDeaf(true); success = true; message = 'Bot di-deafen'; }
    else if (action === 'undeafen') { bot.setSelfDeaf(false); success = true; message = 'Bot di-undeafen'; }
    else if (action === 'reconnect') {
      bot.destroyVoiceConnection();
      bot.connectToVoiceChannel();
      return { success: true, message: 'Reconnecting bot to Voice Channel...' };
    }

    if (success) {
      persistAllConfigs();
      return { success: true, message };
    }
    return { success: false, error: 'Aksi tidak valid' };
  },

  async controlLifecycle(idx, action) {
    const bot = activeBotInstances[idx];
    if (!bot) return { success: false, error: 'Bot tidak ditemukan' };

    if (action === 'stop') {
      bot.destroy();
      persistAllConfigs();
      return { success: true, message: `Bot ${bot.name} dihentikan.` };
    }
    if (action === 'start') {
      await bot.start();
      persistAllConfigs();
      return { success: true, message: `Bot ${bot.name} dijalankan.` };
    }
    if (action === 'restart') {
      bot.destroy();
      setTimeout(async () => {
        await bot.start();
        persistAllConfigs();
      }, 1000);
      return { success: true, message: `Bot ${bot.name} direstart.` };
    }
    return { success: false, error: 'Aksi tidak dikenal' };
  },

  async updateBotConfig(idx, newConfig) {
    const bot = activeBotInstances[idx];
    if (!bot) return { success: false, error: 'Bot tidak ditemukan' };

    if (newConfig.name) bot.name = newConfig.name;
    if (newConfig.token && newConfig.token.trim() !== '') bot.token = newConfig.token.trim();
    if (newConfig.guildId) bot.guildId = newConfig.guildId;
    if (newConfig.voiceChannelId) {
      bot.defaultVoiceChannelId = newConfig.voiceChannelId;
      bot.targetVoiceChannelId = newConfig.voiceChannelId;
    }
    if (newConfig.targetUserId !== undefined) bot.targetUserId = newConfig.targetUserId || null;
    if (newConfig.allowMove !== undefined) bot.allowMove = !!newConfig.allowMove;

    persistAllConfigs();

    bot.logInfo(`[CONFIG] Konfigurasi bot diperbarui dari Web Dashboard.`);
    bot.destroyVoiceConnection();
    if (bot.status !== 'Stopped') {
      bot.connectToVoiceChannel();
    }

    return { success: true, message: `Konfigurasi ${bot.name} berhasil disimpan.` };
  },

  async addBotConfig(config) {
    const newEntry = {
      name: config.name || `Bot #${activeBotInstances.length + 1}`,
      token: config.token.trim(),
      guildId: config.guildId.trim(),
      voiceChannelId: config.voiceChannelId.trim(),
      targetUserId: config.targetUserId ? config.targetUserId.trim() : null,
      allowMove: config.allowMove !== false,
      selfMute: true,
      selfDeaf: true,
      stopped: false
    };

    const idx = activeBotInstances.length;
    const instance = new AFKBotInstance(newEntry, idx);
    activeBotInstances.push(instance);
    persistAllConfigs();

    instance.start();

    return { success: true, message: `Bot baru "${newEntry.name}" berhasil ditambahkan dan dijalankan!` };
  },

  async deleteBotConfig(idx) {
    const bot = activeBotInstances[idx];
    if (!bot) return { success: false, error: 'Bot tidak ditemukan' };

    bot.destroy();
    activeBotInstances.splice(idx, 1);

    // Update indices for remaining bots
    activeBotInstances.forEach((b, i) => b.index = i);

    persistAllConfigs();

    return { success: true, message: `Bot berhasil dihapus.` };
  },

  async restartAllBots() {
    activeBotInstances.forEach(bot => {
      bot.destroy();
      setTimeout(() => bot.start(), 1000);
    });
    return { success: true, message: 'Seluruh bot sedang direstart...' };
  }
};

/**
 * Persist all bot instances configurations and active state to bots.json
 */
function persistAllConfigs() {
  const configs = activeBotInstances.map(bot => ({
    name: bot.name,
    token: bot.token,
    guildId: bot.guildId,
    voiceChannelId: bot.defaultVoiceChannelId,
    targetUserId: bot.targetUserId,
    allowMove: bot.allowMove,
    selfMute: bot.selfMute,
    selfDeaf: bot.selfDeaf,
    stopped: bot.status === 'Stopped'
  }));
  saveBotConfigurations(configs);
}

// -------------------------------------------------------------
// 4. Multi-Bot Orchestrator Startup & Web Dashboard Launch
// -------------------------------------------------------------
async function startMultiBotSystem() {
  console.log(`${LOG_COLORS.cyan}===========================================${LOG_COLORS.reset}`);
  console.log(`${LOG_COLORS.cyan} 🤖 Discord 24/7 AFK Multi-Bot System & Web Control ${LOG_COLORS.reset}`);
  console.log(`${LOG_COLORS.cyan}===========================================${LOG_COLORS.reset}`);

  let botConfigs = loadBotConfigurations();

  if (botConfigs.length === 0) {
    console.log(`${LOG_COLORS.yellow}[INFO] Belum ada konfigurasi bot ditemukan. Membuat file contoh bots.json...${LOG_COLORS.reset}`);
    // Save an initial structure so bots.json is available
    const initialConfig = [{
      name: "Bot AFK Utama",
      token: process.env.DISCORD_TOKEN || "PASTE_YOUR_BOT_TOKEN_HERE",
      guildId: process.env.GUILD_ID || "PASTE_YOUR_GUILD_ID_HERE",
      voiceChannelId: process.env.VOICE_CHANNEL_ID || "PASTE_YOUR_VOICE_CHANNEL_ID_HERE",
      targetUserId: process.env.TARGET_USER_ID || null,
      allowMove: true,
      selfMute: true,
      selfDeaf: true,
      stopped: false
    }];
    saveBotConfigurations(initialConfig);
    botConfigs = loadBotConfigurations();
  }

  console.log(`${LOG_COLORS.green}[SYSTEM] Ditemukan ${botConfigs.length} konfigurasi bot. Memulai instance...${LOG_COLORS.reset}\n`);

  botConfigs.forEach((config, idx) => {
    const instance = new AFKBotInstance(config, idx);
    activeBotInstances.push(instance);
    if (!config.stopped) {
      instance.start();
    } else {
      instance.logInfo(`Bot dinonaktifkan (Stopped) - Tidak login otomatis saat boot.`);
    }
  });

  // Start Express Web Server
  createWebServer(botOrchestrator);
}

// -------------------------------------------------------------
// 5. Protection & Graceful Shutdown
// -------------------------------------------------------------
process.on('unhandledRejection', (reason, promise) => {
  console.error(`${LOG_COLORS.red}[ANTI-CRASH] Unhandled Rejection at:${LOG_COLORS.reset}`, promise, 'reason:', reason);
});

process.on('uncaughtException', (err, origin) => {
  console.error(`${LOG_COLORS.red}[ANTI-CRASH] Uncaught Exception:${LOG_COLORS.reset}`, err, 'origin:', origin);
});

function handleShutdown() {
  console.log(`\n${LOG_COLORS.cyan}[SHUTDOWN] Mematikan seluruh instance bot AFK...${LOG_COLORS.reset}`);
  activeBotInstances.forEach(bot => bot.destroy());
  process.exit(0);
}

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);

// Run System
startMultiBotSystem();
