/**
 * public/js/sse.js
 * Inisialisasi SSE (Server-Sent Events) client untuk menerima
 * live log dan telemetry dari server.
 */

function initSSE() {
  var liveIndicator = document.getElementById('live-indicator');
  var eventSource   = new EventSource('/api/stream');

  eventSource.onopen = function() {
    window.sseConnected = true;
    if (liveIndicator) {
      liveIndicator.innerHTML = '<span class="pulse-dot"></span><span class="status-text">SSE Live Connected</span>';
      liveIndicator.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    }
  };

  eventSource.onmessage = function(event) {
    try {
      var message = JSON.parse(event.data);
      if (message.type === 'init_logs') {
        logEntries = message.data || [];
        renderLogs();
      } else if (message.type === 'log') {
        logEntries.push(message.data);
        if (logEntries.length > 200) logEntries.shift();
        appendLogEntry(message.data);
      } else if (message.type === 'telemetry') {
        if (message.data.system) updateSystemMetrics(message.data.system);
        if (message.data.bots)   updateBotsSection(message.data.bots);
      }
    } catch (e) {}
  };

  eventSource.onerror = function() {
    window.sseConnected = false;
    if (liveIndicator) {
      liveIndicator.innerHTML =
        '<span class="pulse-dot" style="background-color:var(--danger)"></span>' +
        '<span class="status-text" style="color:var(--danger)">SSE Disconnected</span>';
    }
  };
}
