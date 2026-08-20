/**
 * public/js/ui/modals.js
 * Modal management, toast notifications, dan bot action handlers.
 */

// ── Modal helpers ─────────────────────────────────────────────────────────────

function openModal(id)  { var el = document.getElementById(id); if (el) el.classList.add('active'); }
function closeModal(id) { var el = document.getElementById(id); if (el) el.classList.remove('active'); }

/** Tampilkan toast notification dengan tipe: 'success', 'error', 'warn', 'info'. */
function showToast(message, type) {
  type = type || 'info';
  var container = document.getElementById('toast-container');
  if (!container) return;
  var toast   = document.createElement('div');
  toast.className = 'toast ' + type;
  var icons   = { success: 'check', error: 'triangle-exclamation', warn: 'exclamation', info: 'circle-info' };
  toast.innerHTML = '<i class="fa-solid fa-' + (icons[type] || 'circle-info') + '"></i> <span>' + esc(message) + '</span>';
  container.appendChild(toast);
  setTimeout(function() {
    toast.style.cssText = 'opacity:0;transform:translateX(100%);transition:all 0.3s ease';
    setTimeout(function() { toast.remove(); }, 300);
  }, 4000);
}

// ── Move Channel Modal ────────────────────────────────────────────────────────

async function openMoveModal(botIdx) {
  document.getElementById('move-bot-index').value = botIdx;
  var select    = document.getElementById('channel-select');
  var statusMsg = document.getElementById('channel-load-status');
  select.innerHTML   = '<option value="">-- Memuat... --</option>';
  statusMsg.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengambil channel...';
  openModal('move-channel-modal');

  try {
    var res      = await fetch('/api/bots/' + botIdx + '/channels');
    var channels = await res.json();
    if (res.ok && Array.isArray(channels)) {
      select.innerHTML = channels.map(function(ch) {
        return '<option value="' + ch.id + '">🔊 ' + esc(ch.name) + ' (' + (ch.memberCount || 0) + ') ' + (ch.isCurrent ? '★ Current' : '') + '</option>';
      }).join('');
      statusMsg.innerHTML = '<span class="text-success"><i class="fa-solid fa-check"></i> ' + channels.length + ' channel ditemukan.</span>';
    } else {
      select.innerHTML    = '<option value="">Gagal memuat</option>';
      statusMsg.innerHTML = '<span class="text-danger">' + (channels.error || 'Gagal') + '</span>';
    }
  } catch (e) {
    statusMsg.innerHTML = '<span class="text-danger">Gagal terhubung</span>';
  }
}

async function confirmMoveChannel() {
  var botIdx    = document.getElementById('move-bot-index').value;
  var channelId = document.getElementById('channel-select').value;
  if (!channelId) { showToast('Pilih Voice Channel dahulu!', 'warn'); return; }
  closeModal('move-channel-modal');

  if (botIdx === 'bulk') {
    showToast('Memindahkan semua bot...', 'info');
    try {
      var res  = await fetch('/api/bots/bulk/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voiceChannelId: channelId }) });
      var data = await res.json();
      showToast(res.ok ? data.message : data.error, res.ok ? 'success' : 'error');
      if (res.ok) fetchData();
    } catch (e) {
      showToast('Kesalahan jaringan saat memindahkan semua bot', 'error');
    }
  } else {
    showToast('Memindahkan bot...', 'info');
    var res2  = await fetch('/api/bots/' + botIdx + '/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voiceChannelId: channelId }) });
    var data2 = await res2.json();
    showToast(res2.ok ? data2.message : data2.error, res2.ok ? 'success' : 'error');
    if (res2.ok) fetchData();
  }
}

// ── Voice & Lifecycle Actions ─────────────────────────────────────────────────

async function toggleVoiceState(botIdx, action) {
  var res  = await fetch('/api/bots/' + botIdx + '/voice-state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: action }) });
  var data = await res.json();
  showToast(res.ok ? data.message : data.error, res.ok ? 'success' : 'error');
  if (res.ok) fetchData();
}

async function controlLifecycle(botIdx, action) {
  showToast('Menjalankan ' + action + '...', 'info');
  var res  = await fetch('/api/bots/' + botIdx + '/lifecycle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: action }) });
  var data = await res.json();
  showToast(res.ok ? data.message : data.error, res.ok ? 'success' : 'error');
  if (res.ok) fetchData();
}

async function restartAllBots() {
  if (!confirm('Restart SEMUA bot?')) return;
  var res  = await fetch('/api/system/restart-all', { method: 'POST' });
  var data = await res.json();
  showToast(data.message, 'success');
  fetchData();
}

// ── Bot Config Modals ─────────────────────────────────────────────────────────

function openAddBotModal() {
  document.getElementById('modal-config-title').innerText = 'Tambah Bot Discord Baru';
  document.getElementById('config-bot-index').value = -1;
  ['cfg-name', 'cfg-token', 'cfg-guild', 'cfg-vc', 'cfg-target-user', 'cfg-presence-text'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  var presenceType = document.getElementById('cfg-presence-type');
  if (presenceType) presenceType.value = 'WATCHING';
  var allowMove = document.getElementById('cfg-allow-move');
  if (allowMove) allowMove.checked = true;
  openModal('bot-config-modal');
}

function openEditBotModal(idx) {
  var bot = currentBotsData[idx];
  if (!bot) return;
  document.getElementById('modal-config-title').innerText = 'Edit Bot: ' + bot.name;
  document.getElementById('config-bot-index').value = idx;
  document.getElementById('cfg-name').value         = bot.name    || '';
  document.getElementById('cfg-token').value        = bot.token   || '';
  document.getElementById('cfg-guild').value        = bot.guildId || '';
  document.getElementById('cfg-vc').value           = bot.defaultVoiceChannelId || '';
  document.getElementById('cfg-target-user').value  = bot.targetUserId  || '';
  document.getElementById('cfg-allow-move').checked = bot.allowMove !== false;
  document.getElementById('cfg-presence-type').value = bot.presenceType || 'WATCHING';
  document.getElementById('cfg-presence-text').value = bot.presenceText || '';
  openModal('bot-config-modal');
}

async function saveBotConfig() {
  var idx = parseInt(document.getElementById('config-bot-index').value, 10);
  var payload = {
    name:           document.getElementById('cfg-name').value.trim(),
    token:          document.getElementById('cfg-token').value.trim(),
    guildId:        document.getElementById('cfg-guild').value.trim(),
    voiceChannelId: document.getElementById('cfg-vc').value.trim(),
    targetUserId:   document.getElementById('cfg-target-user').value.trim() || null,
    allowMove:      document.getElementById('cfg-allow-move').checked,
    presenceType:   document.getElementById('cfg-presence-type').value,
    presenceText:   document.getElementById('cfg-presence-text').value.trim()
  };
  if (!payload.name || !payload.guildId || !payload.voiceChannelId) {
    showToast('Nama, Guild ID, dan Voice Channel ID wajib diisi!', 'warn'); return;
  }
  if (idx === -1 && !payload.token) {
    showToast('Token wajib diisi untuk bot baru!', 'warn'); return;
  }
  closeModal('bot-config-modal');
  var endpoint = idx === -1 ? '/api/bots/config/add' : '/api/bots/' + idx + '/update-config';
  try {
    var res  = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    var data = await res.json();
    showToast(res.ok ? (data.message || 'Tersimpan!') : (data.error || 'Gagal'), res.ok ? 'success' : 'error');
    if (res.ok) fetchData();
  } catch (e) { showToast('Kesalahan jaringan', 'error'); }
}

async function deleteBotConfig(idx) {
  var bot = currentBotsData[idx];
  if (!confirm('Hapus bot "' + (bot ? bot.name : idx) + '"?')) return;
  var res  = await fetch('/api/bots/config/' + idx, { method: 'DELETE' });
  var data = await res.json();
  showToast(res.ok ? data.message : data.error, res.ok ? 'success' : 'error');
  if (res.ok) fetchData();
}
