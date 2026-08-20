/**
 * webhook.js - GitHub Auto-Deploy Webhook Server Entry point
 * Listens on port 24601 for GitHub push events and runs git pull origin main.
 *
 * Re-organized into modules under src/webhook/ for maintainability.
 */

const http = require('http');
const { PORT, log, BRANCH, PROJECT_DIR, WEBHOOK_SECRET } = require('./src/webhook/config');
const { createRequestHandler } = require('./src/webhook/handler');

const server = http.createServer(createRequestHandler());

server.listen(PORT, () => {
  log('SUCCESS', `===================================================`);
  log('SUCCESS', ` Webhook Server aktif di http://0.0.0.0:${PORT}/webhook`);
  log('SUCCESS', ` Listening untuk push ke branch: "${BRANCH}"`);
  log('SUCCESS', ` Project Dir: ${PROJECT_DIR}`);
  if (!WEBHOOK_SECRET) {
    log('WARN', ` WEBHOOK_SECRET tidak diset! Tambahkan ke .env untuk keamanan.`);
  }
  log('SUCCESS', `===================================================`);
});

// Graceful shutdown
function handleShutdown() {
  log('INFO', 'Webhook server dimatikan.');
  server.close(() => process.exit(0));
}

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);
