'use strict';
/**
 * src/web/routes/access.js
 * Express router untuk Pengaturan Domain Security dan Access Logs API.
 */

const express = require('express');
const { requireAuth, updateEnvVariable } = require('../middleware');
const { getAccessLogs, clearAccessLogs } = require('../accessLogger');
const { normalizeDomain, getEffectiveHost, getAllowedDomain } = require('../domainGuard');

const router = express.Router();

// GET /api/access/settings — Ambil konfigurasi batasan domain saat ini
router.get('/settings', requireAuth, (req, res) => {
  const currentHost = getEffectiveHost(req) || (req.headers.host || '').split(':')[0];
  res.json({
    enabled: process.env.ALLOWED_DOMAINS_ENABLED === 'true',
    allowedDomains: getAllowedDomain() || process.env.ALLOWED_DOMAINS || '',
    currentHost
  });
});

// POST /api/access/settings — Simpan konfigurasi batasan domain ke .env
router.post('/settings', requireAuth, (req, res) => {
  const { enabled, allowedDomains } = req.body;

  try {
    const isEnabled = enabled === true;
    const cleanDomain = normalizeDomain(allowedDomains);

    if (isEnabled && !cleanDomain) {
      return res.status(400).json({
        error: 'Mohon masukkan 1 domain murni yang valid (contoh: panel.domainanda.com) saat mengaktifkan restriksi domain.'
      });
    }

    updateEnvVariable('ALLOWED_DOMAINS_ENABLED', String(isEnabled));
    updateEnvVariable('ALLOWED_DOMAINS', cleanDomain);

    res.json({
      success: true,
      message: 'Pengaturan Restriksi Single Domain berhasil disimpan!',
      enabled: process.env.ALLOWED_DOMAINS_ENABLED === 'true',
      allowedDomains: process.env.ALLOWED_DOMAINS
    });
  } catch (err) {
    res.status(500).json({ error: `Gagal menyimpan pengaturan domain: ${err.message}` });
  }
});

// GET /api/access/logs — Ambil daftar HTTP access logs
router.get('/logs', requireAuth, (req, res) => {
  const { search, status, clientType, limit } = req.query;
  const logs = getAccessLogs({ search, status, clientType, limit });
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
