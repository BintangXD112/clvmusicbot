'use strict';
/**
 * src/web/routes/system.js
 * Routes untuk informasi sistem dan pengaturan aplikasi.
 */

const express    = require('express');
const { requireAuth, updateEnvVariable } = require('../middleware');
const { getSystemMetrics }               = require('../../system/metrics');

/**
 * Buat Express Router untuk system dan settings API.
 * @param {Object} orchestrator - Instance botOrchestrator
 * @returns {import('express').Router}
 */
function createSystemRouter(orchestrator) {
  const router = express.Router();

  // Metrics sistem (CPU, RAM, GPU, OS, Process)
  router.get('/system', requireAuth, (req, res) => {
    res.json(getSystemMetrics());
  });

  // Restart semua bot
  router.post('/system/restart-all', requireAuth, async (req, res) => {
    res.json(await orchestrator.restartAllBots());
  });

  // Baca settings dari environment
  router.get('/settings', requireAuth, (req, res) => {
    res.json({
      geminiApiKey:  process.env.GEMINI_API_KEY    || '',
      geminiModel:   process.env.GEMINI_MODEL       || 'gemini-3.6-flash',
      musicPrefix:   process.env.MUSIC_PREFIX       || '!',
      ownerIds:      process.env.OWNER_IDS          || '',
      defaultVolume: process.env.DEFAULT_VOLUME     || '100',
      idleTimeout:   process.env.IDLE_TIMEOUT       || '60',
      webhookDisabled: process.env.WEBHOOK_DISABLED === 'true'
    });
  });

  // Simpan settings ke .env
  router.post('/settings', requireAuth, (req, res) => {
    const { geminiApiKey, geminiModel, musicPrefix, ownerIds, defaultVolume, idleTimeout, webhookDisabled } = req.body;
    if (geminiApiKey === undefined || musicPrefix === undefined || defaultVolume === undefined || idleTimeout === undefined) {
      return res.status(400).json({ error: 'Semua variabel setting wajib diisi.' });
    }
    try {
      updateEnvVariable('GEMINI_API_KEY',  geminiApiKey.trim());
      if (geminiModel && geminiModel.trim()) updateEnvVariable('GEMINI_MODEL', geminiModel.trim());
      updateEnvVariable('MUSIC_PREFIX',   musicPrefix.trim());
      updateEnvVariable('OWNER_IDS',      (ownerIds || '').trim());
      updateEnvVariable('DEFAULT_VOLUME', defaultVolume.trim());
      updateEnvVariable('IDLE_TIMEOUT',   idleTimeout.trim());
      updateEnvVariable('WEBHOOK_DISABLED', String(webhookDisabled === true));
      // Re-inisialisasi Gemini agent agar API key/model baru langsung aktif
      try { require('../../ai/GeminiMusicAgent').init(); } catch (_) {}
      res.json({ success: true, message: 'Settings berhasil disimpan dan diterapkan.' });
    } catch (err) {
      res.status(500).json({ error: `Gagal menyimpan settings: ${err.message}` });
    }
  });

  return router;
}

module.exports = createSystemRouter;
