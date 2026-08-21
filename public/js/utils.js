/**
 * public/js/utils.js
 * Fungsi utilitas umum: format waktu, escape HTML, DOM helpers, export log.
 */

/** Format detik menjadi string "Xd XXh XXm XXs". */
function formatSeconds(sec) {
  sec = Number(sec) || 0;
  var d = Math.floor(sec / 86400);
  var h = Math.floor((sec % 86400) / 3600);
  var m = Math.floor((sec % 3600) / 60);
  var s = Math.floor(sec % 60);
  return d + 'd ' + pad(h) + 'h ' + pad(m) + 'm ' + pad(s) + 's';
}

/** Tambahkan leading zero jika n < 10. */
function pad(n) { return n < 10 ? '0' + n : n; }

/** Escape karakter HTML berbahaya. */
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeHtml(str) {
  return esc(str);
}
if (typeof window !== 'undefined') {
  window.escapeHtml = escapeHtml;
  window.esc = esc;
}

/** Set innerText elemen berdasarkan ID. */
function setText(id, val) {
  var el = document.getElementById(id);
  if (el) el.innerText = val;
}

/** Set innerHTML elemen berdasarkan ID. */
function setHTML(id, val) {
  var el = document.getElementById(id);
  if (el) el.innerHTML = val;
}

/** Set width style elemen berdasarkan ID. */
function setWidth(id, val) {
  var el = document.getElementById(id);
  if (el) el.style.width = val;
}

/** Export semua log entries ke file .txt dan trigger download. */
function exportLogs() {
  if (!logEntries || logEntries.length === 0) {
    showToast('Tidak ada log untuk diekspor', 'warn');
    return;
  }
  var text = logEntries.map(function(e) {
    var time = new Date(e.timestamp).toISOString();
    return '[' + time + '] [' + e.level.toUpperCase() + '] [' + e.tag + ']: ' + e.message + ' ' + (e.extra || '');
  }).join('\n');

  var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href     = url;
  a.download = 'bot_logs_' + new Date().toISOString().slice(0, 10) + '.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Log berhasil diekspor dan diunduh!', 'success');
}
