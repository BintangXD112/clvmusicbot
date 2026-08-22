/**
 * public/js/ui/updater.js
 * Modul UI untuk halaman Version Control — Git Pull / Update dari GitHub.
 */

var updaterStatus = null;
var updaterPollInterval = null;

/**
 * Inisialisasi halaman updater — muat status dan mulai auto-refresh.
 */
function startUpdaterPage() {
  fetchUpdateStatus();
  loadGitConfig();
  if (!updaterPollInterval) {
    updaterPollInterval = setInterval(fetchUpdateStatus, 30000);
  }
}

function stopUpdaterPage() {
  if (updaterPollInterval) {
    clearInterval(updaterPollInterval);
    updaterPollInterval = null;
  }
}

/**
 * Ambil status git (branch, commit, update tersedia) dari API.
 */
async function fetchUpdateStatus() {
  const card = document.getElementById('update-status-card');
  const skeleton = document.getElementById('update-skeleton');
  if (skeleton) skeleton.style.display = '';

  try {
    const res = await fetch('/api/update/status');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    updaterStatus = data;
    renderUpdateStatus(data);
  } catch (err) {
    console.error('[Updater] fetchUpdateStatus error:', err);
    renderUpdateError(err.message);
  } finally {
    if (skeleton) skeleton.style.display = 'none';
  }
}

/**
 * Render informasi versi dan status update.
 */
function renderUpdateStatus(data) {
  // Current version info
  const el = (id) => document.getElementById(id);

  if (el('upd-branch')) el('upd-branch').textContent = data.branch || '—';
  if (el('upd-hash')) el('upd-hash').textContent = data.localHash || '—';
  if (el('upd-msg')) el('upd-msg').textContent = data.localMessage || '—';
  if (el('upd-author')) el('upd-author').textContent = data.localAuthor || '—';
  if (el('upd-date')) el('upd-date').textContent = data.localDate
    ? new Date(data.localDate).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
  if (el('upd-remote-url')) {
    const url = data.remoteUrl || '';
    el('upd-remote-url').textContent = url;
    el('upd-remote-url').href = url.replace(/\.git$/, '');
  }

  // Update badge
  const badge = el('upd-badge');
  const badgeText = el('upd-badge-text');
  if (badge && badgeText) {
    if (data.hasUpdate) {
      badge.className = 'update-badge has-update';
      badgeText.textContent = `${data.behindCount} commit baru tersedia`;
    } else {
      badge.className = 'update-badge up-to-date';
      badgeText.textContent = 'Up-to-date';
    }
  }

  // Tampilkan/sembunyikan panel pull
  const pullPanel = el('upd-pull-panel');
  const noUpdatePanel = el('upd-noupdate-panel');
  if (pullPanel) pullPanel.style.display = data.hasUpdate ? '' : 'none';
  if (noUpdatePanel) noUpdatePanel.style.display = data.hasUpdate ? 'none' : '';

  // Daftar remote commits yang menunggu
  const remoteList = el('upd-remote-commits');
  if (remoteList) {
    if (data.remoteCommits && data.remoteCommits.length > 0) {
      remoteList.innerHTML = data.remoteCommits.map(c => `
        <div class="commit-item pending">
          <div class="commit-hash"><i class="fa-brands fa-github"></i> ${safeEscapeUpd(c.hash)}</div>
          <div class="commit-meta">
            <span class="commit-msg">${safeEscapeUpd(c.message)}</span>
            <span class="commit-author"><i class="fa-solid fa-user"></i> ${safeEscapeUpd(c.author)}</span>
            <span class="commit-date text-dim">${c.date ? new Date(c.date).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
          </div>
        </div>
      `).join('');
    } else {
      remoteList.innerHTML = '';
    }
  }

  // Daftar local commits
  const localList = el('upd-local-commits');
  if (localList && data.commits && data.commits.length > 0) {
    localList.innerHTML = data.commits.map((c, i) => `
      <div class="commit-item ${i === 0 ? 'latest' : ''}">
        <div class="commit-hash"><i class="fa-solid fa-code-commit"></i> ${safeEscapeUpd(c.hash)}</div>
        <div class="commit-meta">
          <span class="commit-msg">${safeEscapeUpd(c.message)}</span>
          <span class="commit-author"><i class="fa-solid fa-user"></i> ${safeEscapeUpd(c.author)}</span>
          <span class="commit-date text-dim">${c.date ? new Date(c.date).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
        </div>
        ${i === 0 ? '<span class="badge badge-success badge-sm">HEAD</span>' : ''}
      </div>
    `).join('');
  }
}

/**
 * Tampilkan error status.
 */
function renderUpdateError(msg) {
  const el = document.getElementById('upd-badge');
  const badgeText = document.getElementById('upd-badge-text');
  if (el) el.className = 'update-badge error';
  if (badgeText) badgeText.textContent = 'Error: ' + msg;
}

/**
 * Cek update terbaru (manual check/refresh).
 */
async function checkForUpdates() {
  const btn = document.getElementById('btn-check-update');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Mengecek...';
  }
  try {
    const res = await fetch('/api/update/check');
    const data = await res.json();
    if (data.success) {
      showToast(data.hasUpdate
        ? `🎉 Ada ${data.behindCount} commit baru di branch ${data.branch}!`
        : '✅ Versi sudah terbaru (up-to-date).',
        data.hasUpdate ? 'info' : 'success'
      );
    }
    await fetchUpdateStatus();
  } catch (err) {
    showToast('Gagal mengecek update: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Cek Update';
    }
  }
}

/**
 * Jalankan git pull dari GitHub.
 */
async function runGitPull() {
  const installDeps = document.getElementById('upd-install-deps')?.checked || false;
  const confirmMsg = installDeps
    ? 'Ini akan menjalankan `git pull` lalu `npm install` di server.\n\nPastikan Anda sudah backup konfigurasi penting (.env, bots.json) sebelum update.\n\nLanjutkan?'
    : 'Ini akan menjalankan `git pull` dari GitHub.\n\nLanjutkan update?';

  if (!confirm(confirmMsg)) return;

  const btn = document.getElementById('btn-run-pull');
  const logBox = document.getElementById('upd-pull-log');
  const logContent = document.getElementById('upd-pull-log-content');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Sedang Update...';
  }
  if (logBox) logBox.style.display = '';
  if (logContent) logContent.textContent = '⏳ Memulai proses git pull...';

  try {
    const res = await fetch('/api/update/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installDeps })
    });
    const data = await res.json();

    if (logContent) logContent.textContent = data.log || '(tidak ada output)';

    if (data.success) {
      showToast('✅ Update berhasil! ' + (data.newMessage || ''), 'success');
      // Refresh status setelah pull berhasil
      setTimeout(fetchUpdateStatus, 1000);
    } else {
      showToast('❌ Update gagal. Lihat log di bawah untuk detail.', 'error');
    }
  } catch (err) {
    if (logContent) logContent.textContent = '[ERROR] ' + err.message;
    showToast('Update gagal: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-brands fa-github"></i> Pull dari GitHub Sekarang';
    }
  }
}

/**
 * Muat konfigurasi Git Repository & Token dari backend.
 */
async function loadGitConfig() {
  try {
    const res = await fetch('/api/update/config');
    if (!res.ok) return;
    const data = await res.json();

    const repoInput = document.getElementById('cfg-git-repo');
    const branchInput = document.getElementById('cfg-git-branch');
    const tokenInput = document.getElementById('cfg-git-token');

    if (repoInput) repoInput.value = data.repo || 'https://github.com/BintangXD112/clvmusicbot';
    if (branchInput) branchInput.value = data.branch || 'main';
    if (tokenInput && data.hasToken) {
      tokenInput.placeholder = '•••••••••••••••••••• (Token tersimpan di .env)';
    }
  } catch (err) {
    console.error('Gagal memuat git config:', err);
  }
}

/**
 * Simpan konfigurasi Git Repository, Branch, dan Token ke backend (.env).
 */
async function saveGitConfig() {
  const repo = document.getElementById('cfg-git-repo')?.value.trim();
  const branch = document.getElementById('cfg-git-branch')?.value.trim() || 'main';
  const token = document.getElementById('cfg-git-token')?.value.trim();

  if (!repo) {
    showToast('URL Git Repository tidak boleh kosong!', 'warn');
    return;
  }

  showToast('Menyimpan konfigurasi Git...', 'info');

  try {
    const body = { repo, branch };
    if (token) body.token = token;

    const res = await fetch('/api/update/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast(data.message || 'Konfigurasi Git berhasil disimpan!', 'success');
      loadGitConfig();
      fetchUpdateStatus();
    } else {
      showToast(data.error || 'Gagal menyimpan konfigurasi Git', 'error');
    }
  } catch (err) {
    showToast('Kesalahan jaringan saat menyimpan konfigurasi Git', 'error');
  }
}

/**
 * Toggle visibility password / text untuk input Git Token.
 */
function toggleGitTokenVisibility() {
  const input = document.getElementById('cfg-git-token');
  const icon = document.getElementById('git-token-eye');
  if (!input || !icon) return;

  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'fa-solid fa-eye-slash';
  } else {
    input.type = 'password';
    icon.className = 'fa-solid fa-eye';
  }
}

/** Helper XSS-safe escape untuk updater */
function safeEscapeUpd(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
