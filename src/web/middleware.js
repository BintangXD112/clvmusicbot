'use strict';
/**
 * src/web/middleware.js
 * Express middleware: session, auth guard, dan helper updateEnvVariable.
 */

const session   = require('express-session');
const FileStore = require('session-file-store')(session);
const path      = require('path');
const fs        = require('fs');

// ─────────────────────────────────────────────────────────────────────────────
// Helper: update atau tambah key di file .env
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Perbarui atau tambahkan satu key=value di file .env.
 * Juga langsung update process.env agar aktif tanpa restart.
 * @param {string} key
 * @param {string} value
 */
function updateEnvVariable(key, value) {
  const envPath = path.join(__dirname, '..', '..', '.env');
  let content = '';
  if (fs.existsSync(envPath)) content = fs.readFileSync(envPath, 'utf8');

  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (content.match(regex)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    if (content.length > 0 && !content.endsWith('\n')) content += '\n';
    content += `${key}=${value}\n`;
  }

  fs.writeFileSync(envPath, content, 'utf8');
  process.env[key] = value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Session middleware factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Buat express-session middleware dengan FileStore.
 * @returns {Function} Express middleware
 */
function createSessionMiddleware() {
  const sessionsDir = path.join(__dirname, '..', '..', '.sessions');
  return session({
    store: new FileStore({
      path:         sessionsDir,
      ttl:          86400,  // 24 jam
      retries:      1,
      reapInterval: 3600
    }),
    secret:            process.env.SESSION_SECRET || 'discord_afk_totp_secret_key_998877',
    name:              'dcafk.sid',
    resave:            false,
    saveUninitialized: false,
    rolling:           true,
    cookie: {
      maxAge:   24 * 60 * 60 * 1000,
      httpOnly: true,
      secure:   false,
      sameSite: 'lax'
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth guard middleware
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Middleware yang memblokir akses jika belum login.
 * Route /api/* mendapat respons 401 JSON; route lain di-redirect ke /login.
 */
const requireAuth = (req, res, next) => {
  if (req.session && req.session.authenticated === true) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized. Silakan login terlebih dahulu.' });
  }
  return res.redirect('/login');
};

module.exports = { updateEnvVariable, createSessionMiddleware, requireAuth };
