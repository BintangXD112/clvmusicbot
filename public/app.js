// Global State
let currentBotsData = [];
let logEntries = [];
let activeLogLevel = 'ALL';

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
  // Bind header buttons by ID — no onclick attributes in HTML needed
  document.getElementById('btn-logout')?.addEventListener('click', logoutUser);
  document.getElementById('btn-refresh')?.addEventListener('click', fetchData);
  document.getElementById('btn-restart-all')?.addEventListener('click', restartAllBots);
  document.getElementById('btn-add-bot')?.addEventListener('click', openAddBotModal);

  checkAuthSession();
  initSSE();
  fetchData();

  // Backup poll every 5s if SSE disconnects
  setInterval(() => {
    if (!window.sseConnected) fetchData();
  }, 5000);
});

// =============================================================
// Auth
// =============================================================
async function checkAuthSession() {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) window.location.href = '/login';
  } catch (_) {
    window.location.href = '/login';
  }
}

async function logoutUser() {
  if (!confirm('Apakah Anda yakin ingin keluar / logout?')) return;
  try { await fetch('/api/logout', { method: 'POST' }); } catch (_) {}
  window.location.href = '/login';
}

// =============================================================
// 1. SSE Live Telemetry
// =============================================================
function initSSE() {
  const liveIndicator = document.getElementById('live-indicator');
  const eventSource = new EventSource('/api/stream');

  eventSource.onopen = () => {
    window.sseConnected = true;
    if (liveIndicator) {
      liveIndicator.innerHTML = '<span class="pulse-dot"></span><span class="status-text">SSE Live Connected</span>';
      liveIndicator.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    }
  };

  eventSource.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'init_logs') {
        logEntries = message.data || [];
        renderLogs();
      } else if (message.type === 'log') {
        logEntries.push(message.data);
        if (logEntries.length > 200) logEntries.shift();
        appendLogEntry(message.data);
      } else if (message.type === 'telemetry') {
        if (message.data.system) updateSystemMetrics(message.data.system);
        if (message.data.bots) updateBotsSection(message.data.bots);
      }
    } catch (e) {}
  };

  eventSource.onerror = () => {
    window.sseConnected = false;
    if (liveIndicator) {
      liveIndicator.innerHTML = '<span class="pulse-dot" style="background-color:var(--danger)"></span><span class="status-text" style="color:var(--danger)">SSE Disconnected</span>';
    }
  };
}

// =============================================================
// 2. REST Data Fetch
// =============================================================
async function fetchData() {
  try {
    const [sysRes, botsRes] = await Promise.all([
      fetch('/api/system'),
      fetch('/api/bots')
    ]);
    if (sysRes.status === 401 || botsRes.status === 401) {
      window.location.href = '/login';
      return;
    }
    updateSystemMetrics(await sysRes.json());
    updateBotsSection(await botsRes.json());
  } catch (err) {
    showToast('Gagal memuat data dari server', 'error');
  }
}

// =============================================================
// 3. System Metrics
// =============================================================
function updateSystemMetrics(sys) {
  if (!sys || !sys.cpu) return;
  const cpuPercent = sys.cpu.usagePercent || 0;
  setText('cpu-usage', `${cpuPercent}%`);
  setWidth('cpu-bar', `${cpuPercent}%`);
  setHTML('cpu-model', `<i class="fa-solid fa-microchip"></i> ${sys.cpu.model}`);
  setText('cpu-cores', `${sys.cpu.cores} Cores (${sys.cpu.arch}${sys.cpu.isArm ? ' 🇦' : ''})`);

  const ramPercent = sys.memory.usedPercent || 0;
  const usedGb = (sys.memory.usedBytes / (1024 ** 3)).toFixed(1);
  const totalGb = (sys.memory.totalBytes / (1024 ** 3)).toFixed(1);
  const heapMb = Math.round(sys.memory.processHeapUsed / (1024 * 1024));
  setText('ram-usage', `${ramPercent}%`);
  setWidth('ram-bar', `${ramPercent}%`);
  setText('ram-detail', `${usedGb} GB / ${totalGb} GB`);
  setText('process-ram', `Heap: ${heapMb} MB`);

  setText('process-uptime', formatSeconds(sys.process.uptimeSeconds));
  setText('os-uptime', `OS Uptime: ${formatSeconds(sys.os.uptimeSeconds)}`);
  setHTML('os-info', `<i class="fa-solid fa-server"></i> ${sys.os.platform} (${sys.os.hostname})`);
  setText('node-version', sys.process.nodeVersion);

  // GPU Cards
  const gpuContainer = document.getElementById('gpu-metrics-container');
  if (gpuContainer && sys.gpu && sys.gpu.controllers) {
    if (sys.gpu.controllers.length === 0) {
      gpuContainer.innerHTML = '';
    } else {
      gpuContainer.innerHTML = sys.gpu.controllers.map((g, i) => {
        // Utilization
        const hasUtil = g.utilizationPercent >= 0;
        const utilPct = hasUtil ? g.utilizationPercent : 0;
        const utilColor = utilPct >= 85 ? '#ef4444' : utilPct >= 60 ? '#f59e0b' : '#10b981';

        // VRAM usage
        const hasVramDetail = g.vramTotalMB > 0 && g.vramUsedMB > 0;
        const vramUsedPct = hasVramDetail ? Math.round((g.vramUsedMB / g.vramTotalMB) * 100) : 0;
        const vramLabel = hasVramDetail
          ? `${g.vramUsedMB} / ${g.vramTotalMB} MB VRAM (${vramUsedPct}%)`
          : g.vramMB ? `${g.vramMB} MB VRAM${g.vramDynamic ? ' (Dynamic)' : ''}` : 'VRAM N/A';

        // Temperature badge
        const tempBadge = g.temperatureC >= 0
          ? `<span style="margin-left:6px;padding:1px 6px;border-radius:999px;font-size:0.72rem;background:${g.temperatureC >= 85 ? 'rgba(239,68,68,0.2)' : g.temperatureC >= 70 ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)'};color:${g.temperatureC >= 85 ? '#ef4444' : g.temperatureC >= 70 ? '#f59e0b' : '#10b981'};border:1px solid currentColor">🌡️ ${g.temperatureC}°C</span>`
          : '';

        // Utilization % headline
        const utilHeadline = hasUtil
          ? `<div class="metric-value" style="color:${utilColor};">${utilPct}%</div>`
          : `<div class="metric-value" style="font-size:1rem;color:var(--text-muted);">N/A</div>`;

        return `
        <div class="metric-card">
          <div class="metric-header">
            <div class="metric-icon" style="background:linear-gradient(135deg,rgba(139,92,246,0.15),rgba(59,130,246,0.15));color:#a78bfa;border:1px solid rgba(139,92,246,0.3);">
              <i class="fa-solid fa-display"></i>
            </div>
            <span class="metric-title">GPU${sys.gpu.controllers.length > 1 ? ' #' + (i + 1) : ''} Load${tempBadge}</span>
          </div>
          <div class="metric-body">
            ${utilHeadline}
            <div class="progress-bar" style="margin-top:6px;">
              <div class="progress-fill" style="width:${utilPct}%;background:${utilColor};transition:width 0.6s ease;"></div>
            </div>
          </div>
          <div class="metric-footer" style="flex-direction:column;align-items:flex-start;gap:4px;">
            <div style="width:100%;">
              <span style="font-size:0.72rem;color:var(--text-muted);">VRAM: ${esc(vramLabel)}</span>
              ${hasVramDetail ? `<div class="progress-bar" style="height:4px;margin-top:3px;"><div class="progress-fill ram-fill" style="width:${vramUsedPct}%;transition:width 0.6s ease;"></div></div>` : ''}
            </div>
            <div style="display:flex;justify-content:space-between;width:100%;">
              <span><i class="fa-solid fa-industry"></i> ${esc(g.vendor || 'Unknown')}</span>
              <span style="font-size:0.72rem;color:var(--text-muted);">${esc(g.model || 'Unknown GPU')}</span>
            </div>
          </div>
        </div>`;
      }).join('');
    }
  }
}

// =============================================================
// 4. Bots Section
// =============================================================
function updateBotsSection(bots) {
  if (!Array.isArray(bots)) return;
  currentBotsData = bots;

  const onlineCount = bots.filter(b => b.status === 'Online').length;
  const inVcCount = bots.filter(b => b.connectedChannelId).length;

  setText('active-bots-badge', `${onlineCount} / ${bots.length} Bots Online`);
  setText('bot-count-text', `${onlineCount} / ${bots.length}`);
  setText('bot-vc-summary', `${inVcCount} Bot Aktif di Voice Channel`);

  const onlineBots = bots.filter(b => b.ping > 0);
  if (onlineBots.length > 0) {
    const avg = Math.round(onlineBots.reduce((s, b) => s + b.ping, 0) / onlineBots.length);
    setText('avg-ping', `Ping: ${avg} ms`);
  } else {
    setText('avg-ping', 'Ping: -- ms');
  }

  const container = document.getElementById('bots-grid-container');
  if (!container) return;

  if (bots.length === 0) {
    container.innerHTML = `<div class="loading-spinner"><i class="fa-solid fa-robot"></i> Belum ada bot. Klik <strong>"Tambah Bot"</strong> untuk menambahkan.</div>`;
    return;
  }

  container.innerHTML = bots.map((bot, idx) => {
    const isOnline = bot.status === 'Online';
    const badgeClass = isOnline ? 'badge-success' : (bot.status === 'Stopped' ? 'badge-danger' : 'badge-warning');
    const avatarUrl = bot.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png';
    return `
      <div class="bot-card">
        <div class="bot-card-top">
          <div class="bot-profile">
            <img src="${avatarUrl}" alt="Avatar" class="bot-avatar">
            <div class="bot-info-text">
              <h3>${esc(bot.name)}</h3>
              <span class="bot-tag">${esc(bot.tag || 'Not Logged In')}</span>
            </div>
          </div>
          <span class="badge ${badgeClass}">${bot.status}</span>
        </div>
        <div class="bot-vc-box">
          <div class="vc-detail-row">
            <span class="vc-channel-name">
              <i class="fa-solid fa-volume-high"></i>
              ${esc(bot.connectedChannelName || bot.defaultVoiceChannelId || 'Tidak Terhubung')}
            </span>
            <div class="vc-flags">
              <span class="flag-icon ${bot.selfMute ? 'active' : ''}" title="${bot.selfMute ? 'Muted' : 'Unmuted'}">
                <i class="fa-solid ${bot.selfMute ? 'fa-microphone-slash' : 'fa-microphone'}"></i>
              </span>
              <span class="flag-icon ${bot.selfDeaf ? 'active' : ''}" title="${bot.selfDeaf ? 'Deafened' : 'Undeafened'}">
                <i class="fa-solid ${bot.selfDeaf ? 'fa-headphones-simple' : 'fa-headphones'}"></i>
              </span>
            </div>
          </div>
          <div class="vc-detail-row" style="font-size:0.78rem;color:var(--text-dim)">
            <span><i class="fa-solid fa-server"></i> ${esc(bot.guildName || bot.guildId)}</span>
            <span><i class="fa-solid fa-bolt"></i> ${bot.ping ? bot.ping + ' ms' : '--'}</span>
          </div>
          ${bot.targetUserId ? `<div class="vc-detail-row text-cyan" style="font-size:0.78rem"><span><i class="fa-solid fa-user-gear"></i> Follow: ${esc(bot.targetUserId)}</span></div>` : ''}
        </div>
        <div class="bot-action-bar">
          <button class="btn btn-sm btn-primary" onclick="openMoveModal(${idx})" ${!isOnline ? 'disabled' : ''}><i class="fa-solid fa-arrow-right-to-city"></i> Pindah VC</button>
          <button class="btn btn-sm btn-icon ${bot.selfMute ? 'btn-danger' : 'btn-secondary'}" onclick="toggleVoiceState(${idx},'${bot.selfMute ? 'unmute' : 'mute'}')" ${!isOnline ? 'disabled' : ''} title="${bot.selfMute ? 'Unmute' : 'Mute'}"><i class="fa-solid ${bot.selfMute ? 'fa-microphone-slash' : 'fa-microphone'}"></i></button>
          <button class="btn btn-sm btn-icon ${bot.selfDeaf ? 'btn-danger' : 'btn-secondary'}" onclick="toggleVoiceState(${idx},'${bot.selfDeaf ? 'undeafen' : 'deafen'}')" ${!isOnline ? 'disabled' : ''} title="${bot.selfDeaf ? 'Undeafen' : 'Deafen'}"><i class="fa-solid ${bot.selfDeaf ? 'fa-headphones-simple' : 'fa-headphones'}"></i></button>
          <button class="btn btn-sm btn-secondary" onclick="toggleVoiceState(${idx},'reconnect')" ${!isOnline ? 'disabled' : ''} title="Reconnect"><i class="fa-solid fa-arrows-rotate"></i></button>
          ${isOnline
            ? `<button class="btn btn-sm btn-warning" onclick="controlLifecycle(${idx},'restart')"><i class="fa-solid fa-rotate-right"></i></button>
               <button class="btn btn-sm btn-danger" onclick="controlLifecycle(${idx},'stop')"><i class="fa-solid fa-stop"></i></button>`
            : `<button class="btn btn-sm btn-primary" onclick="controlLifecycle(${idx},'start')"><i class="fa-solid fa-play"></i></button>`
          }
          <button class="btn btn-sm btn-secondary" onclick="openEditBotModal(${idx})" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-sm btn-danger" onclick="deleteBotConfig(${idx})" title="Hapus"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`;
  }).join('');
}

// =============================================================
// 5. Bot Actions
// =============================================================
async function openMoveModal(botIdx) {
  document.getElementById('move-bot-index').value = botIdx;
  const select = document.getElementById('channel-select');
  const statusMsg = document.getElementById('channel-load-status');
  select.innerHTML = '<option value="">-- Memuat... --</option>';
  statusMsg.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengambil channel...';
  openModal('move-channel-modal');

  try {
    const res = await fetch(`/api/bots/${botIdx}/channels`);
    const channels = await res.json();
    if (res.ok && Array.isArray(channels)) {
      select.innerHTML = channels.map(ch =>
        `<option value="${ch.id}">🔊 ${esc(ch.name)} (${ch.memberCount || 0}) ${ch.isCurrent ? '★ Current' : ''}</option>`
      ).join('');
      statusMsg.innerHTML = `<span class="text-success"><i class="fa-solid fa-check"></i> ${channels.length} channel ditemukan.</span>`;
    } else {
      select.innerHTML = '<option value="">Gagal memuat</option>';
      statusMsg.innerHTML = `<span class="text-danger">${channels.error || 'Gagal'}</span>`;
    }
  } catch (e) {
    statusMsg.innerHTML = '<span class="text-danger">Gagal terhubung</span>';
  }
}

async function confirmMoveChannel() {
  const botIdx = document.getElementById('move-bot-index').value;
  const channelId = document.getElementById('channel-select').value;
  if (!channelId) { showToast('Pilih Voice Channel dahulu!', 'warn'); return; }
  closeModal('move-channel-modal');
  showToast('Memindahkan bot...', 'info');
  const res = await fetch(`/api/bots/${botIdx}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voiceChannelId: channelId }) });
  const data = await res.json();
  showToast(res.ok ? data.message : data.error, res.ok ? 'success' : 'error');
  if (res.ok) fetchData();
}

async function toggleVoiceState(botIdx, action) {
  const res = await fetch(`/api/bots/${botIdx}/voice-state`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
  const data = await res.json();
  showToast(res.ok ? data.message : data.error, res.ok ? 'success' : 'error');
  if (res.ok) fetchData();
}

async function controlLifecycle(botIdx, action) {
  showToast(`Menjalankan ${action}...`, 'info');
  const res = await fetch(`/api/bots/${botIdx}/lifecycle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
  const data = await res.json();
  showToast(res.ok ? data.message : data.error, res.ok ? 'success' : 'error');
  if (res.ok) fetchData();
}

async function restartAllBots() {
  if (!confirm('Restart SEMUA bot?')) return;
  const res = await fetch('/api/system/restart-all', { method: 'POST' });
  const data = await res.json();
  showToast(data.message, 'success');
  fetchData();
}

// =============================================================
// 6. Bot Config Modals
// =============================================================
function openAddBotModal() {
  document.getElementById('modal-config-title').innerText = 'Tambah Bot Discord Baru';
  document.getElementById('config-bot-index').value = -1;
  ['cfg-name', 'cfg-token', 'cfg-guild', 'cfg-vc', 'cfg-target-user'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const allowMove = document.getElementById('cfg-allow-move');
  if (allowMove) allowMove.checked = true;
  openModal('bot-config-modal');
}

function openEditBotModal(idx) {
  const bot = currentBotsData[idx];
  if (!bot) return;
  document.getElementById('modal-config-title').innerText = `Edit Bot: ${bot.name}`;
  document.getElementById('config-bot-index').value = idx;
  document.getElementById('cfg-name').value = bot.name || '';
  document.getElementById('cfg-token').value = bot.token || '';
  document.getElementById('cfg-guild').value = bot.guildId || '';
  document.getElementById('cfg-vc').value = bot.defaultVoiceChannelId || '';
  document.getElementById('cfg-target-user').value = bot.targetUserId || '';
  document.getElementById('cfg-allow-move').checked = bot.allowMove !== false;
  openModal('bot-config-modal');
}

async function saveBotConfig() {
  const idx = parseInt(document.getElementById('config-bot-index').value, 10);
  const payload = {
    name: document.getElementById('cfg-name').value.trim(),
    token: document.getElementById('cfg-token').value.trim(),
    guildId: document.getElementById('cfg-guild').value.trim(),
    voiceChannelId: document.getElementById('cfg-vc').value.trim(),
    targetUserId: document.getElementById('cfg-target-user').value.trim() || null,
    allowMove: document.getElementById('cfg-allow-move').checked
  };
  if (!payload.name || !payload.guildId || !payload.voiceChannelId) {
    showToast('Nama, Guild ID, dan Voice Channel ID wajib diisi!', 'warn'); return;
  }
  if (idx === -1 && !payload.token) {
    showToast('Token wajib diisi untuk bot baru!', 'warn'); return;
  }
  closeModal('bot-config-modal');
  const endpoint = idx === -1 ? '/api/bots/config/add' : `/api/bots/${idx}/update-config`;
  try {
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    showToast(res.ok ? (data.message || 'Tersimpan!') : (data.error || 'Gagal'), res.ok ? 'success' : 'error');
    if (res.ok) fetchData();
  } catch (e) { showToast('Kesalahan jaringan', 'error'); }
}

async function deleteBotConfig(idx) {
  const bot = currentBotsData[idx];
  if (!confirm(`Hapus bot "${bot?.name || idx}"?`)) return;
  const res = await fetch(`/api/bots/config/${idx}`, { method: 'DELETE' });
  const data = await res.json();
  showToast(res.ok ? data.message : data.error, res.ok ? 'success' : 'error');
  if (res.ok) fetchData();
}

// =============================================================
// 7. Log Terminal
// =============================================================
function filterLogs(level) {
  if (level) {
    activeLogLevel = level;
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.level === level);
    });
  }
  renderLogs();
}

function renderLogs() {
  const container = document.getElementById('log-container');
  if (!container) return;
  const searchText = (document.getElementById('log-search')?.value || '').toLowerCase();
  const filtered = logEntries.filter(e => {
    if (activeLogLevel !== 'ALL' && e.level !== activeLogLevel) return false;
    if (searchText && !e.message.toLowerCase().includes(searchText) && !e.tag.toLowerCase().includes(searchText)) return false;
    return true;
  });
  container.innerHTML = filtered.map(formatLogHtml).join('');
  scrollTerminal();
}

function appendLogEntry(entry) {
  const container = document.getElementById('log-container');
  if (!container) return;
  const searchText = (document.getElementById('log-search')?.value || '').toLowerCase();
  if (activeLogLevel !== 'ALL' && entry.level !== activeLogLevel) return;
  if (searchText && !entry.message.toLowerCase().includes(searchText)) return;
  container.insertAdjacentHTML('beforeend', formatLogHtml(entry));
  scrollTerminal();
}

function formatLogHtml(entry) {
  const t = new Date(entry.timestamp).toLocaleTimeString();
  const lvl = (entry.level || 'info').toLowerCase();
  return `<div class="log-entry ${lvl}"><span class="log-time">[${t}]</span><span class="log-tag">[${esc(entry.tag)}]</span><span class="log-message">${esc(entry.message)} ${esc(entry.extra || '')}</span></div>`;
}

function clearTerminal() { logEntries = []; renderLogs(); }

function scrollTerminal() {
  if (document.getElementById('auto-scroll-check')?.checked) {
    const c = document.getElementById('log-container');
    if (c) c.scrollTop = c.scrollHeight;
  }
}

// =============================================================
// 8. Modals & Toast
// =============================================================
function openModal(id) { document.getElementById(id)?.classList.add('active'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('active'); }

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: 'check', error: 'triangle-exclamation', warn: 'exclamation', info: 'circle-info' };
  toast.innerHTML = `<i class="fa-solid fa-${icons[type] || 'circle-info'}"></i> <span>${esc(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.cssText = 'opacity:0;transform:translateX(100%);transition:all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// =============================================================
// 9. Utilities
// =============================================================
function formatSeconds(sec) {
  sec = Number(sec) || 0;
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${d}d ${pad(h)}h ${pad(m)}m ${pad(s)}s`;
}
function pad(n) { return n < 10 ? '0' + n : n; }
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function setText(id, val) { const el = document.getElementById(id); if (el) el.innerText = val; }
function setHTML(id, val) { const el = document.getElementById(id); if (el) el.innerHTML = val; }
function setWidth(id, val) { const el = document.getElementById(id); if (el) el.style.width = val; }

// =============================================================
// Settings Modal Actions
// =============================================================
async function openSettingsModal() {
  openModal('settings-modal');
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (res.ok) {
      document.getElementById('set-gemini-key').value = data.geminiApiKey || '';
      document.getElementById('set-gemini-model').value = data.geminiModel || 'gemini-3.6-flash';
      document.getElementById('set-music-prefix').value = data.musicPrefix || '!';
      document.getElementById('set-owner-ids').value = data.ownerIds || '';
      document.getElementById('set-default-volume').value = data.defaultVolume || '100';
      document.getElementById('set-idle-timeout').value = data.idleTimeout || '60';
    } else {
      showToast(data.error || 'Gagal memuat settings', 'error');
    }
  } catch (e) {
    showToast('Gagal memuat settings', 'error');
  }
}

async function saveSettings() {
  const geminiApiKey = document.getElementById('set-gemini-key').value.trim();
  const geminiModel = document.getElementById('set-gemini-model').value.trim();
  const musicPrefix = document.getElementById('set-music-prefix').value.trim();
  const ownerIds = document.getElementById('set-owner-ids').value.trim();
  const defaultVolume = document.getElementById('set-default-volume').value.trim();
  const idleTimeout = document.getElementById('set-idle-timeout').value.trim();

  if (!musicPrefix) {
    showToast('Prefix wajib diisi!', 'warn');
    return;
  }

  closeModal('settings-modal');
  showToast('Menyimpan settings...', 'info');
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ geminiApiKey, geminiModel, musicPrefix, ownerIds, defaultVolume, idleTimeout })
    });
    const data = await res.json();
    showToast(res.ok ? data.message : data.error, res.ok ? 'success' : 'error');
  } catch (e) {
    showToast('Kesalahan jaringan', 'error');
  }
}

