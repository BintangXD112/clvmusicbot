/**
 * public/app.js
 * Frontend Entry Point.
 * Mengkoordinasikan inisialisasi dashboard saat halaman selesai dimuat.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Bind header buttons by ID
  document.getElementById('btn-logout')?.addEventListener('click', logoutUser);
  document.getElementById('btn-refresh')?.addEventListener('click', fetchData);
  document.getElementById('btn-restart-all')?.addEventListener('click', restartAllBots);
  document.getElementById('btn-add-bot')?.addEventListener('click', openAddBotModal);

  // Check user authentication
  checkAuthSession();
  
  // Initialize Server-Sent Events (SSE) live telemetry
  initSSE();
  
  // First load data from API
  fetchData();

  // Request Notification permission on first user click
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    document.addEventListener('click', () => {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }, { once: true });
  }

  // Backup poll every 5s if SSE disconnects
  setInterval(() => {
    if (!window.sseConnected) fetchData();
  }, 5000);
});
