'use strict';
/**
 * src/web/sse.js
 * Server-Sent Events (SSE) untuk live telemetry dan log streaming ke browser.
 */

const express              = require('express');
const { loggerEmitter, getLogHistory } = require('../logger');
const { getSystemMetrics }             = require('../system/metrics');
const { requireAuth }                  = require('./middleware');

/**
 * Buat Express Router untuk SSE stream.
 * @param {Object} orchestrator - Instance botOrchestrator
 * @returns {import('express').Router}
 */
function createSSERouter(orchestrator) {
  const router     = express.Router();
  const sseClients = new Set();

  // Teruskan log baru ke semua SSE client yang terhubung
  loggerEmitter.on('log', (entry) => {
    const payload = `data: ${JSON.stringify({ type: 'log', data: entry })}\n\n`;
    for (const client of sseClients) {
      try { client.res.write(payload); } catch (_) {}
    }
  });

  // GET /api/stream — SSE endpoint
  router.get('/stream', requireAuth, (req, res) => {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive'
    });
    // Kirim log history saat client pertama kali connect
    res.write(`data: ${JSON.stringify({ type: 'init_logs', data: getLogHistory() })}\n\n`);

    const clientObj = { id: Date.now(), res };
    sseClients.add(clientObj);
    req.on('close', () => sseClients.delete(clientObj));
  });

  // Push telemetry (system metrics + bot status) setiap 2 detik ke semua client
  setInterval(() => {
    if (sseClients.size === 0) return;
    try {
      const msg = `data: ${JSON.stringify({
        type: 'telemetry',
        data: {
          system: getSystemMetrics(),
          bots:   orchestrator.getBotsSummary()
        }
      })}\n\n`;
      for (const client of sseClients) {
        try { client.res.write(msg); } catch (_) {}
      }
    } catch (_) {}
  }, 2000);

  return router;
}

module.exports = createSSERouter;
