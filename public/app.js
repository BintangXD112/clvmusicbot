/**
 * public/app.js
 * Frontend Entry Point & Page Router.
 * Mengkoordinasikan inisialisasi dashboard, navigasi sidebar, dan polling.
 */

var currentPageId = 'dashboard';

/**
 * Pindah halaman view di Web Panel (SPA Router).
 * @param {string} pageId - 'dashboard' | 'domain-access'
 */
function switchPage(pageId) {
  currentPageId = pageId;

  const pageDashboard = document.getElementById('page-dashboard');
  const pageAccess = document.getElementById('page-access');
  const navDashboard = document.getElementById('nav-dashboard');
  const navAccess = document.getElementById('nav-access');
  const heading = document.getElementById('page-title-heading');
  const subHeading = document.getElementById('page-title-sub');

  if (pageId === 'domain-access') {
    if (pageDashboard) pageDashboard.style.display = 'none';
    if (pageAccess) pageAccess.style.display = 'flex';

    if (navDashboard) navDashboard.classList.remove('active');
    if (navAccess) navAccess.classList.add('active');

    if (heading) heading.textContent = 'Akses Domain & Security Logs';
    if (subHeading) subHeading.textContent = 'Pengaturan Restriksi Host & Monitoring HTTP Request Access Logs';

    window.location.hash = 'domain-access';
    if (typeof startAccessLogPolling === 'function') startAccessLogPolling();
  } else {
    if (pageAccess) pageAccess.style.display = 'none';
    if (pageDashboard) pageDashboard.style.display = 'flex';

    if (navAccess) navAccess.classList.remove('active');
    if (navDashboard) navDashboard.classList.add('active');

    if (heading) heading.textContent = 'Dashboard Utama';
    if (subHeading) subHeading.textContent = 'Full Server Monitoring & Bot Management';

    window.location.hash = 'dashboard';
    if (typeof stopAccessLogPolling === 'function') stopAccessLogPolling();
  }

  // Tutup mobile sidebar drawer jika sedang terbuka
  closeSidebar();
}

/**
 * Toggle mobile sidebar drawer.
 */
function toggleSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.toggle('active');
  if (overlay) overlay.classList.toggle('active');
}

function closeSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.remove('active');
  if (overlay) overlay.classList.remove('active');
}

document.addEventListener('DOMContentLoaded', () => {
  // Check user authentication
  checkAuthSession();
  
  // Initialize Server-Sent Events (SSE) live telemetry
  initSSE();
  
  // First load data from API
  fetchData();

  // Route berdasarkan URL hash saat pertama load
  if (window.location.hash === '#domain-access') {
    switchPage('domain-access');
  } else {
    switchPage('dashboard');
  }

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
    if (!window.sseConnected && currentPageId === 'dashboard') {
      fetchData();
    }
  }, 5000);
});
