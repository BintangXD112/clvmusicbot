/**
 * public/app.js
 * Frontend Entry Point & Page Router.
 * Mengkoordinasikan inisialisasi dashboard, navigasi sidebar, dan polling.
 */

var currentPageId = 'dashboard';

const PAGE_CONFIG = {
  dashboard: {
    navId: 'nav-dashboard',
    pageId: 'page-dashboard',
    title: 'Dashboard Utama',
    subtitle: 'Full Server Monitoring & Bot Management',
    hash: 'dashboard',
    onEnter: null,
    onLeave: () => { if (typeof stopAccessLogPolling === 'function') stopAccessLogPolling(); }
  },
  'domain-access': {
    navId: 'nav-access',
    pageId: 'page-access',
    title: 'Akses Domain & Security Logs',
    subtitle: 'Pengaturan Restriksi Host & Monitoring HTTP Request Access Logs',
    hash: 'domain-access',
    onEnter: () => { if (typeof startAccessLogPolling === 'function') startAccessLogPolling(); },
    onLeave: () => { if (typeof stopAccessLogPolling === 'function') stopAccessLogPolling(); }
  },
  'version-control': {
    navId: 'nav-updater',
    pageId: 'page-updater',
    title: 'Version Control & Update',
    subtitle: 'Kelola versi aplikasi, cek update, dan pull kode terbaru dari GitHub',
    hash: 'version-control',
    onEnter: () => { if (typeof startUpdaterPage === 'function') startUpdaterPage(); },
    onLeave: () => { if (typeof stopUpdaterPage === 'function') stopUpdaterPage(); }
  }
};

/**
 * Pindah halaman view di Web Panel (SPA Router).
 * @param {string} pageId - 'dashboard' | 'domain-access' | 'version-control'
 */
function switchPage(pageId) {
  const cfg = PAGE_CONFIG[pageId] || PAGE_CONFIG['dashboard'];
  const prevCfg = PAGE_CONFIG[currentPageId];

  // Jalankan onLeave untuk page sebelumnya
  if (prevCfg && prevCfg.onLeave && currentPageId !== pageId) prevCfg.onLeave();

  currentPageId = pageId;

  // Toggle semua nav items & pages
  Object.keys(PAGE_CONFIG).forEach(id => {
    const c = PAGE_CONFIG[id];
    const navEl = document.getElementById(c.navId);
    const pageEl = document.getElementById(c.pageId);
    if (navEl) navEl.classList.toggle('active', id === pageId);
    if (pageEl) pageEl.style.display = id === pageId ? 'flex' : 'none';
  });

  // Update header breadcrumb
  const heading = document.getElementById('page-title-heading');
  const subHeading = document.getElementById('page-title-sub');
  if (heading) heading.textContent = cfg.title;
  if (subHeading) subHeading.textContent = cfg.subtitle;

  window.location.hash = cfg.hash;

  // Jalankan onEnter untuk page baru
  if (cfg.onEnter) cfg.onEnter();

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
  const initHash = window.location.hash.replace('#', '');
  if (initHash && PAGE_CONFIG[initHash]) {
    switchPage(initHash);
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
