'use strict';
/**
 * src/web/domainGuard.js
 * Middleware pembatasan domain (Domain Origin Restriction Guard).
 * Memastikan web panel HANYA dapat diakses melalui 1 domain utama yang diizinkan.
 */

/**
 * Normalisasi string domain ke format murni domain / hostname tanpa protokol, port, atau path.
 * @param {string} rawDomain
 * @returns {string}
 */
function normalizeDomain(rawDomain) {
  if (!rawDomain || typeof rawDomain !== 'string') return '';
  let str = rawDomain.trim().toLowerCase();

  // Hapus protokol http:// atau https:// jika dimasukkan pengguna
  str = str.replace(/^https?:\/\//i, '');

  // Ambil bagian hostname sebelum slash / atau query ?
  str = str.split('/')[0].split('?')[0];

  // Jika terdapat koma (multiple domain), ambil domain pertama
  if (str.includes(',')) {
    str = str.split(',')[0].trim();
  }

  // Hapus port number seperti :3000 atau :24601 jika ada
  if (str.includes(':')) {
    if (!str.startsWith('[') || str.indexOf(']:') !== -1) {
      str = str.split(':')[0].trim();
    }
  }

  // Hapus prefix wildcard *. jika ada
  str = str.replace(/^\*\.?/, '');

  return str;
}

/**
 * Ambil 1 domain yang dikonfigurasi di environment.
 * @returns {string}
 */
function getAllowedDomain() {
  const allowedConfig = process.env.ALLOWED_DOMAINS || process.env.ALLOWED_DOMAIN || '';
  return normalizeDomain(allowedConfig);
}

/**
 * Ekstrak host utama yang sedang mengakses server secara murni.
 * @param {import('express').Request} req
 * @returns {string}
 */
function getEffectiveHost(req) {
  if (!req || !req.headers) return '';
  const rawHost = req.headers.host || req.headers['x-forwarded-host'] || req.hostname || '';
  return normalizeDomain(rawHost);
}

/**
 * Periksa apakah host yang merequest diizinkan secara eksklusif (Strict Single Domain Match).
 * Anti-bypass untuk IP:port direct access dan header spoofing.
 * @param {import('express').Request} req - Express request object
 * @returns {boolean}
 */
function isHostAllowed(req) {
  const isEnabled = process.env.ALLOWED_DOMAINS_ENABLED === 'true';

  // Jika pembatasan domain tidak diaktifkan, izinkan semua request
  if (!isEnabled) {
    return true;
  }

  const allowedDomain = getAllowedDomain();
  // Jika restriksi diaktifkan tapi domain yang diizinkan belum diset, blokir semua
  if (!allowedDomain) {
    return false;
  }

  // Ambil murni host yang diakses client via header Host:
  const hostHeader = normalizeDomain((req.headers && req.headers.host) ? req.headers.host : '');

  // Ambil host dari X-Forwarded-Host jika dari reverse proxy
  const forwardedHost = normalizeDomain((req.headers && req.headers['x-forwarded-host']) ? req.headers['x-forwarded-host'] : '');

  // 1. Direct request via Host header matching allowedDomain -> PASS
  if (hostHeader && hostHeader === allowedDomain) {
    return true;
  }

  // 2. Request via reverse proxy (Nginx/Cloudflare) di mana Host header backend adalah localhost/127.0.0.1
  //    dan X-Forwarded-Host dari proxy sesuai allowedDomain -> PASS
  const isLocalProxyBackend = hostHeader === 'localhost' || hostHeader === '127.0.0.1' || hostHeader === '::1';
  if (forwardedHost && forwardedHost === allowedDomain && isLocalProxyBackend) {
    return true;
  }

  // Akses langsung dari IP (misal http://1.2.3.4:24601) atau domain lain -> DENY
  return false;
}

/**
 * Express middleware untuk memblokir total seluruh request dari domain yang tidak diizinkan.
 */
function domainGuardMiddleware(req, res, next) {
  try {
    const isAllowed = isHostAllowed(req);
    const effectiveHost = getEffectiveHost(req) || req.headers.host || 'Unknown Host';
    const allowedDomain = getAllowedDomain();

    if (!isAllowed) {
      req._domainBlocked = true;
      req._blockedReason = `Domain/IP '${effectiveHost}' tidak diizinkan. Hanya domain '${allowedDomain || 'Belum diatur'}' yang dapat mengakses Web Panel ini.`;

      // Set Security Headers untuk mencegah caching dan framing halaman blocked
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');

      // Untuk request API, kembalikan respons JSON 403 Forbidden
      if (req.path.startsWith('/api/')) {
        return res.status(403).json({
          error: `Akses Ditolak: Host/IP '${effectiveHost}' tidak memiliki izin mengakses Web Panel ini. Halaman ini hanya dapat diakses melalui domain: ${allowedDomain || 'Belum diatur'}`,
          host: effectiveHost,
          allowedDomain: allowedDomain,
          domainRestrictionActive: true
        });
      }

      // Untuk akses browser / web pages / static assets (app.js, style.css, login.html, index.html, dll),
      // tampilkan halaman Access Denied 403 yang eksklusif dan memblokir total akses web app.
      return res.status(403).send(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>403 Access Denied - Restriksi Domain Aktif</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet">
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              background-color: #0b0f19;
              background-image: 
                radial-gradient(at 0% 0%, rgba(239, 68, 68, 0.15) 0px, transparent 50%),
                radial-gradient(at 100% 100%, rgba(139, 92, 246, 0.1) 0px, transparent 50%);
              color: #f8fafc;
              font-family: 'Outfit', -apple-system, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              padding: 20px;
            }
            .card {
              background: rgba(18, 26, 43, 0.85);
              backdrop-filter: blur(16px);
              border: 1px solid rgba(239, 68, 68, 0.35);
              padding: 44px 36px;
              border-radius: 20px;
              max-width: 520px;
              width: 100%;
              text-align: center;
              box-shadow: 0 20px 50px rgba(0,0,0,0.6);
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 16px;
            }
            .icon-box {
              width: 72px;
              height: 72px;
              border-radius: 50%;
              background: rgba(239, 68, 68, 0.15);
              border: 2px solid rgba(239, 68, 68, 0.4);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 32px;
              color: #ef4444;
              box-shadow: 0 0 24px rgba(239, 68, 68, 0.3);
            }
            h1 {
              color: #f87171;
              font-size: 1.75rem;
              font-weight: 700;
              letter-spacing: -0.5px;
            }
            p {
              color: #94a3b8;
              font-size: 0.95rem;
              line-height: 1.6;
            }
            .host-box {
              background: rgba(15, 23, 42, 0.8);
              border: 1px solid rgba(255, 255, 255, 0.08);
              padding: 12px 18px;
              border-radius: 12px;
              width: 100%;
              display: flex;
              flex-direction: column;
              gap: 6px;
            }
            .host-label {
              font-size: 0.78rem;
              color: #64748b;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .host-code {
              font-family: 'JetBrains Mono', monospace;
              color: #fbbf24;
              font-size: 1.05rem;
              font-weight: 600;
              word-break: break-all;
            }
            .badge-security {
              display: inline-flex;
              align-items: center;
              gap: 6px;
              background: rgba(239, 68, 68, 0.15);
              color: #f87171;
              border: 1px solid rgba(239, 68, 68, 0.3);
              padding: 6px 14px;
              border-radius: 20px;
              font-size: 0.8rem;
              font-weight: 600;
            }
            .btn-retry {
              margin-top: 8px;
              background: #1e293b;
              color: #f8fafc;
              border: 1px solid rgba(255, 255, 255, 0.12);
              padding: 10px 20px;
              border-radius: 10px;
              cursor: pointer;
              font-family: inherit;
              font-size: 0.9rem;
              font-weight: 600;
              display: inline-flex;
              align-items: center;
              gap: 8px;
              transition: all 0.2s ease;
            }
            .btn-retry:hover {
              background: #334155;
              color: white;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon-box">
              <i class="fa-solid fa-shield-cat"></i>
            </div>
            <h1>403 Access Denied</h1>
            <p>Web Panel ini dilindungi oleh <strong>Domain Access Security Guard</strong>. Akses dari Host / IP Anda ditolak total.</p>

            <div class="host-box">
              <span class="host-label">Host / IP yang Anda Akses:</span>
              <span class="host-code">${effectiveHost}</span>
            </div>

            <p style="font-size: 0.85rem; color: #64748b;">
              Panel ini hanya dikonfigurasi untuk dapat diakses melalui 1 domain utama yaitu: <code style="color: #60a5fa;">${allowedDomain || 'Belum Ditetapkan'}</code>.
            </p>

            <span class="badge-security">
              <i class="fa-solid fa-lock"></i> Strict Single Domain Guard Active
            </span>

            <button class="btn-retry" onclick="window.location.reload()">
              <i class="fa-solid fa-arrows-rotate"></i> Coba Muat Ulang
            </button>
          </div>
        </body>
        </html>
      `);
    }

    next();
  } catch (err) {
    console.error('⚠️ [DOMAIN GUARD ERROR]', err);
    res.setHeader('Cache-Control', 'no-store');
    res.status(403).send('403 Access Denied: Domain Security Validation Error');
  }
}

module.exports = {
  normalizeDomain,
  getAllowedDomain,
  getEffectiveHost,
  isHostAllowed,
  domainGuardMiddleware
};
