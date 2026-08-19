/**
 * webhook.js - GitHub Auto-Deploy Webhook Server
 * Listens on port 24601 for GitHub push events and runs git pull origin main
 * 
 * Setup GitHub Webhook:
 *   URL    : http://YOUR_SERVER_IP:24601/webhook
 *   Secret : Isi WEBHOOK_SECRET di .env
 *   Events : Just the push event
 */

require('dotenv').config();
const http = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');
const path = require('path');

const PORT = parseInt(process.env.WEBHOOK_PORT || '24602', 10);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const BRANCH = process.env.WEBHOOK_BRANCH || 'main';
const PROJECT_DIR = path.resolve(__dirname); // Root folder proyek ini

// ANSI color codes
const C = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(level, message) {
  const now = new Date().toLocaleTimeString('id-ID');
  const colors = { INFO: C.cyan, SUCCESS: C.green, WARN: C.yellow, ERROR: C.red };
  console.log(`${colors[level] || ''}[${now}] [WEBHOOK] [${level}]${C.reset} ${message}`);
}

/**
 * Verifikasi HMAC-SHA256 signature dari GitHub
 */
function verifySignature(rawBody, signatureHeader) {
  if (!WEBHOOK_SECRET) return true; // Jika tidak ada secret, lewati verifikasi
  if (!signatureHeader) return false;

  const expected = `sha256=${crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex')}`;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signatureHeader)
    );
  } catch {
    return false;
  }
}

/**
 * Jalankan git pull origin <branch> di direktori proyek
 */
function runGitPull() {
  return new Promise((resolve, reject) => {
    const command = `git -C "${PROJECT_DIR}" pull origin ${BRANCH}`;
    log('INFO', `Menjalankan: ${command}`);

    exec(command, (err, stdout, stderr) => {
      if (err) {
        reject({ error: err.message, stderr });
        return;
      }
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

const server = http.createServer((req, res) => {
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
    const pusher = payload.pusher?.name || 'unknown';
    const commitMsg = payload.head_commit?.message || '-';

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
});

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
process.on('SIGINT', () => {
  log('INFO', 'Webhook server dimatikan.');
  server.close(() => process.exit(0));
});
process.on('SIGTERM', () => {
  log('INFO', 'Webhook server dimatikan.');
  server.close(() => process.exit(0));
});
