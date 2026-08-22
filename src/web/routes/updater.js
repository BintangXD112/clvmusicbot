'use strict';
/**
 * src/web/routes/updater.js
 * API Route untuk Version Control — Git Pull / Update dari GitHub.
 * Menggunakan GIT_REPO, GIT_BRANCH, GIT_TOKEN dari .env.
 */

const express    = require('express');
const { exec }   = require('child_process');
const path       = require('path');
const { requireAuth } = require('../middleware');

const router = express.Router();

// Root directory project (dua level di atas routes/)
const ROOT_DIR = path.join(__dirname, '..', '..', '..');

/**
 * Ambil konfigurasi Git dari environment.
 * Mendukung injeksi token ke URL secara aman (tidak pernah di-log).
 */
function getGitConfig() {
  const repo   = process.env.GIT_REPO   || '';
  const branch = process.env.GIT_BRANCH || 'main';
  const token  = process.env.GIT_TOKEN  || '';

  // Buat authenticated URL jika token tersedia dan repo adalah HTTPS
  let authUrl = repo;
  if (token && repo.startsWith('https://')) {
    // Format: https://<token>@github.com/user/repo.git
    authUrl = repo.replace('https://', `https://${token}@`);
  }

  return { repo, branch, token, authUrl };
}

/**
 * Jalankan perintah shell dan kembalikan output sebagai Promise.
 * Token di-redact dari output agar tidak bocor ke frontend.
 */
function runShell(cmd, cwd = ROOT_DIR) {
  const { token } = getGitConfig();
  return new Promise((resolve) => {
    exec(cmd, { cwd, timeout: 120000, maxBuffer: 1024 * 512, env: { ...process.env } }, (err, stdout, stderr) => {
      // Redact token dari semua output
      const redact = (s) => token ? (s || '').replace(new RegExp(token, 'g'), '[TOKEN]') : (s || '');
      resolve({
        success: !err,
        exitCode: err ? err.code : 0,
        stdout: redact((stdout || '').trim()),
        stderr: redact((stderr || '').trim()),
        error: err ? redact(err.message) : null
      });
    });
  });
}

/**
 * GET /api/update/status
 * Ambil informasi versi Git saat ini dan cek apakah ada update dari remote GitHub.
 */
router.get('/status', requireAuth, async (req, res) => {
  try {
    const { repo, branch: cfgBranch, authUrl } = getGitConfig();

    // Pastikan remote 'origin' mengarah ke repo yang benar (jika GIT_REPO diset)
    if (repo) {
      await runShell(`git remote set-url origin "${authUrl}"`);
    }

    const [branchRes, localCommit, remoteOrigin, gitLog] = await Promise.all([
      runShell('git rev-parse --abbrev-ref HEAD'),
      runShell('git log -1 --format="%H|%s|%an|%ai"'),
      runShell('git remote get-url origin'),
      runShell('git log -5 --format="%H|%s|%an|%ai"')
    ]);

    const activeBranch = branchRes.stdout || cfgBranch;

    // Fetch dari remote agar bisa membandingkan
    await runShell('git fetch origin');

    // Hitung commit yang belum di-pull
    const behindResult = await runShell(`git rev-list HEAD...origin/${cfgBranch} --count`);
    const behindCount  = parseInt(behindResult.stdout || '0', 10);
    const hasUpdate    = !isNaN(behindCount) && behindCount > 0;

    // Parse local commit
    const localParts  = (localCommit.stdout || '').split('|');
    const localHash   = localParts[0] || '';

    // Parse recent local commits
    const commits = (gitLog.stdout || '').split('\n').filter(Boolean).map(line => {
      const p = line.split('|');
      return { hash: (p[0] || '').substring(0, 8), message: p[1] || '', author: p[2] || '', date: p[3] || '' };
    });

    // Commit remote yang menunggu
    let remoteCommits = [];
    if (hasUpdate) {
      const remoteLog = await runShell(`git log HEAD..origin/${cfgBranch} --format="%H|%s|%an|%ai" -10`);
      remoteCommits = (remoteLog.stdout || '').split('\n').filter(Boolean).map(line => {
        const p = line.split('|');
        return { hash: (p[0] || '').substring(0, 8), message: p[1] || '', author: p[2] || '', date: p[3] || '' };
      });
    }

    // Sembunyikan token dari remoteUrl yang dikirim ke frontend
    const safeRemoteUrl = (remoteOrigin.stdout || repo || '').replace(/https:\/\/[^@]+@/, 'https://');

    res.json({
      success: true,
      branch: activeBranch,
      configBranch: cfgBranch,
      localHash: localHash.substring(0, 8),
      localHashFull: localHash,
      localMessage: localParts[1] || '',
      localAuthor: localParts[2] || '',
      localDate: localParts[3] || '',
      remoteUrl: safeRemoteUrl,
      hasUpdate,
      behindCount,
      commits,
      remoteCommits,
      gitConfigured: !!repo
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/update/pull
 * Jalankan git pull dari GitHub menggunakan kredensial di .env.
 */
router.post('/pull', requireAuth, async (req, res) => {
  const { installDeps = false } = req.body;
  const { repo, branch, authUrl } = getGitConfig();
  const lines = [];

  try {
    // Pastikan remote mengarah ke repo yang benar
    if (repo) {
      await runShell(`git remote set-url origin "${authUrl}"`);
      lines.push(`[INIT] Remote set ke: ${repo}`);
    }

    lines.push(`[1/3] Menjalankan git pull origin ${branch}...`);
    const pullResult = await runShell(`git pull origin ${branch} --ff-only`);

    if (!pullResult.success) {
      const errMsg = pullResult.stderr || pullResult.error || 'Unknown error';
      if (errMsg.includes('conflict')) {
        return res.json({ success: false, log: [...lines, `❌ Merge conflict:\n${errMsg}`].join('\n') });
      }
      if (errMsg.includes('up to date') || pullResult.stdout.includes('up to date')) {
        lines.push('✅ Sudah up-to-date, tidak ada yang perlu di-pull.');
        return res.json({ success: true, log: lines.join('\n'), alreadyUpToDate: true });
      }
      return res.json({ success: false, log: [...lines, `❌ Gagal pull:\n${errMsg}`].join('\n') });
    }

    lines.push(pullResult.stdout || pullResult.stderr || '(no output)');

    if (installDeps) {
      lines.push('\n[2/3] Menjalankan npm install...');
      const npmResult = await runShell('npm install --omit=dev');
      lines.push(npmResult.stdout || npmResult.stderr || '(no output)');
    } else {
      lines.push('[2/3] npm install dilewati (tidak dicentang).');
    }

    const newCommit = await runShell('git log -1 --format="%H|%s|%an|%ai"');
    const parts = (newCommit.stdout || '').split('|');
    lines.push(`\n[3/3] ✅ Update berhasil!`);
    lines.push(`Commit terbaru: ${(parts[0] || '').substring(0, 8)} — ${parts[1] || ''}`);

    res.json({
      success: true,
      log: lines.join('\n'),
      newHash: (parts[0] || '').substring(0, 8),
      newMessage: parts[1] || '',
      newAuthor: parts[2] || '',
      newDate: parts[3] || ''
    });
  } catch (err) {
    lines.push(`\n[ERROR] ${err.message}`);
    res.status(500).json({ success: false, log: lines.join('\n'), error: err.message });
  }
});

/**
 * GET /api/update/check
 * Lightweight: hanya git fetch + hitung apakah ada commit baru.
 */
router.get('/check', requireAuth, async (req, res) => {
  try {
    const { repo, branch, authUrl } = getGitConfig();
    if (repo) await runShell(`git remote set-url origin "${authUrl}"`);
    await runShell('git fetch origin');
    const behindResult = await runShell(`git rev-list HEAD...origin/${branch} --count`);
    const behindCount  = parseInt(behindResult.stdout || '0', 10);
    const hasUpdate    = !isNaN(behindCount) && behindCount > 0;
    res.json({ success: true, hasUpdate, behindCount, branch });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/update/config
 * Ambil konfigurasi Git saat ini (tanpa membuka token).
 */
router.get('/config', requireAuth, (req, res) => {
  const { repo, branch } = getGitConfig();
  const hasToken = !!(process.env.GIT_TOKEN && process.env.GIT_TOKEN.trim());
  res.json({
    repo: repo || 'https://github.com/BintangXD112/clvmusicbot',
    branch: branch || 'main',
    hasToken
  });
});

/**
 * POST /api/update/config
 * Simpan konfigurasi Git (GIT_REPO, GIT_BRANCH, GIT_TOKEN) ke .env.
 */
router.post('/config', requireAuth, (req, res) => {
  const { repo, branch, token } = req.body;
  const { updateEnvVariable } = require('../middleware');

  try {
    if (repo !== undefined) updateEnvVariable('GIT_REPO', repo.trim());
    if (branch !== undefined) updateEnvVariable('GIT_BRANCH', branch.trim() || 'main');
    if (token !== undefined && token.trim() !== '') {
      updateEnvVariable('GIT_TOKEN', token.trim());
    } else if (req.body.clearToken === true) {
      updateEnvVariable('GIT_TOKEN', '');
    }

    res.json({
      success: true,
      message: 'Konfigurasi Git Repository berhasil disimpan ke .env!'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
