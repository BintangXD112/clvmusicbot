/**
 * public/js/auth.js
 * Fungsi autentikasi frontend: cek sesi dan logout.
 */

/** Cek apakah sesi masih valid; redirect ke /login jika tidak. */
async function checkAuthSession() {
  try {
    var res = await fetch('/api/me');
    if (!res.ok) window.location.href = '/login';
  } catch (_) {
    window.location.href = '/login';
  }
}

/** Konfirmasi dan jalankan logout. */
async function logoutUser() {
  if (!confirm('Apakah Anda yakin ingin keluar / logout?')) return;
  try { await fetch('/api/logout', { method: 'POST' }); } catch (_) {}
  window.location.href = '/login';
}
