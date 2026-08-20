/**
 * public/js/ui/settings.js
 * Settings modal actions: open settings modal, retrieve settings, and save settings.
 */

async function openSettingsModal() {
  openModal('settings-modal');
  try {
    var res = await fetch('/api/settings');
    var data = await res.json();
    if (res.ok) {
      document.getElementById('set-gemini-key').value = data.geminiApiKey || '';
      document.getElementById('set-gemini-model').value = data.geminiModel || 'gemini-3.6-flash';
      document.getElementById('set-music-prefix').value = data.musicPrefix || '!';
      document.getElementById('set-owner-ids').value = data.ownerIds || '';
      document.getElementById('set-default-volume').value = data.defaultVolume || '100';
      document.getElementById('set-idle-timeout').value = data.idleTimeout || '60';
      document.getElementById('set-webhook-disabled').checked = data.webhookDisabled === true || data.webhookDisabled === 'true';
    } else {
      showToast(data.error || 'Gagal memuat settings', 'error');
    }
  } catch (e) {
    showToast('Gagal memuat settings', 'error');
  }
}

async function saveSettings() {
  var geminiApiKey = document.getElementById('set-gemini-key').value.trim();
  var geminiModel = document.getElementById('set-gemini-model').value.trim();
  var musicPrefix = document.getElementById('set-music-prefix').value.trim();
  var ownerIds = document.getElementById('set-owner-ids').value.trim();
  var defaultVolume = document.getElementById('set-default-volume').value.trim();
  var idleTimeout = document.getElementById('set-idle-timeout').value.trim();
  var webhookDisabled = document.getElementById('set-webhook-disabled').checked;

  if (!musicPrefix) {
    showToast('Prefix wajib diisi!', 'warn');
    return;
  }

  closeModal('settings-modal');
  showToast('Menyimpan settings...', 'info');
  try {
    var res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        geminiApiKey: geminiApiKey,
        geminiModel: geminiModel,
        musicPrefix: musicPrefix,
        ownerIds: ownerIds,
        defaultVolume: defaultVolume,
        idleTimeout: idleTimeout,
        webhookDisabled: webhookDisabled
      })
    });
    var data = await res.json();
    showToast(res.ok ? data.message : data.error, res.ok ? 'success' : 'error');
  } catch (e) {
    showToast('Kesalahan jaringan', 'error');
  }
}
