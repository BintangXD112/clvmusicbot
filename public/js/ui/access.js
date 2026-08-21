/**
 * public/js/ui/access.js
 * Modul UI untuk Pengaturan Domain Security dan Monitoring Access Logs.
 */

var accessLogEntries = [];
var accessStatusFilter = 'ALL';
var accessSearchQuery = '';
var accessPollInterval = null;

if (typeof escapeHtml !== 'function') {
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

/**
 * Muat konfigurasi Domain Security dari backend API.
 */
async function loadDomainSettings() {
  try {
    const res = await fetch('/api/access/settings');
    if (!res.ok) return;
    const data = await res.json();

    const enabledCheck = document.getElementById('domain-guard-enabled');
    const inputDomains = document.getElementById('allowed-domains-input');
    const currentHostBadge = document.getElementById('current-host-badge');

    if (enabledCheck) enabledCheck.checked = data.enabled === true;
    if (inputDomains) inputDomains.value = data.allowedDomains || '';
    if (currentHostBadge) currentHostBadge.textContent = data.currentHost || window.location.host;
  } catch (err) {
    console.error('Gagal memuat domain settings:', err);
  }
}

/**
 * Simpan pengaturan Domain Security ke backend API.
 */
async function saveDomainSettings() {
  const enabledCheck = document.getElementById('domain-guard-enabled');
  const inputDomains = document.getElementById('allowed-domains-input');
  const currentHost = window.location.host;

  const enabled = enabledCheck ? enabledCheck.checked : false;
  const allowedDomains = inputDomains ? inputDomains.value.trim() : '';

  // Safety check: jika restriction diaktifkan, beri peringatan jika domain saat ini belum masuk
  if (enabled && allowedDomains && allowedDomains !== '*') {
    const list = allowedDomains.split(',').map(d => d.trim().toLowerCase());
    const hostNoPort = currentHost.split(':')[0].toLowerCase();
    const matchesCurrent = list.some(item => 
      item === '*' || item === currentHost.toLowerCase() || item === hostNoPort || 
      (item.startsWith('*.') && hostNoPort.endsWith(item.substring(1)))
    );

    if (!matchesCurrent) {
      const confirmSave = confirm(
        `⚠️ PERINGATAN KESELAMATAN:\n\nHost Anda saat ini (${currentHost}) TIDAK ada dalam daftar domain yang diizinkan.\n\nJika Anda menyimpan sekarang, Anda mungkin akan TERKUNCI DARI WEB PANEL.\n\nApakah Anda yakin ingin melanjutkan?`
      );
      if (!confirmSave) return;
    }
  }

  try {
    const res = await fetch('/api/access/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, allowedDomains })
    });
    const result = await res.json();
    if (res.ok && result.success) {
      showToast(result.message || 'Pengaturan domain berhasil disimpan!', 'success');
      loadDomainSettings();
    } else {
      showToast(result.error || 'Gagal menyimpan pengaturan domain', 'error');
    }
  } catch (err) {
    showToast('Terjadi kesalahan jaringan', 'error');
  }
}

/**
 * Ambil daftar HTTP access logs dari backend API.
 */
async function fetchAccessLogs() {
  try {
    let url = '/api/access/logs?limit=300';
    if (accessSearchQuery) url += `&search=${encodeURIComponent(accessSearchQuery)}`;
    if (accessStatusFilter && accessStatusFilter !== 'ALL') url += `&status=${encodeURIComponent(accessStatusFilter)}`;

    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    accessLogEntries = data.logs || [];
    renderAccessLogs();
  } catch (err) {
    console.error('Gagal mengambil access logs:', err);
  }
}

/**
 * Render ringkasan statistik & tabel access logs di UI.
 */
function renderAccessLogs() {
  const tbody = document.getElementById('access-logs-tbody');
  const countTotal = document.getElementById('access-stat-total');
  const countAllowed = document.getElementById('access-stat-allowed');
  const countBlocked = document.getElementById('access-stat-blocked');
  const countError = document.getElementById('access-stat-error');

  if (!tbody) return;

  // Hitung stats
  let total = accessLogEntries.length;
  let allowed = 0;
  let blocked = 0;
  let error = 0;

  accessLogEntries.forEach(item => {
    if (item.status === 403 || !item.allowed) blocked++;
    else if (item.status >= 400) error++;
    else allowed++;
  });

  if (countTotal) countTotal.textContent = total;
  if (countAllowed) countAllowed.textContent = allowed;
  if (countBlocked) countBlocked.textContent = blocked;
  if (countError) countError.textContent = error;

  if (accessLogEntries.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">
          <i class="fa-solid fa-folder-open" style="font-size: 1.5rem; margin-bottom: 8px; display: block;"></i>
          Belum ada data access log yang tercatat.
        </td>
      </tr>
    `;
    return;
  }

  let html = '';
  accessLogEntries.forEach(item => {
    const timeStr = new Date(item.timestamp).toLocaleTimeString('id-ID', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    let statusBadgeClass = 'badge-success';
    if (item.status === 403) statusBadgeClass = 'badge-danger';
    else if (item.status >= 400 && item.status < 500) statusBadgeClass = 'badge-warning';
    else if (item.status >= 500) statusBadgeClass = 'badge-danger';

    let methodColor = '#3b82f6';
    if (item.method === 'POST') methodColor = '#10b981';
    if (item.method === 'DELETE') methodColor = '#ef4444';
    if (item.method === 'PUT' || item.method === 'PATCH') methodColor = '#f59e0b';

    const accessStateBadge = item.allowed
      ? '<span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> Allowed</span>'
      : '<span class="badge badge-danger"><i class="fa-solid fa-ban"></i> Blocked (403)</span>';

    html += `
      <tr>
        <td class="font-mono text-dim" style="white-space: nowrap;">${timeStr}</td>
        <td class="font-mono" style="font-weight: 500;">${escapeHtml(item.ip)}</td>
        <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(item.host)}">${escapeHtml(item.host)}</td>
        <td>
          <span style="font-weight: 700; color: ${methodColor}; font-size: 0.75rem; margin-right: 6px;">${item.method}</span>
          <span class="font-mono" style="font-size: 0.82rem;" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</span>
        </td>
        <td>
          <span class="badge ${statusBadgeClass}">${item.status}</span>
        </td>
        <td>${accessStateBadge}</td>
        <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-dim); font-size: 0.78rem;" title="${escapeHtml(item.userAgent)}">
          ${escapeHtml(item.userAgent)}
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

/**
 * Filter status access log.
 */
function setAccessStatusFilter(status, btnElement) {
  accessStatusFilter = status;
  const buttons = document.querySelectorAll('.access-filter-btn');
  buttons.forEach(b => b.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');
  fetchAccessLogs();
}

/**
 * Tangani pencarian input query.
 */
function onAccessSearchInput(query) {
  accessSearchQuery = query.trim();
  fetchAccessLogs();
}

/**
 * Bersihkan semua riwayat access logs.
 */
async function clearAccessLogsData() {
  if (!confirm('Apakah Anda yakin ingin menghapus semua riwayat Access Logs?')) return;
  try {
    const res = await fetch('/api/access/logs', { method: 'DELETE' });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast(data.message, 'success');
      fetchAccessLogs();
    }
  } catch (err) {
    showToast('Gagal menghapus log', 'error');
  }
}

/**
 * Export access logs ke CSV atau JSON file.
 */
function exportAccessLogs(format = 'json') {
  if (!accessLogEntries || accessLogEntries.length === 0) {
    showToast('Tidak ada data log untuk diexport', 'warn');
    return;
  }

  let content = '';
  let filename = `access_logs_${Date.now()}.${format}`;
  let mimeType = 'application/json';

  if (format === 'csv') {
    mimeType = 'text/csv;charset=utf-8;';
    const headers = ['Timestamp', 'IP', 'Host', 'Method', 'Path', 'Status', 'Allowed', 'Duration(ms)', 'UserAgent'];
    const rows = accessLogEntries.map(e => [
      `"${e.timestamp}"`,
      `"${e.ip}"`,
      `"${e.host}"`,
      `"${e.method}"`,
      `"${e.path}"`,
      e.status,
      e.allowed,
      e.durationMs,
      `"${(e.userAgent || '').replace(/"/g, '""')}"`
    ].join(','));
    content = [headers.join(','), ...rows].join('\n');
  } else {
    content = JSON.stringify(accessLogEntries, null, 2);
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast(`Access logs berhasil diexport (${format.toUpperCase()})`, 'success');
}

/**
 * Inisialisasi auto-refresh untuk Access Logs ketika halaman aktif.
 */
function startAccessLogPolling() {
  fetchAccessLogs();
  loadDomainSettings();
  if (!accessPollInterval) {
    accessPollInterval = setInterval(fetchAccessLogs, 3000);
  }
}

function stopAccessLogPolling() {
  if (accessPollInterval) {
    clearInterval(accessPollInterval);
    accessPollInterval = null;
  }
}
