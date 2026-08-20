/**
 * public/js/state.js
 * Global state yang digunakan bersama oleh semua modul frontend.
 * Harus di-load PERTAMA sebelum modul lain.
 */

// Daftar bot yang sedang aktif (diperbarui dari SSE/REST)
var currentBotsData = [];

// Riwayat log yang ditampilkan di terminal
var logEntries = [];

// Filter level log aktif ('ALL', 'INFO', 'SUCCESS', 'WARN', 'ERROR')
var activeLogLevel = 'ALL';

// Menyimpan status bot sebelumnya untuk deteksi perubahan
var previousBotsStatuses = {};
