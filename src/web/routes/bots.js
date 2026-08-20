'use strict';
/**
 * src/web/routes/bots.js
 * API routes untuk manajemen bot Discord.
 *
 * ⚠️  BUG FIX: Route spesifik (/bulk/*, /config/*) HARUS didefinisikan
 * SEBELUM route parametrik (/:index/*). Jika tidak, Express akan mencocokkan
 * "bulk" sebagai nilai :index dan parseInt("bulk") = NaN → bot tidak ditemukan.
 */

const express    = require('express');
const { requireAuth } = require('../middleware');

/**
 * Buat Express Router untuk bot API.
 * @param {Object} orchestrator - Instance botOrchestrator dari BotOrchestrator.js
 * @returns {import('express').Router}
 */
function createBotsRouter(orchestrator) {
  const router = express.Router();

  // ──────────────────────────────────────────────────────────────────────────
  // Bulk actions — HARUS SEBELUM /:index routes (BUG FIX)
  // ──────────────────────────────────────────────────────────────────────────

  router.post('/bulk/voice-state', requireAuth, async (req, res) => {
    const { action } = req.body;
    if (!action) return res.status(400).json({ error: 'action diperlukan.' });
    const result = await orchestrator.bulkControlVoiceState(action);
    res.status(result.success ? 200 : 400).json(result);
  });

  router.post('/bulk/move', requireAuth, async (req, res) => {
    const { voiceChannelId } = req.body;
    if (!voiceChannelId) return res.status(400).json({ error: 'voiceChannelId diperlukan.' });
    const result = await orchestrator.bulkMoveBotChannel(voiceChannelId);
    res.status(result.success ? 200 : 400).json(result);
  });

  // Config routes
  router.post('/config/add', requireAuth, async (req, res) => {
    const result = await orchestrator.addBotConfig(req.body);
    res.status(result.success ? 200 : 400).json(result);
  });

  router.delete('/config/:index', requireAuth, async (req, res) => {
    const result = await orchestrator.deleteBotConfig(parseInt(req.params.index, 10));
    res.status(result.success ? 200 : 400).json(result);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Parametric /:index routes — SETELAH routes spesifik di atas
  // ──────────────────────────────────────────────────────────────────────────

  router.get('/', requireAuth, (req, res) => {
    res.json(orchestrator.getBotsSummary());
  });

  router.get('/:index/channels', requireAuth, async (req, res) => {
    const idx      = parseInt(req.params.index, 10);
    const channels = await orchestrator.getGuildVoiceChannels(idx);
    if (!channels) return res.status(404).json({ error: 'Gagal mengambil daftar Voice Channel.' });
    res.json(channels);
  });

  router.post('/:index/move', requireAuth, async (req, res) => {
    const idx              = parseInt(req.params.index, 10);
    const { voiceChannelId } = req.body;
    if (!voiceChannelId) return res.status(400).json({ error: 'voiceChannelId diperlukan.' });
    const success = await orchestrator.moveBotChannel(idx, voiceChannelId);
    res.json(
      success
        ? { success: true,  message: `Bot dipindahkan ke ${voiceChannelId}` }
        : { success: false, error:   'Gagal memindahkan bot.' }
    );
  });

  router.post('/:index/voice-state', requireAuth, async (req, res) => {
    const result = await orchestrator.controlVoiceState(parseInt(req.params.index, 10), req.body.action);
    res.status(result.success ? 200 : 400).json(result);
  });

  router.post('/:index/lifecycle', requireAuth, async (req, res) => {
    const result = await orchestrator.controlLifecycle(parseInt(req.params.index, 10), req.body.action);
    res.status(result.success ? 200 : 400).json(result);
  });

  router.post('/:index/update-config', requireAuth, async (req, res) => {
    const result = await orchestrator.updateBotConfig(parseInt(req.params.index, 10), req.body);
    res.status(result.success ? 200 : 400).json(result);
  });

  return router;
}

module.exports = createBotsRouter;
