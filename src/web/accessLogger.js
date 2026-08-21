'use strict';
/**
 * src/web/accessLogger.js
 * Persistent HTTP Access Logging & Telemetry for Web Panel.
 * Menyimpan riwayat log akses ke memori dan file .access_logs.json agar tidak hilang saat server di-restart.
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

class AccessLoggerEmitter extends EventEmitter {}
const accessLoggerEmitter = new AccessLoggerEmitter();

const accessLogs = [];
const MAX_ACCESS_LOGS = 500;
const LOG_FILE_PATH = path.join(__dirname, '..', '..', '.access_logs.json');

// Debounce helper untuk menghemat I/O file
let saveTimer = null;

/**
 * Muat riwayat access log dari file JSON disk saat startup server.
 */
function loadLogsFromDisk() {
  try {
    if (fs.existsSync(LOG_FILE_PATH)) {
      const data = fs.readFileSync(LOG_FILE_PATH, 'utf8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        accessLogs.push(...parsed.slice(0, MAX_ACCESS_LOGS));
      }
    }
  } catch (err) {
    console.error('[ACCESS LOG] Gagal membaca .access_logs.json:', err.message);
  }
}

/**
 * Simpan riwayat access log ke file JSON disk.
 */
function saveLogsToDisk() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(LOG_FILE_PATH, JSON.stringify(accessLogs.slice(0, MAX_ACCESS_LOGS), null, 2), 'utf8');
    } catch (err) {
      console.error('[ACCESS LOG] Gagal menyimpan ke .access_logs.json:', err.message);
    }
  }, 1000);
}

// Inisialisasi: muat log saat modul di-require
loadLogsFromDisk();

/**
 * Tambahkan entry access log baru.
 * @param {Object} logData
 */
function addAccessLog(logData) {
  const entry = {
    id: Date.now() + Math.random().toString(36).substring(2, 7),
    timestamp: new Date().toISOString(),
    ip: logData.ip || '127.0.0.1',
    host: logData.host || 'unknown',
    method: logData.method || 'GET',
    path: logData.path || '/',
    status: logData.status || 200,
    durationMs: logData.durationMs || 0,
    userAgent: logData.userAgent || 'Unknown',
    allowed: logData.allowed !== undefined ? logData.allowed : true,
    reason: logData.reason || ''
  };

  accessLogs.unshift(entry); // Newest first
  if (accessLogs.length > MAX_ACCESS_LOGS) {
    accessLogs.pop();
  }

  saveLogsToDisk();
  accessLoggerEmitter.emit('access_log', entry);
}

/**
 * Express middleware untuk mencatat semua HTTP request ke Web Panel.
 */
function accessLoggerMiddleware(req, res, next) {
  const startTime = Date.now();

  // Abaikan log internal streaming SSE/telemetry polling yang berulang agar log tidak spam
  if (req.path === '/api/stream') {
    return next();
  }

  const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '';
  const ip = String(rawIp).split(',')[0].trim().replace('::ffff:', '');
  const host = req.headers.host || req.hostname || 'localhost';
  const method = req.method;
  const path = req.originalUrl || req.url;
  const userAgent = req.headers['user-agent'] || 'Unknown';

  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    const isBlocked = req._domainBlocked === true || res.statusCode === 403;
    const reason = req._blockedReason || (isBlocked ? 'Domain Access Restricted' : '');

    addAccessLog({
      ip,
      host,
      method,
      path,
      status: res.statusCode,
      durationMs,
      userAgent,
      allowed: !isBlocked,
      reason
    });
  });

  next();
}

/**
 * Dapatkan daftar access logs dengan filter opsional.
 */
function getAccessLogs(filters = {}) {
  let result = [...accessLogs];

  if (filters.search) {
    const query = String(filters.search).toLowerCase();
    result = result.filter(item =>
      item.ip.toLowerCase().includes(query) ||
      item.host.toLowerCase().includes(query) ||
      item.path.toLowerCase().includes(query) ||
      item.userAgent.toLowerCase().includes(query)
    );
  }

  if (filters.status) {
    if (filters.status === '2xx') result = result.filter(i => i.status >= 200 && i.status < 300);
    else if (filters.status === '3xx') result = result.filter(i => i.status >= 300 && i.status < 400);
    else if (filters.status === '403') result = result.filter(i => i.status === 403 || !i.allowed);
    else if (filters.status === '4xx') result = result.filter(i => i.status >= 400 && i.status < 500 && i.status !== 403);
    else if (filters.status === '5xx') result = result.filter(i => i.status >= 500);
  }

  const limit = Number(filters.limit) || 200;
  return result.slice(0, limit);
}

/**
 * Hapus semua riwayat access log.
 */
function clearAccessLogs() {
  accessLogs.length = 0;
  try {
    if (fs.existsSync(LOG_FILE_PATH)) {
      fs.unlinkSync(LOG_FILE_PATH);
    }
  } catch (err) {
    console.error('[ACCESS LOG] Gagal menghapus file .access_logs.json:', err.message);
  }
}

module.exports = {
  accessLoggerMiddleware,
  addAccessLog,
  getAccessLogs,
  clearAccessLogs,
  accessLoggerEmitter
};
