'use strict';
/**
 * src/bot/BotOrchestrator.js
 * Menyimpan semua active bot instances dan menyediakan API untuk
 * web dashboard mengontrol bot (start/stop/move/config/dll).
 */

const AFKBotInstance         = require('./AFKBotInstance');
const { saveBotConfigurations } = require('../config/botConfig');

// Array tunggal yang menyimpan semua instance bot yang aktif.
// Di-export agar index.js bisa push instance baru saat startup.
const activeBotInstances = [];

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

function persistAllConfigs() {
  const configs = activeBotInstances.map(bot => ({
    name:           bot.name,
    token:          bot.token,
    guildId:        bot.guildId,
    voiceChannelId: bot.defaultVoiceChannelId,
    targetUserId:   bot.targetUserId,
    allowMove:      bot.allowMove,
    selfMute:       bot.selfMute,
    selfDeaf:       bot.selfDeaf,
    stopped:        bot.status === 'Stopped',
    presenceType:   bot.presenceType,
    presenceText:   bot.presenceText
  }));
  saveBotConfigurations(configs);
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────────────────────

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

    if (action === 'mute')      { bot.setSelfMute(true);  success = true; message = 'Bot di-mute'; }
    else if (action === 'unmute')   { bot.setSelfMute(false); success = true; message = 'Bot di-unmute'; }
    else if (action === 'deafen')   { bot.setSelfDeaf(true);  success = true; message = 'Bot di-deafen'; }
    else if (action === 'undeafen') { bot.setSelfDeaf(false); success = true; message = 'Bot di-undeafen'; }
    else if (action === 'reconnect') {
      bot.destroyVoiceConnection();
      bot.connectToVoiceChannel();
      return { success: true, message: 'Reconnecting bot to Voice Channel...' };
    }

    if (success) { persistAllConfigs(); return { success: true, message }; }
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
      setTimeout(async () => { await bot.start(); persistAllConfigs(); }, 1000);
      return { success: true, message: `Bot ${bot.name} direstart.` };
    }
    return { success: false, error: 'Aksi tidak dikenal' };
  },

  async updateBotConfig(idx, newConfig) {
    const bot = activeBotInstances[idx];
    if (!bot) return { success: false, error: 'Bot tidak ditemukan' };

    if (newConfig.name)                          bot.name          = newConfig.name;
    if (newConfig.token && newConfig.token.trim() !== '') bot.token = newConfig.token.trim();
    if (newConfig.guildId)                       bot.guildId       = newConfig.guildId;
    if (newConfig.voiceChannelId) {
      bot.defaultVoiceChannelId = newConfig.voiceChannelId;
      bot.targetVoiceChannelId  = newConfig.voiceChannelId;
    }
    if (newConfig.targetUserId !== undefined) bot.targetUserId = newConfig.targetUserId || null;
    if (newConfig.allowMove    !== undefined) bot.allowMove    = !!newConfig.allowMove;
    if (newConfig.presenceType !== undefined) bot.presenceType = newConfig.presenceType;
    if (newConfig.presenceText !== undefined) bot.presenceText = newConfig.presenceText;

    persistAllConfigs();
    bot.logInfo(`[CONFIG] Konfigurasi bot diperbarui dari Web Dashboard.`);
    bot.destroyVoiceConnection();
    if (bot.status !== 'Stopped') {
      bot.connectToVoiceChannel();
      setTimeout(() => bot.updatePresence(), 2000);
    }
    return { success: true, message: `Konfigurasi ${bot.name} berhasil disimpan.` };
  },

  async addBotConfig(config) {
    const newEntry = {
      name:           config.name || `Bot #${activeBotInstances.length + 1}`,
      token:          config.token.trim(),
      guildId:        config.guildId.trim(),
      voiceChannelId: config.voiceChannelId.trim(),
      targetUserId:   config.targetUserId ? config.targetUserId.trim() : null,
      allowMove:      config.allowMove !== false,
      selfMute:       true,
      selfDeaf:       true,
      stopped:        false,
      presenceType:   config.presenceType || 'WATCHING',
      presenceText:   config.presenceText || 'Dashboard'
    };
    const idx      = activeBotInstances.length;
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
    // Update indices
    activeBotInstances.forEach((b, i) => (b.index = i));
    persistAllConfigs();
    return { success: true, message: `Bot berhasil dihapus.` };
  },

  async bulkControlVoiceState(action) {
    let successCount = 0;
    activeBotInstances.forEach(bot => {
      if (bot.status === 'Online') {
        if      (action === 'mute')      bot.setSelfMute(true);
        else if (action === 'unmute')    bot.setSelfMute(false);
        else if (action === 'deafen')    bot.setSelfDeaf(true);
        else if (action === 'undeafen')  bot.setSelfDeaf(false);
        else if (action === 'reconnect') { bot.destroyVoiceConnection(); bot.connectToVoiceChannel(); }
        successCount++;
      }
    });
    persistAllConfigs();
    return { success: true, message: `Berhasil menjalankan ${action} ke ${successCount} bot.` };
  },

  async bulkMoveBotChannel(voiceChannelId) {
    let successCount = 0;
    for (const bot of activeBotInstances) {
      if (bot.status === 'Online') {
        await bot.moveVoiceChannel(voiceChannelId);
        successCount++;
      }
    }
    persistAllConfigs();
    return { success: true, message: `Berhasil memindahkan ${successCount} bot.` };
  },

  async restartAllBots() {
    activeBotInstances.forEach(bot => {
      bot.destroy();
      setTimeout(() => bot.start(), 1000);
    });
    return { success: true, message: 'Seluruh bot sedang direstart...' };
  }
};

module.exports = { botOrchestrator, activeBotInstances };
