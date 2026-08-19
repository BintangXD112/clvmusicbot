const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const path = require('path');
const os = require('os');
const fs = require('fs');

function updateEnvVariable(key, value) {
  const envPath = path.join(__dirname, '..', '.env');
  let content = '';
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8');
  }
  
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (content.match(regex)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    if (content.length > 0 && !content.endsWith('\n')) {
      content += '\n';
    }
    content += `${key}=${value}\n`;
  }
  
  fs.writeFileSync(envPath, content, 'utf8');
  process.env[key] = value;
}
const { loggerEmitter, getLogHistory } = require('./logger');
const { initDb, isDbConnected } = require('./db');
const { verifyTOTP, confirmSetup, isConfirmed, getQrCodeDataUrl } = require('./totp');
const si = require('systeminformation');

const { exec } = require('child_process');

// Cache GPU info to avoid blocking the telemetry loop
let cachedGpu = { controllers: [] };

function queryWindowsGpuMetrics() {
  return new Promise((resolve) => {
    if (os.platform() !== 'win32') return resolve(null);
    
    // Command to get both GPU Load (%) and Dedicated Memory Usage (Bytes) in one fast PowerShell call
    const cmd = "powershell -Command \"$load = (((Get-Counter '\\GPU Engine(*engtype_3D)\\Utilization Percentage' -ErrorAction SilentlyContinue).CounterSamples | Where-Object CookedValue).CookedValue | Measure-Object -Sum).Sum; $vram = (((Get-Counter '\\GPU Adapter Memory(*)\\Dedicated Usage' -ErrorAction SilentlyContinue).CounterSamples | Where-Object CookedValue).CookedValue | Measure-Object -Sum).Sum; Write-Output \\\"$load|$vram\\\"\"";
    
    exec(cmd, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const parts = stdout.trim().split('|');
      const load = parseFloat(parts[0]);
      const vramBytes = parseFloat(parts[1]);
      resolve({
        load: isNaN(load) ? 0 : Math.round(load),
        vramMB: isNaN(vramBytes) ? 0 : Math.round(vramBytes / (1024 * 1024))
      });
    });
  });
}

async function refreshGpuCache() {
  try {
    const data = await si.graphics();
    
    // Fallback: If on Windows and systeminformation does not return utilization, poll performance counters
    if (os.platform() === 'win32' && data.controllers && data.controllers.length > 0) {
      const metrics = await queryWindowsGpuMetrics();
      if (metrics) {
        data.controllers.forEach(ctrl => {
          ctrl.utilizationGpu = metrics.load;
          ctrl.memoryUsed = metrics.vramMB;
          // systeminformation sometimes returns 512MB for integrated graphics even if dynamic VRAM total is higher,
          // so we use the counter value as backup or keep it if valid.
          if (!ctrl.memoryTotal || ctrl.memoryTotal < metrics.vramMB) {
            ctrl.memoryTotal = Math.max(ctrl.memoryTotal || 0, metrics.vramMB);
          }
        });
      }
    }
    
    cachedGpu = data;
  } catch (_) {}
}
refreshGpuCache();
setInterval(refreshGpuCache, 5000); // refresh every 5s for live utilization

// Cache detailed CPU info (for better ARM64 model name via si.cpu)
let cachedCpuInfo = null;
async function refreshCpuInfoCache() {
  try {
    cachedCpuInfo = await si.cpu();
  } catch (_) {}
}
refreshCpuInfoCache(); // one-time fetch (CPU model doesn't change)

// Store CPU tick baseline for calculating usage percentage
let previousCpuTicks = getCpuTicks();

function getCpuTicks() {
  const cpus = os.cpus();
  let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;
  for (const cpu of cpus) {
    user += cpu.times.user;
    nice += cpu.times.nice;
    sys += cpu.times.sys;
    idle += cpu.times.idle;
    irq += cpu.times.irq;
  }
  return { user, nice, sys, idle, irq, total: user + nice + sys + idle + irq };
}

function calculateCpuUsage() {
  const current = getCpuTicks();
  const totalDiff = current.total - previousCpuTicks.total;
  const idleDiff = current.idle - previousCpuTicks.idle;
  previousCpuTicks = current;
  if (totalDiff === 0) return 0;
  return Math.max(0, Math.min(100, 100 - Math.floor((idleDiff / totalDiff) * 100)));
}

function getSystemMetrics() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const processMem = process.memoryUsage();

  // Best CPU model: prefer si.cpu() for ARM64 where os.cpus() is vague
  const arch = os.arch();
  let cpuModel = os.cpus()[0]?.model || 'Unknown CPU';
  if (cachedCpuInfo) {
    const siModel = [cachedCpuInfo.manufacturer, cachedCpuInfo.brand].filter(Boolean).join(' ');
    if (siModel && siModel.trim()) cpuModel = siModel.trim();
  }

  return {
    cpu: {
      model: cpuModel,
      cores: os.cpus().length,
      usagePercent: calculateCpuUsage(),
      arch: arch,
      isArm: arch === 'arm64' || arch === 'arm'
    },
    memory: {
      totalBytes: totalMem,
      usedBytes: usedMem,
      freeBytes: freeMem,
      usedPercent: Math.round((usedMem / totalMem) * 100),
      processRss: processMem.rss,
      processHeapTotal: processMem.heapTotal,
      processHeapUsed: processMem.heapUsed
    },
    os: {
      platform: os.platform(),
      release: os.release(),
      hostname: os.hostname(),
      uptimeSeconds: os.uptime()
    },
    process: {
      uptimeSeconds: Math.floor(process.uptime()),
      pid: process.pid,
      nodeVersion: process.version
    },
    gpu: {
      controllers: (cachedGpu.controllers || []).map(g => ({
        model: g.model || 'Unknown GPU',
        vendor: g.vendor || '',
        vramMB: g.vram || 0,
        vramUsedMB: g.memoryUsed || 0,
        vramFreeMB: g.memoryFree || 0,
        vramTotalMB: g.memoryTotal || g.vram || 0,
        vramDynamic: g.vramDynamic || false,
        utilizationPercent: (g.utilizationGpu !== null && g.utilizationGpu !== undefined) ? g.utilizationGpu : -1,
        temperatureC: (g.temperatureGpu !== null && g.temperatureGpu !== undefined) ? g.temperatureGpu : -1,
        driverVersion: g.driverVersion || 'N/A'
      }))
    }
  };
}

function createWebServer(orchestrator) {
  initDb();

  const app = express();

  // Trust reverse proxy (nginx, Cloudflare, etc.)
  app.set('trust proxy', 1);

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Session: persistent file-based store (survives server restarts)
  const sessionsDir = path.join(__dirname, '..', '.sessions');
  app.use(session({
    store: new FileStore({
      path: sessionsDir,
      ttl: 86400,       // 24 hours in seconds
      retries: 1,
      reapInterval: 3600
    }),
    secret: process.env.SESSION_SECRET || 'discord_afk_totp_secret_key_998877',
    name: 'dcafk.sid',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: false,
      sameSite: 'lax'
    }
  }));

  // Auth guard middleware
  const requireAuth = (req, res, next) => {
    if (req.session && req.session.authenticated === true) {
      return next();
    }
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Unauthorized. Silakan login terlebih dahulu.' });
    }
    return res.redirect('/login');
  };

  // -------------------------------------------------------
  // Public routes (no auth needed)
  // -------------------------------------------------------

  // Serve static assets FIRST (app.js, style.css, fonts, etc.)
  // so they load correctly inside the authenticated dashboard
  app.use(express.static(path.join(__dirname, '..', 'public'), {
    // Never serve index.html automatically — always go through '/' route
    index: false
  }));

  // Login page
  app.get('/login', async (req, res) => {
    if (req.session && req.session.authenticated) {
      return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
  });

  // TOTP status (public — needed by login page JS)
  app.get('/api/totp-status', async (req, res) => {
    const confirmed = isConfirmed();
    let qrCode = null;
    if (!confirmed) {
      qrCode = await getQrCodeDataUrl();
    }
    res.json({ confirmed, qrCode, dbConnected: isDbConnected() });
  });

  // TOTP Login
  app.post('/api/login', (req, res) => {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Kode 6-digit wajib diisi.' });
    }

    const isValid = verifyTOTP(token.trim());
    if (!isValid) {
      return res.status(401).json({ error: 'Kode tidak valid atau sudah kedaluwarsa. Coba lagi.' });
    }

    if (!isConfirmed()) {
      confirmSetup();
    }

    // Set session and explicitly save before responding
    req.session.authenticated = true;
    req.session.loginTime = new Date().toISOString();

    req.session.save((err) => {
      if (err) {
        console.error('[SESSION] Failed to save session:', err.message);
        return res.status(500).json({ error: 'Gagal menyimpan sesi login. Coba lagi.' });
      }
      res.json({ success: true, message: 'Login berhasil!' });
    });
  });

  // Logout
  app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('dcafk.sid');
      res.json({ success: true, message: 'Logout berhasil.' });
    });
  });

  // DB status (public info)
  app.get('/api/db-status', (req, res) => {
    res.json({ mysqlConnected: isDbConnected(), database: process.env.DB_NAME || '' });
  });

  // -------------------------------------------------------
  // Protected routes (auth required)
  // -------------------------------------------------------

  // Main dashboard
  app.get('/', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  // Session info
  app.get('/api/me', requireAuth, (req, res) => {
    res.json({ loggedIn: true, loginTime: req.session.loginTime });
  });

  // SSE Stream
  const sseClients = new Set();

  loggerEmitter.on('log', (entry) => {
    const payload = `data: ${JSON.stringify({ type: 'log', data: entry })}\n\n`;
    for (const client of sseClients) {
      try { client.res.write(payload); } catch (_) {}
    }
  });

  app.get('/api/stream', requireAuth, (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(`data: ${JSON.stringify({ type: 'init_logs', data: getLogHistory() })}\n\n`);
    const clientObj = { id: Date.now(), res };
    sseClients.add(clientObj);
    req.on('close', () => sseClients.delete(clientObj));
  });

  // Periodic SSE telemetry push
  setInterval(() => {
    if (sseClients.size === 0) return;
    try {
      const msg = `data: ${JSON.stringify({ type: 'telemetry', data: { system: getSystemMetrics(), bots: orchestrator.getBotsSummary() } })}\n\n`;
      for (const client of sseClients) {
        try { client.res.write(msg); } catch (_) {}
      }
    } catch (_) {}
  }, 2000);

  // Bot APIs
  app.get('/api/system', requireAuth, (req, res) => res.json(getSystemMetrics()));
  app.get('/api/bots', requireAuth, (req, res) => res.json(orchestrator.getBotsSummary()));

  app.get('/api/bots/:index/channels', requireAuth, async (req, res) => {
    const idx = parseInt(req.params.index, 10);
    const channels = await orchestrator.getGuildVoiceChannels(idx);
    if (!channels) return res.status(404).json({ error: 'Gagal mengambil daftar Voice Channel.' });
    res.json(channels);
  });

  app.post('/api/bots/:index/move', requireAuth, async (req, res) => {
    const idx = parseInt(req.params.index, 10);
    const { voiceChannelId } = req.body;
    if (!voiceChannelId) return res.status(400).json({ error: 'voiceChannelId diperlukan.' });
    const success = await orchestrator.moveBotChannel(idx, voiceChannelId);
    res.json(success ? { success: true, message: `Bot dipindahkan ke ${voiceChannelId}` } : { success: false, error: 'Gagal memindahkan bot.' });
  });

  app.post('/api/bots/:index/voice-state', requireAuth, async (req, res) => {
    const result = await orchestrator.controlVoiceState(parseInt(req.params.index, 10), req.body.action);
    res.status(result.success ? 200 : 400).json(result);
  });

  app.post('/api/bots/:index/lifecycle', requireAuth, async (req, res) => {
    const result = await orchestrator.controlLifecycle(parseInt(req.params.index, 10), req.body.action);
    res.status(result.success ? 200 : 400).json(result);
  });

  app.post('/api/bots/:index/update-config', requireAuth, async (req, res) => {
    const result = await orchestrator.updateBotConfig(parseInt(req.params.index, 10), req.body);
    res.status(result.success ? 200 : 400).json(result);
  });

  app.post('/api/bots/config/add', requireAuth, async (req, res) => {
    const result = await orchestrator.addBotConfig(req.body);
    res.status(result.success ? 200 : 400).json(result);
  });

  app.delete('/api/bots/config/:index', requireAuth, async (req, res) => {
    const result = await orchestrator.deleteBotConfig(parseInt(req.params.index, 10));
    res.status(result.success ? 200 : 400).json(result);
  });

  app.post('/api/bots/bulk/voice-state', requireAuth, async (req, res) => {
    const { action } = req.body;
    if (!action) return res.status(400).json({ error: 'action diperlukan.' });
    const result = await orchestrator.bulkControlVoiceState(action);
    res.status(result.success ? 200 : 400).json(result);
  });

  app.post('/api/bots/bulk/move', requireAuth, async (req, res) => {
    const { voiceChannelId } = req.body;
    if (!voiceChannelId) return res.status(400).json({ error: 'voiceChannelId diperlukan.' });
    const result = await orchestrator.bulkMoveBotChannel(voiceChannelId);
    res.status(result.success ? 200 : 400).json(result);
  });

  app.post('/api/system/restart-all', requireAuth, async (req, res) => {
    res.json(await orchestrator.restartAllBots());
  });

  app.get('/api/settings', requireAuth, (req, res) => {
    res.json({
      geminiApiKey: process.env.GEMINI_API_KEY || '',
      geminiModel: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
      musicPrefix: process.env.MUSIC_PREFIX || '!',
      ownerIds: process.env.OWNER_IDS || '',
      defaultVolume: process.env.DEFAULT_VOLUME || '100',
      idleTimeout: process.env.IDLE_TIMEOUT || '60'
    });
  });

  app.post('/api/settings', requireAuth, (req, res) => {
    const { geminiApiKey, geminiModel, musicPrefix, ownerIds, defaultVolume, idleTimeout } = req.body;
    if (geminiApiKey === undefined || musicPrefix === undefined || defaultVolume === undefined || idleTimeout === undefined) {
      return res.status(400).json({ error: 'Semua variabel setting wajib diisi.' });
    }
    try {
      updateEnvVariable('GEMINI_API_KEY', geminiApiKey.trim());
      if (geminiModel && geminiModel.trim()) updateEnvVariable('GEMINI_MODEL', geminiModel.trim());
      updateEnvVariable('MUSIC_PREFIX', musicPrefix.trim());
      updateEnvVariable('OWNER_IDS', (ownerIds || '').trim());
      updateEnvVariable('DEFAULT_VOLUME', defaultVolume.trim());
      updateEnvVariable('IDLE_TIMEOUT', idleTimeout.trim());
      // Re-initialize Gemini agent so the new API key/model is active immediately
      try { require('../ai/GeminiMusicAgent').init(); } catch (_) {}
      res.json({ success: true, message: 'Settings berhasil disimpan dan diterapkan.' });
    } catch (err) {
      res.status(500).json({ error: `Gagal menyimpan settings: ${err.message}` });
    }
  });

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
