'use strict';
/**
 * src/web/domainGuard.js
 * Middleware pembatasan domain (Domain Origin Restriction Guard).
 * Memastikan web panel hanya dapat diakses melalui domain / host yang telah diizinkan.
 */

/**
 * Periksa apakah host yang merequest diizinkan dalam daftar ALLOWED_DOMAINS.
 * @param {import('express').Request} req - Express request object
 * @returns {boolean}
 */
function isHostAllowed(req) {
  const isEnabled = process.env.ALLOWED_DOMAINS_ENABLED === 'true';
  const allowedConfig = process.env.ALLOWED_DOMAINS || '';

  // Jika pembatasan domain tidak diaktifkan atau wildcard '*', izinkan semua request
  if (!isEnabled || !allowedConfig.trim() || allowedConfig.trim() === '*') {
    return true;
  }

  const hostHeader = (req.headers.host || '').toLowerCase().trim();
  const forwardedHostHeader = (req.headers['x-forwarded-host'] || '').toLowerCase().trim();

  if (!hostHeader && !forwardedHostHeader) return false;

  // Tes host header langsung dan host tanpa port, serta header x-forwarded-host dari proxy
  const hostsToTest = [
    hostHeader,
    hostHeader.split(':')[0],
    forwardedHostHeader,
    forwardedHostHeader.split(':')[0]
  ].filter(Boolean);

  const allowedList = allowedConfig
    .split(',')
    .map(d => d.trim().toLowerCase())
    .filter(Boolean);

  for (const allowed of allowedList) {
    if (allowed === '*') return true;

    for (const testHost of hostsToTest) {
      if (allowed === testHost) {
        return true;
      }

      // Dukungan Wildcard Domain (misal: *.mydomain.com)
      if (allowed.startsWith('*.')) {
        const baseDomain = allowed.substring(2);
        if (testHost.endsWith('.' + baseDomain) || testHost === baseDomain) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Express middleware untuk memblokir request dari domain yang tidak diizinkan.
 */
function domainGuardMiddleware(req, res, next) {
  const host = req.headers.host || req.headers['x-forwarded-host'] || 'Unknown';

  if (!isHostAllowed(req)) {
    req._domainBlocked = true;
    req._blockedReason = `Domain/Host '${host}' tidak terdaftar dalam ALLOWED_DOMAINS`;

    // Untuk request API, kembalikan respons JSON 403 Forbidden
    if (req.path.startsWith('/api/')) {
      return res.status(403).json({
        error: `Akses Ditolak: Host '${host}' tidak diizinkan mengakses Web Panel ini.`,
        host,
        domainRestrictionActive: true
      });
    }

    // Untuk akses browser / halaman web, tampilkan halaman Access Denied yang elegan
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
          <p>Web Panel ini dilindungi oleh <strong>Domain Access Security Guard</strong>. Permintaan koneksi dari Host Anda ditolak.</p>
          
          <div class="host-box">
            <span class="host-label">Host / Domain yang Anda akses:</span>
            <span class="host-code">${host}</span>
          </div>

          <p style="font-size: 0.85rem; color: #64748b;">
            Jika Anda adalah administrator panel ini, silakan tambahkan domain di atas ke daftar <code>ALLOWED_DOMAINS</code> melalui domain terdaftar atau perbarui file <code>.env</code>.
          </p>

          <span class="badge-security">
            <i class="fa-solid fa-lock"></i> Domain Restriction Guard Active
          </span>

          <button class="btn-retry" onclick="window.location.reload()">
            <i class="fa-solid fa-arrows-rotate"></i> Coba Akses Kembali
          </button>
        </div>
      </body>
      </html>
    `);
  }

  next();
}

module.exports = {
  isHostAllowed,
  domainGuardMiddleware
};
