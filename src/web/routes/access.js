'use strict';
/**
 * src/web/routes/access.js
 * Express router untuk Pengaturan Domain Security dan Access Logs API.
 */

const express = require('express');
const { requireAuth, updateEnvVariable } = require('../middleware');
const { getAccessLogs, clearAccessLogs } = require('../accessLogger');

const router = express.Router();

// GET /api/access/settings — Ambil konfigurasi batasan domain saat ini
router.get('/settings', requireAuth, (req, res) => {
  res.json({
    enabled: process.env.ALLOWED_DOMAINS_ENABLED === 'true',
    allowedDomains: process.env.ALLOWED_DOMAINS || '',
    currentHost: req.headers.host || ''
  });
});

// POST /api/access/settings — Simpan konfigurasi batasan domain ke .env
router.post('/settings', requireAuth, (req, res) => {
  const { enabled, allowedDomains } = req.body;

  try {
    const enabledStr = String(enabled === true);
    const domainsStr = typeof allowedDomains === 'string' ? allowedDomains.trim() : '';

    updateEnvVariable('ALLOWED_DOMAINS_ENABLED', enabledStr);
    updateEnvVariable('ALLOWED_DOMAINS', domainsStr);

    res.json({
      success: true,
      message: 'Pengaturan Domain Access Control berhasil disimpan!',
      enabled: process.env.ALLOWED_DOMAINS_ENABLED === 'true',
      allowedDomains: process.env.ALLOWED_DOMAINS
    });
  } catch (err) {
    res.status(500).json({ error: `Gagal menyimpan pengaturan domain: ${err.message}` });
  }
});

// GET /api/access/logs — Ambil daftar HTTP access logs
router.get('/logs', requireAuth, (req, res) => {
  const { search, status, limit } = req.query;
  const logs = getAccessLogs({ search, status, limit });
  res.json({
    total: logs.length,
    logs
  });
});

// DELETE /api/access/logs — Hapus riwayat access logs
router.delete('/logs', requireAuth, (req, res) => {
  clearAccessLogs();
  res.json({ success: true, message: 'Riwayat Access Logs berhasil dibersihkan.' });
});

module.exports = router;
