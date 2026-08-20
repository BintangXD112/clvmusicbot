'use strict';
/**
 * src/webhook/config.js
 * Konstanta konfigurasi dan logger untuk Webhook Server.
 */

const path = require('path');
const LOG_COLORS = require('../colors');

const PORT          = parseInt(process.env.WEBHOOK_PORT   || '24601', 10);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET          || '';
const BRANCH        = process.env.WEBHOOK_BRANCH           || 'main';
const PROJECT_DIR   = path.resolve(__dirname, '..', '..'); // Root folder proyek

/**
 * Log helper dengan timestamp, tag [WEBHOOK], dan warna ANSI.
 * @param {'INFO'|'SUCCESS'|'WARN'|'ERROR'} level
 * @param {string} message
 */
function log(level, message) {
  const now    = new Date().toLocaleTimeString('id-ID');
  const colors = {
    INFO:    LOG_COLORS.cyan,
    SUCCESS: LOG_COLORS.green,
    WARN:    LOG_COLORS.yellow,
    ERROR:   LOG_COLORS.red
  };
  console.log(`${colors[level] || ''}[${now}] [WEBHOOK] [${level}]${LOG_COLORS.reset} ${message}`);
}

module.exports = { PORT, WEBHOOK_SECRET, BRANCH, PROJECT_DIR, log };
