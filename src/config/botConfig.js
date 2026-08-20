'use strict';
/**
 * src/config/botConfig.js
 * Loader dan saver konfigurasi bot dari/ke bots.json atau environment variables.
 */

const fs   = require('fs');
const path = require('path');
const LOG_COLORS = require('../colors');

const BOTS_JSON_PATH = path.join(__dirname, '..', '..', 'bots.json');

/**
 * Load bot configurations dari bots.json, numbered .env, atau legacy single .env.
 * @returns {Array<Object>} Array konfigurasi bot
 */
function loadBotConfigurations() {
  const botsConfig = [];

  // ── Check 1: bots.json ──────────────────────────────────────────────────────
  if (fs.existsSync(BOTS_JSON_PATH)) {
    try {
      const rawData = fs.readFileSync(BOTS_JSON_PATH, 'utf8');
      const parsed  = JSON.parse(rawData);
      if (Array.isArray(parsed) && parsed.length > 0) {
        parsed.forEach((b, idx) => {
          if (b.token && b.guildId && b.voiceChannelId && b.token !== 'YOUR_BOT_TOKEN_1') {
            botsConfig.push({
              name:           b.name || `Bot #${idx + 1}`,
              token:          b.token.trim(),
              guildId:        b.guildId.trim(),
              voiceChannelId: b.voiceChannelId.trim(),
              targetUserId:   b.targetUserId || b.followUserId || null,
              allowMove:      b.allowMove !== undefined ? b.allowMove : true,
              selfMute:       b.selfMute  !== undefined ? !!b.selfMute  : true,
              selfDeaf:       b.selfDeaf  !== undefined ? !!b.selfDeaf  : true,
              stopped:        b.stopped   !== undefined ? !!b.stopped   : false,
              presenceType:   b.presenceType || 'WATCHING',
              presenceText:   b.presenceText || 'Dashboard'
            });
          }
        });
      }
    } catch (err) {
      console.error(`${LOG_COLORS.red}[ERROR] Gagal membaca bots.json:${LOG_COLORS.reset}`, err.message);
    }
  }

  if (botsConfig.length > 0) return botsConfig;

  // ── Check 2: Numbered env vars (BOT_1_TOKEN, BOT_2_TOKEN, …) ────────────────
  const numberedBotsMap = {};
  for (const [key, val] of Object.entries(process.env)) {
    if (!val || val.trim() === '') continue;
    const match = key.match(/^BOT_(\d+)_(TOKEN|GUILD_ID|VOICE_CHANNEL_ID|TARGET_USER_ID|FOLLOW_USER_ID|PRESENCE_TYPE|PRESENCE_TEXT)$/);
    if (match) {
      const botIndex  = match[1];
      const fieldType = match[2];
      if (!numberedBotsMap[botIndex]) {
        numberedBotsMap[botIndex] = {
          name: `Bot #${botIndex}`, allowMove: true, selfMute: true,
          selfDeaf: true, stopped: false, presenceType: 'WATCHING', presenceText: 'Dashboard'
        };
      }
      if (fieldType === 'TOKEN')                                      numberedBotsMap[botIndex].token          = val.trim();
      if (fieldType === 'GUILD_ID')                                   numberedBotsMap[botIndex].guildId        = val.trim();
      if (fieldType === 'VOICE_CHANNEL_ID')                           numberedBotsMap[botIndex].voiceChannelId = val.trim();
      if (fieldType === 'TARGET_USER_ID' || fieldType === 'FOLLOW_USER_ID') numberedBotsMap[botIndex].targetUserId   = val.trim();
      if (fieldType === 'PRESENCE_TYPE')                              numberedBotsMap[botIndex].presenceType   = val.trim();
      if (fieldType === 'PRESENCE_TEXT')                              numberedBotsMap[botIndex].presenceText   = val.trim();
    }
  }

  const numberedIndices = Object.keys(numberedBotsMap).sort((a, b) => Number(a) - Number(b));
  for (const idx of numberedIndices) {
    const b = numberedBotsMap[idx];
    if (b.token && b.guildId && b.voiceChannelId) botsConfig.push(b);
  }

  if (botsConfig.length > 0) return botsConfig;

  // ── Check 3: Legacy single bot (.env DISCORD_TOKEN, GUILD_ID, …) ────────────
  const legacyToken      = process.env.DISCORD_TOKEN;
  const legacyGuildId    = process.env.GUILD_ID;
  const legacyVCId       = process.env.VOICE_CHANNEL_ID;
  const legacyTargetUser = process.env.TARGET_USER_ID || process.env.FOLLOW_USER_ID || null;

  if (
    legacyToken    && legacyGuildId    && legacyVCId &&
    legacyToken    !== 'your_bot_token_here' &&
    legacyGuildId  !== 'your_guild_id_here'  &&
    legacyVCId     !== 'your_voice_channel_id_here'
  ) {
    botsConfig.push({
      name:           'Bot #1',
      token:          legacyToken.trim(),
      guildId:        legacyGuildId.trim(),
      voiceChannelId: legacyVCId.trim(),
      targetUserId:   legacyTargetUser ? legacyTargetUser.trim() : null,
      allowMove:      true,
      selfMute:       true,
      selfDeaf:       true,
      stopped:        false,
      presenceType:   process.env.PRESENCE_TYPE || 'WATCHING',
      presenceText:   process.env.PRESENCE_TEXT || 'Dashboard'
    });
  }

  return botsConfig;
}

/**
 * Simpan array konfigurasi bot ke bots.json.
 * @param {Array<Object>} configs
 * @returns {boolean} true jika berhasil
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

module.exports = { loadBotConfigurations, saveBotConfigurations, BOTS_JSON_PATH };
