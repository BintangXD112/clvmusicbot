/**
 * public/js/ui/bulk.js
 * Bulk actions: bulk toggle voice states, open bulk move modal.
 */

async function bulkToggleVoiceState(action) {
  if (!confirm('Jalankan aksi "' + action + '" untuk SEMUA bot yang sedang online?')) return;
  showToast('Mengirim perintah massal...', 'info');
  try {
    var res = await fetch('/api/bots/bulk/voice-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: action })
    });
    var data = await res.json();
    showToast(res.ok ? data.message : data.error, res.ok ? 'success' : 'error');
    if (res.ok) fetchData();
  } catch (e) {
    showToast('Kesalahan jaringan saat melakukan aksi massal', 'error');
  }
}

async function openBulkMoveModal() {
  document.getElementById('move-bot-index').value = 'bulk';
  var select = document.getElementById('channel-select');
  var statusMsg = document.getElementById('channel-load-status');
  select.innerHTML = '<option value="">-- Memuat... --</option>';
  statusMsg.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengambil channel dari bot pertama...';
  openModal('move-channel-modal');
  
  if (currentBotsData.length === 0) {
    select.innerHTML = '<option value="">Tidak ada bot terdaftar</option>';
    statusMsg.innerHTML = '<span class="text-danger">Tambahkan bot terlebih dahulu.</span>';
    return;
  }

  // Find the first online bot to fetch channels from
  var firstOnlineBotIdx = currentBotsData.findIndex(function(b) { return b.status === 'Online'; });
  var targetIdx = firstOnlineBotIdx !== -1 ? firstOnlineBotIdx : 0;
  
  try {
    var res = await fetch('/api/bots/' + targetIdx + '/channels');
    var channels = await res.json();
    if (res.ok && Array.isArray(channels)) {
      select.innerHTML = channels.map(function(ch) {
        return '<option value="' + ch.id + '">🔊 ' + esc(ch.name) + ' (' + (ch.memberCount || 0) + ')</option>';
      }).join('');
      statusMsg.innerHTML = '<span class="text-success"><i class="fa-solid fa-check"></i> ' + channels.length + ' channel ditemukan (via Bot #' + (targetIdx + 1) + ').</span>';
    } else {
      select.innerHTML = '<option value="">Gagal memuat channel</option>';
      statusMsg.innerHTML = '<span class="text-danger">' + (channels.error || 'Gagal') + '</span>';
    }
  } catch (e) {
    statusMsg.innerHTML = '<span class="text-danger">Gagal terhubung ke API</span>';
  }
}
