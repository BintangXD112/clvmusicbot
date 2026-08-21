'use strict';
/**
 * src/web/routes/auth.js
 * Routes autentikasi: login, logout, session info, TOTP status, dan DB status.
 */

const express = require('express');
const path    = require('path');
const { requireAuth }                                           = require('../middleware');
const { verifyTOTP, confirmSetup, isConfirmed, getQrCodeDataUrl } = require('../../totp');

const router = express.Router();

// ── Public routes ─────────────────────────────────────────────────────────────

// Halaman login
router.get('/login', async (req, res) => {
  if (req.session && req.session.authenticated) return res.redirect('/');
  res.sendFile(path.join(__dirname, '..', '..', '..', 'public', 'login.html'));
});

// Status TOTP (diperlukan oleh login page JS)
router.get('/api/totp-status', async (req, res) => {
  const confirmed = isConfirmed();
  let qrCode = null;
  if (!confirmed) qrCode = await getQrCodeDataUrl();
  res.json({ confirmed, qrCode, dbConnected: false });
});

// Login via TOTP
router.post('/api/login', (req, res) => {
  const { token } = req.body;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Kode 6-digit wajib diisi.' });
  }

  const isValid = verifyTOTP(token.trim());
  if (!isValid) {
    return res.status(401).json({ error: 'Kode tidak valid atau sudah kedaluwarsa. Coba lagi.' });
  }

  if (!isConfirmed()) confirmSetup();

  req.session.authenticated = true;
  req.session.loginTime     = new Date().toISOString();

  req.session.save((err) => {
    if (err) {
      console.error('[SESSION] Failed to save session:', err.message);
      return res.status(500).json({ error: 'Gagal menyimpan sesi login. Coba lagi.' });
    }
    res.json({ success: true, message: 'Login berhasil!' });
  });
});

// Logout
router.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('dcafk.sid');
    res.json({ success: true, message: 'Logout berhasil.' });
  });
});

// Status DB (public info)
router.get('/api/db-status', (req, res) => {
  res.json({ mysqlConnected: false, database: '' });
});

// ── Protected routes ──────────────────────────────────────────────────────────

// Dashboard utama
router.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', '..', 'public', 'index.html'));
});

// Info sesi saat ini
router.get('/api/me', requireAuth, (req, res) => {
  res.json({ loggedIn: true, loginTime: req.session.loginTime });
});

module.exports = router;
