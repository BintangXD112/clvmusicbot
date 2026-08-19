# 🤖 Discord 24/7 AFK Voice Multi-Bot System & Web Dashboard

Bot Discord AFK yang dirancang untuk **selalu berada di Voice Channel (VC) 24/7** tanpa terputus. Mendukung **Multi-Bot** (menjalankan banyak bot sekaligus dalam 1 proses), dilengkapi **Web Application Control Center** untuk full monitoring server & management bot secara real-time, serta **Instant Auto-Reconnect** jika jaringan terputus, server restart, atau saat bot dikeluarkan/dipindahkan dari VC.

---

## ⚡ Fitur Utama

- 🌐 **Web Control Center Dashboard (`http://localhost:3000`)**:
  - 📊 **Full Server Monitoring**: Pantau persentase CPU, RAM, Process Memory (Heap/RSS), System Uptime, Node.js Version & OS Info secara real-time.
  - 🤖 **Discord Bot Monitoring**: Pantau status setiap bot (Online/Offline/Connecting/Error), Latency (ping), Guild/Server Name, Voice Channel aktif, Mute/Deafen State.
  - 🎙️ **Pindah Voice Channel Instan**: Pilih Voice Channel dari Discord Server via dropdown modal di Web Dashboard dan pindahkan bot secara live.
  - 🎛️ **Full Interactive Actions**: Mute/Unmute, Deafen/Undeafen, Reconnect VC, Start/Stop/Restart Bot, & Restart All Bots.
  - ⚙️ **Bot Config Management**: Tambah bot baru, edit token/guild/channel, atur auto-follow target user, toggle `allowMove`, dan tersimpan otomatis di `bots.json`.
  - 📟 **Live Console Logs Stream**: Telemetry streaming via Server-Sent Events (SSE) dengan filter log level (INFO, SUCCESS, WARN, ERROR), pencarian, & auto-scroll.
- 🤖 **Multi-Bot Support**: Jalankan 1, 2, 5, atau lebih bot AFK sekaligus dalam 1 aplikasi Node.js.
- 🎙️ **Stay Voice Channel 24/7**: Setiap bot terus berada di VC target masing-masing tanpa pernah disconnect.
- ⚡ **Instant Auto-Reconnect**: Langsung tersambung kembali secara otomatis jika koneksi terputus.
- 🛡️ **TempVoice & Follow Target Support**: Bot dapat diset menetap di TempVC atau mengikuti user tertentu saat berpindah VC.
- 🔇 **Self-Mute & Self-Deafen**: Menghemat bandwidth dan CPU server sehingga bot sangat ringan.
- 🛡️ **Anti-Crash Protection**: Menangani `unhandledRejection` dan `uncaughtException` agar aplikasi tidak mati mendadak.

---

## 🛠️ Persyaratan

- **Node.js** v18.0.0 atau yang lebih baru.
- Akun Discord & Bot yang dibuat melalui [Discord Developer Portal](https://discord.com/developers/applications).

---

## 🚀 Cara Menjalankan Aplikasi

Buka terminal pada folder proyek ini, lalu jalankan:

```bash
# Menginstall dependensi (termasuk Express)
npm install

# Menjalankan aplikasi
npm start
```

Setelah aplikasi berjalan, buka browser Anda dan akses Web Dashboard di:
👉 **`http://localhost:3000`**

*(Anda juga dapat mengubah port server via file `.env` dengan menambahkan `PORT=8080`)*

---

## 🚀 Panduan Konfigurasi (Single & Multi-Bot)

Anda dapat mengonfigurasi bot langsung melalui **Web Control Center Dashboard** (`http://localhost:3000`) atau mengedit file `bots.json` / `.env`.

### Menggunakan `bots.json` (Otomatis Di-update oleh Dashboard)

File `bots.json` di root folder proyek:

```json
[
  {
    "name": "Bot AFK 1",
    "token": "YOUR_BOT_TOKEN_1",
    "guildId": "YOUR_GUILD_ID_1",
    "voiceChannelId": "YOUR_VOICE_CHANNEL_ID_1",
    "targetUserId": "OPTIONAL_USER_ID_TO_FOLLOW",
    "allowMove": true
  }
]
```

---

## 🔄 Menjalankan Bot 24/7 di Background (Rekomendasi PM2)

Agar bot dan Web Dashboard tetap berjalan terus menerus di VPS/Server:

```bash
# Install PM2 secara global
npm install -g pm2

# Jalankan bot dengan PM2
pm2 start index.js --name "discord-afk-dashboard"

# Save PM2 state
pm2 startup
pm2 save
```

---

## 🛠️ Struktur Proyek

```
dc-afk/
├── index.js          # Main orchestrator & AFK Bot Manager
├── src/
│   ├── logger.js     # Logger emitter & history buffer untuk live SSE
│   └── webServer.js  # Express REST API & SSE Real-Time Streaming Server
├── public/
│   ├── index.html    # Dashboard HTML UI
│   ├── style.css     # Dark Glassmorphism CSS Design System
│   └── app.js        # Frontend Telemetry, Voice Switcher & Control Logic
├── bots.json         # Konfigurasi Multi-Bot
├── .env              # Environment Variables (TOKEN, PORT, etc)
├── package.json      # Dependensi proyek
└── README.md         # Dokumentasi penggunaan
```
