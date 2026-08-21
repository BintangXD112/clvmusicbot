'use strict';
/**
 * src/web/domainGuard.js
 * Middleware pembatasan domain (Domain Origin Restriction Guard).
 * Memastikan web panel hanya dapat diakses melalui domain / host yang telah diizinkan.
 */

/**
 * Periksa apakah host yang merequest diizinkan dalam daftar.
 * @param {string} rawHost - req.headers.host
 * @returns {boolean}
 */
function isHostAllowed(rawHost) {
  const isEnabled = process.env.ALLOWED_DOMAINS_ENABLED === 'true';
  const allowedConfig = process.env.ALLOWED_DOMAINS || '';

  // Jika pembatasan domain tidak diaktifkan atau wildcard '*', izinkan semua
  if (!isEnabled || !allowedConfig.trim() || allowedConfig.trim() === '*') {
    return true;
  }

  if (!rawHost) return false;

  const currentHost = rawHost.toLowerCase().trim();
  const currentHostWithoutPort = currentHost.split(':')[0];

  const allowedList = allowedConfig
    .split(',')
    .map(d => d.trim().toLowerCase())
    .filter(Boolean);

  for (const allowed of allowedList) {
    if (allowed === '*' || allowed === currentHost || allowed === currentHostWithoutPort) {
      return true;
    }

    // Dukungan Wildcard Domain (misal: *.mydomain.com)
    if (allowed.startsWith('*.')) {
      const baseDomain = allowed.substring(2);
      if (currentHostWithoutPort.endsWith('.' + baseDomain) || currentHostWithoutPort === baseDomain) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Express middleware untuk memblokir request dari domain yang tidak diizinkan.
 */
function domainGuardMiddleware(req, res, next) {
  const host = req.headers.host || '';

  if (!isHostAllowed(host)) {
    req._domainBlocked = true;
    req._blockedReason = `Domain/Host '${host}' tidak terdaftar dalam ALLOWED_DOMAINS`;

    if (req.path.startsWith('/api/')) {
      return res.status(403).json({
        error: `Akses Ditolak: Host '${host}' tidak diizinkan mengakses Web Panel.`,
        host,
        domainRestrictionActive: true
      });
    }

    return res.status(403).send(`
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>403 Forbidden - Akses Domain Dibatasi</title>
        <style>
          body { background-color: #0b0f19; color: #f8fafc; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
          .card { background: rgba(18, 26, 43, 0.9); border: 1px solid rgba(239, 68, 68, 0.4); padding: 40px; border-radius: 16px; max-width: 480px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
          h1 { color: #ef4444; font-size: 1.8rem; margin-bottom: 12px; }
          p { color: #94a3b8; font-size: 0.95rem; line-height: 1.6; }
          code { background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; color: #fbbf24; }
          .badge { display: inline-block; background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; margin-top: 15px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>🛑 403 Access Forbidden</h1>
          <p>Web Panel ini dilindungi oleh <strong>Domain Access Security Guard</strong>.</p>
          <p>Host/Domain Anda saat ini: <code>${host || 'Unknown'}</code> tidak diizinkan untuk mengakses panel ini.</p>
          <span class="badge">Security Policy Active</span>
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
