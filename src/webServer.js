'use strict';
/**
 * src/webServer.js
 * Express Web Server entrypoint.
 * Inisialisasi Express app, session middleware, logger SSE, dan load API routes.
 */

const express = require('express');
const path    = require('path');

const { isConfirmed }                  = require('./totp');
const { createSessionMiddleware }      = require('./web/middleware');
const authRouter                       = require('./web/routes/auth');
const createBotsRouter                 = require('./web/routes/bots');
const createSystemRouter               = require('./web/routes/system');
const createSSERouter                  = require('./web/sse');

// Safe imports dengan fallback untuk mencegah crash jika file baru belum ter-pull di server
let accessLoggerMiddleware = (req, res, next) => next();
let domainGuardMiddleware = (req, res, next) => next();
let accessRouter = express.Router();

try {
  accessLoggerMiddleware = require('./web/accessLogger').accessLoggerMiddleware;
} catch (e) {
  console.warn('⚠️ [WARN] Modul accessLogger.js belum terunduh di server.');
}

try {
  domainGuardMiddleware = require('./web/domainGuard').domainGuardMiddleware;
} catch (e) {
  console.warn('⚠️ [WARN] Modul domainGuard.js belum terunduh di server.');
}

try {
  accessRouter = require('./web/routes/access');
} catch (e) {
  console.warn('⚠️ [WARN] Modul routes/access.js belum terunduh di server.');
}

function createWebServer(orchestrator) {
  const app = express();

  // CATATAN: trust proxy TIDAK diaktifkan secara global di sini karena domainGuard.js
  // sudah memvalidasi X-Forwarded-Host secara selektif hanya jika Host adalah localhost/127.0.0.1.
  // Mengaktifkan trust proxy di sini akan membuat Express mempercayai X-Forwarded-Host dari
  // semua koneksi termasuk IP direct access, yang dapat membypass domain restriction.

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Session middleware
  app.use(createSessionMiddleware());

  // Access Logging Middleware (Catat semua HTTP request)
  app.use(accessLoggerMiddleware);

  // Domain Security Guard Middleware (Filter domain akses)
  app.use(domainGuardMiddleware);

  // ── Public Routes & Static Assets ──────────────────────────────────────────

  // Serve static assets dengan Cache-Control: no-cache untuk memaksa browser
  // selalu memeriksa versi terbaru file JS/CSS
  app.use(express.static(path.join(__dirname, '..', 'public'), {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      }
    }
  }));

  // Mount Auth Router (login, logout, me, totp status, db status)
  app.use('/', authRouter);

  // ── Protected REST & SSE APIs ──────────────────────────────────────────────

  // Mount Domain Access Control & Access Logs API
  app.use('/api/access', accessRouter);

  // Mount Bots API (createBotsRouter returns a configured router)
  app.use('/api/bots', createBotsRouter(orchestrator));

  // Mount System & Settings API
  app.use('/api', createSystemRouter(orchestrator));

  // Mount SSE Live Stream API
  app.use('/api', createSSERouter(orchestrator));

  // ── Start HTTP Server ──────────────────────────────────────────────────────

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    console.log(`🌐 [WEB DASHBOARD] Dashboard aktif di http://localhost:${port}`);
    console.log(`✅ [SYSTEM] Server status: Ready / Online`);
    if (!isConfirmed()) {
      console.log(`\x1b[33m⚠️  [TOTP] SETUP DIPERLUKAN: Buka http://localhost:${port}/login dan scan QR Code!\x1b[0m`);
    }
  });

  return app;
}

module.exports = { createWebServer };
