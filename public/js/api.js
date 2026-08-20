/**
 * public/js/api.js
 * Fungsi fetch data REST dari backend.
 */

/** Ambil system metrics dan bot data dari REST API, update UI. */
async function fetchData() {
  try {
    var results = await Promise.all([
      fetch('/api/system'),
      fetch('/api/bots')
    ]);
    var sysRes  = results[0];
    var botsRes = results[1];

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
