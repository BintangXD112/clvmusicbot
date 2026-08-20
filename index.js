'use strict';
/**
 * index.js
 * Entry point utama untuk Discord 24/7 AFK Multi-Bot System & Web Dashboard.
 *
 * Menerapkan modularisasi: config loader, class AFKBotInstance, dan orchestrator
 * diekstrak ke sub-modul demi keterbacaan dan pemeliharaan kode.
 */

require('dotenv').config();

const { loadBotConfigurations, saveBotConfigurations } = require('./src/config/botConfig');
const { botOrchestrator, activeBotInstances }          = require('./src/bot/BotOrchestrator');
const AFKBotInstance                                  = require('./src/bot/AFKBotInstance');
const { createWebServer }                              = require('./src/webServer');
const LOG_COLORS                                      = require('./src/colors');

// ─────────────────────────────────────────────────────────────────────────────
// Multi-Bot Orchestrator Startup & Web Dashboard Launch
// ─────────────────────────────────────────────────────────────────────────────

async function startMultiBotSystem() {
  console.log(`${LOG_COLORS.cyan}===========================================${LOG_COLORS.reset}`);
  console.log(`${LOG_COLORS.cyan} 🤖 Discord 24/7 AFK Multi-Bot System & Web Control ${LOG_COLORS.reset}`);
  console.log(`${LOG_COLORS.cyan}===========================================${LOG_COLORS.reset}`);

  let botConfigs = loadBotConfigurations();

  if (botConfigs.length === 0) {
    console.log(`${LOG_COLORS.yellow}[INFO] Belum ada konfigurasi bot ditemukan. Membuat file contoh bots.json...${LOG_COLORS.reset}`);
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

// ─────────────────────────────────────────────────────────────────────────────
// Protection & Graceful Shutdown
// ─────────────────────────────────────────────────────────────────────────────

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
