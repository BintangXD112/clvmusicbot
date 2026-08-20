'use strict';
/**
 * src/webServer.js
 * Express Web Server entrypoint.
 * Inisialisasi Express app, session middleware, logger SSE, dan load API routes.
 */

const express = require('express');
const path    = require('path');

const { initDb }                       = require('./db');
const { isConfirmed }                  = require('./totp');
const { createSessionMiddleware }      = require('./web/middleware');
const authRouter                       = require('./web/routes/auth');
const createBotsRouter                 = require('./web/routes/bots');
const createSystemRouter               = require('./web/routes/system');
const createSSERouter                  = require('./web/sse');

function createWebServer(orchestrator) {
  initDb();

  const app = express();

  // Trust reverse proxy (nginx, Cloudflare, etc.)
  app.set('trust proxy', 1);

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Session middleware
  app.use(createSessionMiddleware());

  // ── Public Routes & Static Assets ──────────────────────────────────────────

  // Serve static assets first (app.js, style.css, dll)
  app.use(express.static(path.join(__dirname, '..', 'public'), {
    index: false
  }));

  // Mount Auth Router (login, logout, me, totp status, db status)
  app.use('/', authRouter);

  // ── Protected REST & SSE APIs ──────────────────────────────────────────────

  // Mount Bots API (createBotsRouter returns a configured router)
  app.use('/api/bots', createBotsRouter(orchestrator));

  // Mount System & Settings API
  app.use('/api', createSystemRouter(orchestrator));

  // Mount SSE Live Stream API
  app.use('/api', createSSERouter(orchestrator));

  // ── Start HTTP Server ──────────────────────────────────────────────────────

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`🌐 [WEB DASHBOARD] Dashboard aktif di http://localhost:${port}`);
    if (!isConfirmed()) {
      console.log(`\x1b[33m⚠️  [TOTP] SETUP DIPERLUKAN: Buka http://localhost:${port}/login dan scan QR Code!\x1b[0m`);
    }
  });

  return app;
}

module.exports = { createWebServer };
