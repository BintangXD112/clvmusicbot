/**
 * public/js/ui/logs.js
 * Log terminal: render, filter, append, dan auto-scroll log entries.
 */

/** Set filter level aktif dan re-render log. */
function filterLogs(level) {
  if (level) {
    activeLogLevel = level;
    document.querySelectorAll('.filter-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.level === level);
    });
  }
  renderLogs();
}

/** Render ulang seluruh log sesuai filter level dan search text. */
function renderLogs() {
  var container = document.getElementById('log-container');
  if (!container) return;

  var searchText = (document.getElementById('log-search') ? document.getElementById('log-search').value : '').toLowerCase();
  var filtered   = logEntries.filter(function(e) {
    if (activeLogLevel !== 'ALL' && e.level !== activeLogLevel) return false;
    if (searchText && !e.message.toLowerCase().includes(searchText) && !e.tag.toLowerCase().includes(searchText)) return false;
    return true;
  });

  container.innerHTML = filtered.map(formatLogHtml).join('');
  scrollTerminal();
}

/** Tambahkan satu log entry baru ke terminal (tanpa re-render semua). */
function appendLogEntry(entry) {
  var container = document.getElementById('log-container');
  if (!container) return;
  var searchText = (document.getElementById('log-search') ? document.getElementById('log-search').value : '').toLowerCase();
  if (activeLogLevel !== 'ALL' && entry.level !== activeLogLevel) return;
  if (searchText && !entry.message.toLowerCase().includes(searchText)) return;
  container.insertAdjacentHTML('beforeend', formatLogHtml(entry));
  scrollTerminal();
}

/** Format satu log entry menjadi HTML string. */
function formatLogHtml(entry) {
  var t   = new Date(entry.timestamp).toLocaleTimeString();
  var lvl = (entry.level || 'info').toLowerCase();
  return '<div class="log-entry ' + lvl + '">' +
    '<span class="log-time">[' + t + ']</span>' +
    '<span class="log-tag">[' + esc(entry.tag) + ']</span>' +
    '<span class="log-message">' + esc(entry.message) + ' ' + esc(entry.extra || '') + '</span>' +
  '</div>';
}

/** Hapus semua log di terminal. */
function clearTerminal() { logEntries = []; renderLogs(); }

/** Scroll terminal ke bawah jika auto-scroll aktif. */
function scrollTerminal() {
  var checkbox = document.getElementById('auto-scroll-check');
  if (checkbox && checkbox.checked) {
    var c = document.getElementById('log-container');
    if (c) c.scrollTop = c.scrollHeight;
  }
}
