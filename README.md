# 🤖 Discord 24/7 AFK Voice Multi-Bot System & Web Control Center

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D%2018.0.0-blue.svg)](https://nodejs.org/)
[![Discord.js](https://img.shields.io/badge/discord.js-v14-5865F2.svg)](https://discord.js.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-yellow.svg)](https://opensource.org/licenses/ISC)
[![TOTP Secured](https://img.shields.io/badge/Security-TOTP%20Secured-success.svg)](#)

Aplikasi **Discord Multi-Bot AFK** premium yang dirancang khusus untuk menjaga bot Anda tetap berada di Voice Channel (VC) selama **24/7** tanpa henti. Dilengkapi dengan **Web Control Center Dashboard** interaktif modern berdesain *Dark Glassmorphism* untuk memantau metrik server & GPU, mengontrol status bot, serta melakukan konfigurasi secara real-time.

---

## ⚡ Fitur Utama

### 1. 🌐 Web Control Center Dashboard (`http://localhost:3000`)
*   📊 **Server Telemetry Monitoring**: Pantau utilitas CPU, RAM, OS Info, Node.js Version, System Uptime, hingga penggunaan RSS & Heap memory.
*   📟 **GPU Analytics**: Deteksi otomatis dan pantau penggunaan VRAM serta persentase *GPU Load* secara live.
*   🤖 **Discord Bot Grid**: Lihat status koneksi (Online/Stopped/Error/Connecting), Latency (ping), Guild Name, Active VC, serta status Mute/Deafen dari tiap bot.
*   ⚙️ **Bot Config Editor**: Tambah, ubah, atau hapus konfigurasi bot (token, guild, default VC, auto-follow user) secara langsung tanpa perlu menyunting file `bots.json` secara manual.

### 2. 🎛️ Fitur AFK & Manajemen Terbaru
*   🛡️ **Stay AFK VC 24/7**: Sistem menjaga bot untuk selalu terhubung di VC tujuan.
*   ⚡ **Instant Auto-Reconnect**: Bot akan segera masuk kembali ke VC secara otomatis jika terputus koneksi jaringan, dikeluarkan (kick), atau dipindahkan secara paksa.
*   🎯 **Auto-Follow Target**: Bot dapat mengikuti pergerakan User ID tertentu secara otomatis saat berpindah atau membuat VC baru.
*   🔇 **Self-Mute & Self-Deafen**: Menghemat bandwidth koneksi dan performa CPU server.
*   💡 **Dynamic Presence (Status Aktivitas)**: Kustomisasi status kehadiran bot (Playing, Listening, Watching, Competing, Custom Status) langsung dari menu edit bot di Web UI.

### 3. 🚀 Bulk Actions (Aksi Massal)
Kelola puluhan bot sekaligus hanya dengan sekali klik:
*   `Mute All` / `Unmute All`
*   `Deafen All` / `Undeafen All`
*   `Reconnect All` (Melakukan penyambungan ulang ke Voice Channel untuk semua bot).
*   `Bulk Move VC` (Memindahkan semua bot ke satu Voice Channel secara bersamaan).

### 4. 🎚️ Telemetry Alerts & Logs Management
*   🔔 **Browser Desktop Notifications**: Dapatkan pop-up pemberitahuan instan di desktop jika status bot berubah menjadi `Error` atau `Disconnected`.
*   🔊 **Warning Beep Alert**: Bunyi peringatan dinamis menggunakan *Web Audio API* saat terdeteksi kegagalan koneksi bot.
*   📥 **Log Export**: Unduh riwayat *Live Console Logs* langsung menjadi berkas `.txt` dengan sekali klik.

---

## 🛠️ Persyaratan Sistem

*   **Node.js** v18.0.0 atau yang lebih baru.
*   Akun Discord & Bot Token yang dibuat melalui [Discord Developer Portal](https://discord.com/developers/applications).
*   *Intents* yang harus diaktifkan pada Developer Portal:
    *   `Guilds`
    *   `Guild Voice States`
    *   `Guild Messages`
    *   `Message Content`

---

## 🚀 Cara Menjalankan Aplikasi

1.  **Kloning Proyek & Install Dependensi**:
    ```bash
    npm install
    ```

2.  **Konfigurasi File Environment (`.env`)**:
    Buat file `.env` di root folder proyek:
    ```env
    PORT=3000
    SESSION_SECRET=masukkan_random_kunci_rahasia_anda_disini
    MUSIC_PREFIX=!
    IDLE_TIMEOUT=60
    DEFAULT_VOLUME=100
    ```

3.  **Jalankan Aplikasi**:
    ```bash
    npm start
    ```

4.  **Akses Dashboard**:
    Buka browser Anda dan navigasikan ke:
    👉 **`http://localhost:3000`**

    > [!IMPORTANT]
    > **Setup TOTP pertama kali**: Saat pertama kali membuka halaman login, Anda akan diminta melakukan scan QR Code menggunakan aplikasi authenticator (Google Authenticator / Aegis / Authy) untuk mendapatkan kode login 6-digit demi keamanan dashboard Anda.

---

## 🔄 Menjalankan 24/7 di Background (Rekomendasi PM2)

Untuk memastikan bot dan dashboard tetap berjalan secara terus-menerus di VPS/Server:

```bash
# Install PM2 secara global
npm install -g pm2

# Jalankan bot dengan PM2
npm run start:prod

# Simpan state PM2 agar jalan otomatis saat server restart
pm2 startup
pm2 save
```

---

## 📂 Struktur Folder Proyek

```
├── index.js          # Core Multi-Bot Orchestrator
├── bots.json         # Penyimpanan Konfigurasi Bot (Di-update otomatis oleh Web UI)
├── src/
│   ├── logger.js     # Logger emitter & history buffer untuk live SSE
│   ├── totp.js       # Otentikasi TOTP Dashboard
│   └── webServer.js  # Rute Express REST API & Real-Time SSE Telemetry
├── public/
│   ├── index.html    # Halaman Dashboard Web
│   ├── login.html    # Halaman Autentikasi Login & QR Code Setup
│   ├── style.css     # Glassmorphism CSS Design System
│   └── app.js        # Logic Frontend & Notifikasi Telemetry
├── music/            # Modul Pemutar Musik
├── ai/               # Integrasi AI Gemini
├── package.json      # Dependensi & NPM Scripts
└── README.md         # Dokumentasi (File Ini)
```
