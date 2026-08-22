'use strict';
/**
 * desktop/main.js
 * Electron Main Process untuk CLV Music Bot Native Desktop App.
 *
 * Menghubungkan client desktop langsung ke backend server yang di-hosting (HidenCloud).
 */

const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, shell, Notification, session } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

// ─── Single Instance Lock ───────────────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// ─── Konfigurasi & State ────────────────────────────────────────────────────────
let mainWindow = null;
let tray = null;
let isQuitting = false;

const CONFIG_PATH = path.join(app.getPath('userData'), 'desktop-config.json');

/**
 * Muat konfigurasi desktop app (serverUrl, windowBounds, dll).
 */
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[DESKTOP] Gagal membaca konfigurasi:', err.message);
  }
  return {
    serverUrl: '',
    closeToTray: true,
    startMinimized: false,
    bounds: { width: 1280, height: 820 }
  };
}

/**
 * Simpan konfigurasi desktop app.
 */
function saveConfig(cfg) {
  try {
    const current = loadConfig();
    const merged = { ...current, ...cfg };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf8');
  } catch (err) {
    console.error('[DESKTOP] Gagal menyimpan konfigurasi:', err.message);
  }
}

// ─── Buat Window Utama ──────────────────────────────────────────────────────────
function createMainWindow() {
  const config = loadConfig();
  const bounds = config.bounds || { width: 1280, height: 820 };

  mainWindow = new BrowserWindow({
    width: bounds.width || 1280,
    height: bounds.height || 820,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#070913',
    title: 'CLV Music Bot — Desktop Client',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webviewTag: false
    }
  });

  // Simpan ukuran window saat diubah
  mainWindow.on('resize', () => {
    if (!mainWindow.isMaximized() && !mainWindow.isMinimized()) {
      saveConfig({ bounds: mainWindow.getBounds() });
    }
  });

  mainWindow.on('move', () => {
    if (!mainWindow.isMaximized() && !mainWindow.isMinimized()) {
      saveConfig({ bounds: mainWindow.getBounds() });
    }
  });

  // Intercept semua HTTP request agar mengirimkan header Desktop Client
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['X-Client-Platform'] = 'desktop';
    details.requestHeaders['User-Agent'] = `CLVMusicBot-Desktop/1.0.0 (Windows NT 10.0; Win64; x64) Electron/${process.versions.electron}`;
    callback({ requestHeaders: details.requestHeaders });
  });

  // Tangani kegagalan load halaman remote
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    // Jangan redirect jika pembatalan navigasi biasa (-3)
    if (errorCode === -3) return;

    console.warn(`[DESKTOP] did-fail-load: ${errorCode} ${errorDescription} on ${validatedURL}`);
    const errorPage = path.join(__dirname, 'screens', 'error.html');
    const query = `?error=${encodeURIComponent(errorDescription)}&url=${encodeURIComponent(validatedURL)}`;
    mainWindow.loadFile(errorPage, { search: query });
  });

  // Tangani close window (minimize ke tray jika diaktifkan)
  mainWindow.on('close', (event) => {
    const cfg = loadConfig();
    if (!isQuitting && cfg.closeToTray !== false) {
      event.preventDefault();
      mainWindow.hide();
      if (Notification.isSupported()) {
        new Notification({
          title: 'CLV Music Bot',
          body: 'Aplikasi diminimize ke System Tray dan tetap berjalan di background.'
        }).show();
      }
      return false;
    }
  });

  // Muat serverUrl atau tampilkan layar setup jika belum ada
  if (config.serverUrl && config.serverUrl.startsWith('http')) {
    loadServerUrl(config.serverUrl);
  } else {
    showConnectScreen();
  }

  createTray();
  setupMenu();
}

/**
 * Muat URL server HidenCloud ke webContents.
 */
function loadServerUrl(url) {
  if (!mainWindow) return;
  mainWindow.loadURL(url).catch(err => {
    console.error('[DESKTOP] Gagal memuat URL:', err.message);
  });
}

/**
 * Tampilkan layar konfigurasi input URL server.
 */
function showConnectScreen() {
  if (!mainWindow) return;
  mainWindow.loadFile(path.join(__dirname, 'screens', 'connect.html'));
}

// ─── System Tray ───────────────────────────────────────────────────────────────
function createTray() {
  if (tray) return;

  // Buat icon tray sederhana / 16x16 fallback image
  let trayIcon;
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  if (fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath);
  } else {
    // Buat blank native image fallback
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('CLV Music Bot — Desktop Client');

  const updateContextMenu = () => {
    const config = loadConfig();
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '🎵 CLV Music Bot (Desktop Client)',
        enabled: false
      },
      {
        label: config.serverUrl ? `🌐 Server: ${config.serverUrl.replace(/^https?:\/\//i, '').slice(0, 24)}` : '⚠️ Belum Terhubung',
        enabled: false
      },
      { type: 'separator' },
      {
        label: '🖥️ Buka Dashboard',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      {
        label: '🔄 Reload Dashboard',
        click: () => {
          const cfg = loadConfig();
          if (cfg.serverUrl) loadServerUrl(cfg.serverUrl);
          else showConnectScreen();
        }
      },
      {
        label: '⚙️ Ganti URL Server HidenCloud',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
          showConnectScreen();
        }
      },
      { type: 'separator' },
      {
        label: '❌ Keluar',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);
    tray.setContextMenu(contextMenu);
  };

  updateContextMenu();

  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    }
  });
}

// ─── Application Menu & Shortcuts ──────────────────────────────────────────────
function setupMenu() {
  const template = [
    {
      label: 'Aplikasi',
      submenu: [
        {
          label: 'Ganti URL Server HidenCloud',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => showConnectScreen()
        },
        {
          label: 'Reload Dashboard',
          accelerator: 'F5',
          click: () => {
            const config = loadConfig();
            if (config.serverUrl) loadServerUrl(config.serverUrl);
            else showConnectScreen();
          }
        },
        {
          label: 'Hard Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow) mainWindow.webContents.reloadIgnoringCache();
          }
        },
        { type: 'separator' },
        {
          label: 'Keluar',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            isQuitting = true;
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Tampilan',
      submenu: [
        { role: 'resetZoom', label: 'Reset Zoom' },
        { role: 'zoomIn', label: 'Zoom In' },
        { role: 'zoomOut', label: 'Zoom Out' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Fullscreen' },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => {
            if (mainWindow) mainWindow.webContents.toggleDevTools();
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ─── IPC Handlers ──────────────────────────────────────────────────────────────
ipcMain.handle('get-server-url', () => {
  const cfg = loadConfig();
  return cfg.serverUrl || '';
});

ipcMain.handle('set-server-url', async (event, url) => {
  saveConfig({ serverUrl: url });
  loadServerUrl(url);
  return { success: true };
});

ipcMain.handle('test-connection', (event, url) => {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      const client = parsed.protocol === 'https:' ? https : http;
      
      const req = client.get(url, {
        headers: {
          'User-Agent': 'CLVMusicBot-Desktop/1.0.0',
          'X-Client-Platform': 'desktop'
        },
        timeout: 8000
      }, (res) => {
        resolve({ success: true, statusCode: res.statusCode });
      });

      req.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: 'Connection timed out (8s)' });
      });
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
});

ipcMain.on('reload-page', () => {
  const cfg = loadConfig();
  if (cfg.serverUrl) loadServerUrl(cfg.serverUrl);
  else showConnectScreen();
});

ipcMain.on('open-connect-screen', () => {
  showConnectScreen();
});

ipcMain.on('minimize-window', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('maximize-window', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});

ipcMain.on('close-window', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.on('open-external', (event, url) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    shell.openExternal(url);
  }
});

ipcMain.on('desktop-notify', (event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title: title || 'CLV Music Bot', body }).show();
  }
});

// ─── App Lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Tetap hidup di background jika closeToTray aktif, jika tidak quit
    const cfg = loadConfig();
    if (cfg.closeToTray === false) {
      app.quit();
    }
  }
});
