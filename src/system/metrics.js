'use strict';
/**
 * src/system/metrics.js
 * Kalkulasi dan pengambilan data sistem: CPU, RAM, OS, Process, GPU.
 */

const os = require('os');
const si = require('systeminformation');
const { exec } = require('child_process');

// ─────────────────────────────────────────────────────────────────────────────
// GPU Cache
// ─────────────────────────────────────────────────────────────────────────────

let cachedGpu = { controllers: [] };

/**
 * Query GPU load & VRAM usage via Windows Performance Counters (PowerShell).
 * Hanya berjalan di Windows. Mengembalikan null di platform lain.
 */
function queryWindowsGpuMetrics() {
  return new Promise((resolve) => {
    if (os.platform() !== 'win32') return resolve(null);
    const cmd = "powershell -Command \"$load = (((Get-Counter '\\GPU Engine(*engtype_3D)\\Utilization Percentage' -ErrorAction SilentlyContinue).CounterSamples | Where-Object CookedValue).CookedValue | Measure-Object -Sum).Sum; $vram = (((Get-Counter '\\GPU Adapter Memory(*)\\Dedicated Usage' -ErrorAction SilentlyContinue).CounterSamples | Where-Object CookedValue).CookedValue | Measure-Object -Sum).Sum; Write-Output \\\"$load|$vram\\\"\"";
    exec(cmd, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const parts    = stdout.trim().split('|');
      const load     = parseFloat(parts[0]);
      const vramBytes = parseFloat(parts[1]);
      resolve({
        load:   isNaN(load)      ? 0 : Math.round(load),
        vramMB: isNaN(vramBytes) ? 0 : Math.round(vramBytes / (1024 * 1024))
      });
    });
  });
}

async function refreshGpuCache() {
  try {
    const data = await si.graphics();
    if (os.platform() === 'win32' && data.controllers && data.controllers.length > 0) {
      const metrics = await queryWindowsGpuMetrics();
      if (metrics) {
        data.controllers.forEach(ctrl => {
          ctrl.utilizationGpu = metrics.load;
          ctrl.memoryUsed     = metrics.vramMB;
          if (!ctrl.memoryTotal || ctrl.memoryTotal < metrics.vramMB) {
            ctrl.memoryTotal = Math.max(ctrl.memoryTotal || 0, metrics.vramMB);
          }
        });
      }
    }
    cachedGpu = data;
  } catch (_) {}
}

// Mulai refresh GPU cache
refreshGpuCache();
setInterval(refreshGpuCache, 5000);

// ─────────────────────────────────────────────────────────────────────────────
// CPU Cache
// ─────────────────────────────────────────────────────────────────────────────

let cachedCpuInfo = null;

async function refreshCpuInfoCache() {
  try { cachedCpuInfo = await si.cpu(); } catch (_) {}
}

refreshCpuInfoCache(); // One-time fetch, model tidak berubah

// ─────────────────────────────────────────────────────────────────────────────
// CPU Usage Calculation
// ─────────────────────────────────────────────────────────────────────────────

function getCpuTicks() {
  const cpus = os.cpus();
  let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;
  for (const cpu of cpus) {
    user += cpu.times.user;
    nice += cpu.times.nice;
    sys  += cpu.times.sys;
    idle += cpu.times.idle;
    irq  += cpu.times.irq;
  }
  return { user, nice, sys, idle, irq, total: user + nice + sys + idle + irq };
}

let previousCpuTicks = getCpuTicks();

function calculateCpuUsage() {
  const current   = getCpuTicks();
  const totalDiff = current.total - previousCpuTicks.total;
  const idleDiff  = current.idle  - previousCpuTicks.idle;
  previousCpuTicks = current;
  if (totalDiff === 0) return 0;
  return Math.max(0, Math.min(100, 100 - Math.floor((idleDiff / totalDiff) * 100)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: getSystemMetrics()
// ─────────────────────────────────────────────────────────────────────────────

function getSystemMetrics() {
  const totalMem  = os.totalmem();
  const freeMem   = os.freemem();
  const usedMem   = totalMem - freeMem;
  const processMem = process.memoryUsage();

  const arch     = os.arch();
  let cpuModel   = os.cpus()[0]?.model || 'Unknown CPU';
  if (cachedCpuInfo) {
    const siModel = [cachedCpuInfo.manufacturer, cachedCpuInfo.brand].filter(Boolean).join(' ');
    if (siModel && siModel.trim()) cpuModel = siModel.trim();
  }

  return {
    cpu: {
      model:        cpuModel,
      cores:        os.cpus().length,
      usagePercent: calculateCpuUsage(),
      arch:         arch,
      isArm:        arch === 'arm64' || arch === 'arm'
    },
    memory: {
      totalBytes:        totalMem,
      usedBytes:         usedMem,
      freeBytes:         freeMem,
      usedPercent:       Math.round((usedMem / totalMem) * 100),
      processRss:        processMem.rss,
      processHeapTotal:  processMem.heapTotal,
      processHeapUsed:   processMem.heapUsed
    },
    os: {
      platform:      os.platform(),
      release:       os.release(),
      hostname:      os.hostname(),
      uptimeSeconds: os.uptime()
    },
    process: {
      uptimeSeconds: Math.floor(process.uptime()),
      pid:           process.pid,
      nodeVersion:   process.version
    },
    gpu: {
      controllers: (cachedGpu.controllers || []).map(g => ({
        model:              g.model        || 'Unknown GPU',
        vendor:             g.vendor       || '',
        vramMB:             g.vram         || 0,
        vramUsedMB:         g.memoryUsed   || 0,
        vramFreeMB:         g.memoryFree   || 0,
        vramTotalMB:        g.memoryTotal  || g.vram || 0,
        vramDynamic:        g.vramDynamic  || false,
        utilizationPercent: (g.utilizationGpu !== null && g.utilizationGpu !== undefined) ? g.utilizationGpu : -1,
        temperatureC:       (g.temperatureGpu !== null && g.temperatureGpu !== undefined) ? g.temperatureGpu : -1,
        driverVersion:      g.driverVersion || 'N/A'
      }))
    }
  };
}

module.exports = { getSystemMetrics };
