/**
 * public/js/ui/metrics.js
 * Render system metrics (CPU, RAM, OS, GPU) ke dashboard.
 */

function updateSystemMetrics(sys) {
  if (!sys || !sys.cpu) return;

  // CPU
  var cpuPercent = sys.cpu.usagePercent || 0;
  setText('cpu-usage', cpuPercent + '%');
  setWidth('cpu-bar', cpuPercent + '%');
  setHTML('cpu-model', '<i class="fa-solid fa-microchip"></i> ' + sys.cpu.model);
  setText('cpu-cores', sys.cpu.cores + ' Cores (' + sys.cpu.arch + (sys.cpu.isArm ? ' 🇦' : '') + ')');

  // RAM
  var ramPercent = sys.memory.usedPercent || 0;
  var usedGb  = (sys.memory.usedBytes  / Math.pow(1024, 3)).toFixed(1);
  var totalGb = (sys.memory.totalBytes / Math.pow(1024, 3)).toFixed(1);
  var heapMb  = Math.round(sys.memory.processHeapUsed / (1024 * 1024));
  setText('ram-usage',  ramPercent + '%');
  setWidth('ram-bar',   ramPercent + '%');
  setText('ram-detail', usedGb + ' GB / ' + totalGb + ' GB');
  setText('process-ram', 'Heap: ' + heapMb + ' MB');

  // Uptime & OS
  setText('process-uptime', formatSeconds(sys.process.uptimeSeconds));
  setText('os-uptime', 'OS Uptime: ' + formatSeconds(sys.os.uptimeSeconds));
  setHTML('os-info', '<i class="fa-solid fa-server"></i> ' + sys.os.platform + ' (' + sys.os.hostname + ')');
  setText('node-version', sys.process.nodeVersion);

  // GPU Cards
  var gpuContainer = document.getElementById('gpu-metrics-container');
  if (!gpuContainer || !sys.gpu || !sys.gpu.controllers) return;

  if (sys.gpu.controllers.length === 0) {
    gpuContainer.innerHTML = '';
    return;
  }

  gpuContainer.innerHTML = sys.gpu.controllers.map(function(g, i) {
    var hasUtil   = g.utilizationPercent >= 0;
    var utilPct   = hasUtil ? g.utilizationPercent : 0;
    var utilColor = utilPct >= 85 ? '#ef4444' : utilPct >= 60 ? '#f59e0b' : '#10b981';

    var hasVramDetail = g.vramTotalMB > 0 && g.vramUsedMB > 0;
    var vramUsedPct   = hasVramDetail ? Math.round((g.vramUsedMB / g.vramTotalMB) * 100) : 0;
    var vramLabel     = hasVramDetail
      ? g.vramUsedMB + ' / ' + g.vramTotalMB + ' MB VRAM (' + vramUsedPct + '%)'
      : (g.vramMB ? g.vramMB + ' MB VRAM' + (g.vramDynamic ? ' (Dynamic)' : '') : 'VRAM N/A');

    var tempBadge = g.temperatureC >= 0
      ? '<span style="margin-left:6px;padding:1px 6px;border-radius:999px;font-size:0.72rem;background:' +
        (g.temperatureC >= 85 ? 'rgba(239,68,68,0.2)' : g.temperatureC >= 70 ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)') +
        ';color:' + (g.temperatureC >= 85 ? '#ef4444' : g.temperatureC >= 70 ? '#f59e0b' : '#10b981') +
        ';border:1px solid currentColor">🌡️ ' + g.temperatureC + '°C</span>'
      : '';

    var utilHeadline = hasUtil
      ? '<div class="metric-value" style="color:' + utilColor + ';">' + utilPct + '%</div>'
      : '<div class="metric-value" style="font-size:1rem;color:var(--text-muted);">N/A</div>';

    return '<div class="metric-card">' +
      '<div class="metric-header">' +
        '<div class="metric-icon" style="background:linear-gradient(135deg,rgba(139,92,246,0.15),rgba(59,130,246,0.15));color:#a78bfa;border:1px solid rgba(139,92,246,0.3);">' +
          '<i class="fa-solid fa-display"></i>' +
        '</div>' +
        '<span class="metric-title">GPU' + (sys.gpu.controllers.length > 1 ? ' #' + (i + 1) : '') + ' Load' + tempBadge + '</span>' +
      '</div>' +
      '<div class="metric-body">' +
        utilHeadline +
        '<div class="progress-bar" style="margin-top:6px;">' +
          '<div class="progress-fill" style="width:' + utilPct + '%;background:' + utilColor + ';transition:width 0.6s ease;"></div>' +
        '</div>' +
      '</div>' +
      '<div class="metric-footer" style="flex-direction:column;align-items:flex-start;gap:4px;">' +
        '<div style="width:100%;">' +
          '<span style="font-size:0.72rem;color:var(--text-muted);">VRAM: ' + esc(vramLabel) + '</span>' +
          (hasVramDetail ? '<div class="progress-bar" style="height:4px;margin-top:3px;"><div class="progress-fill ram-fill" style="width:' + vramUsedPct + '%;transition:width 0.6s ease;"></div></div>' : '') +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;width:100%;">' +
          '<span><i class="fa-solid fa-industry"></i> ' + esc(g.vendor || 'Unknown') + '</span>' +
          '<span style="font-size:0.72rem;color:var(--text-muted);">' + esc(g.model || 'Unknown GPU') + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}
