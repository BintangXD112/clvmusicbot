'use strict';
/**
 * src/webhook/handler.js
 * HTTP request handler untuk Webhook Server.
 * Menangani: validasi method/path, verifikasi signature, parse payload,
 * filter branch, dan trigger git pull.
 */

const { verifySignature } = require('./security');
const { runGitPull }      = require('./deployer');
const { log, BRANCH }     = require('./config');

/**
 * Buat HTTP request handler untuk digunakan di `http.createServer()`.
 * @returns {Function} Node.js HTTP request handler (req, res) => void
 */
function createRequestHandler() {
  return function handleRequest(req, res) {
    if (process.env.WEBHOOK_DISABLED === 'true') {
      log('WARN', `Webhook request diabaikan karena fitur webhook dinonaktifkan di settings.`);
      res.writeHead(503, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Service Unavailable: Webhook Auto-Deploy is disabled' }));
    }

    // Hanya tangani POST ke /webhook
    if (req.method !== 'POST' || req.url !== '/webhook') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Not Found' }));
    }

    let rawBody = '';
    req.on('data', chunk => (rawBody += chunk.toString()));

    req.on('end', async () => {
      const signature = req.headers['x-hub-signature-256'];

      // Verifikasi signature
      if (!verifySignature(rawBody, signature)) {
        log('WARN', `Request ditolak: Signature tidak valid dari ${req.socket.remoteAddress}`);
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized: Invalid signature' }));
      }

      // Parse payload
      let payload;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Bad Request: Invalid JSON' }));
      }

      const pushedBranch = (payload.ref || '').replace('refs/heads/', '');
      const pusher       = payload.pusher?.name || 'unknown';
      const commitMsg    = payload.head_commit?.message || '-';

      log('INFO', `Push event diterima — Branch: ${pushedBranch}, Pusher: ${pusher}`);
      log('INFO', `Commit: "${commitMsg}"`);

      // Hanya proses push ke branch target
      if (pushedBranch !== BRANCH) {
        log('WARN', `Branch "${pushedBranch}" diabaikan (hanya memproses branch "${BRANCH}").`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ message: `Branch "${pushedBranch}" ignored.` }));
      }

      // Respond segera, lalu pull secara async agar GitHub tidak timeout
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Pull dimulai di background...' }));

      try {
        const result = await runGitPull();
        log('SUCCESS', `git pull berhasil:\n${result.stdout}`);
        if (result.stderr) log('WARN', `stderr: ${result.stderr}`);
      } catch (err) {
        log('ERROR', `git pull gagal: ${err.error}`);
        if (err.stderr) log('ERROR', `stderr: ${err.stderr}`);
      }
    });
  };
}

module.exports = { createRequestHandler };
