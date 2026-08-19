const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const SECRET_FILE = path.join(__dirname, '..', '.totp_secret');
const APP_NAME = 'Discord AFK Control Center';

let _secret = null;
let _confirmed = false;

/**
 * Load or generate TOTP secret from .totp_secret file
 */
function loadOrGenerateSecret() {
  if (fs.existsSync(SECRET_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(SECRET_FILE, 'utf8'));
      _secret = data.secret;
      _confirmed = data.confirmed === true;
      console.log(`\x1b[32m✅ [TOTP] Secret TOTP berhasil dimuat dari .totp_secret. Status: ${_confirmed ? 'CONFIRMED (QR sudah di-scan)' : 'PENDING (QR belum di-scan)'}\x1b[0m`);
    } catch (err) {
      console.error('\x1b[31m[TOTP ERROR] Gagal membaca .totp_secret, membuat secret baru...\x1b[0m');
      _secret = null;
      _confirmed = false;
    }
  }

  if (!_secret) {
    const generated = speakeasy.generateSecret({
      name: APP_NAME,
      length: 32
    });
    _secret = generated.base32;
    _confirmed = false;
    saveSecret();
    console.log(`\x1b[33m⚠️  [TOTP] Secret TOTP baru dibuat. Silakan scan QR Code di halaman login.\x1b[0m`);
  }
}

function saveSecret() {
  try {
    fs.writeFileSync(SECRET_FILE, JSON.stringify({ secret: _secret, confirmed: _confirmed }, null, 2), 'utf8');
  } catch (err) {
    console.error('\x1b[31m[TOTP ERROR] Gagal menyimpan .totp_secret:\x1b[0m', err.message);
  }
}

/**
 * Verify a 6-digit TOTP token from Google Authenticator
 * @param {string} token - 6-digit code from Google Authenticator
 * @returns {boolean}
 */
function verifyTOTP(token) {
  if (!_secret) return false;
  return speakeasy.totp.verify({
    secret: _secret,
    encoding: 'base32',
    token: String(token),
    window: 1  // Allow ±30 seconds tolerance
  });
}

/**
 * Mark TOTP as confirmed after first successful verification
 */
function confirmSetup() {
  _confirmed = true;
  saveSecret();
  console.log('\x1b[32m✅ [TOTP] Google Authenticator berhasil dikonfirmasi! QR Code tidak akan muncul lagi.\x1b[0m');
}

/**
 * Check if TOTP setup is confirmed (QR already scanned)
 * @returns {boolean}
 */
function isConfirmed() {
  return _confirmed;
}

/**
 * Generate QR Code as base64 data URL for display in the browser
 * @returns {Promise<string>}
 */
async function getQrCodeDataUrl() {
  if (!_secret) return null;
  try {
    const otpAuthUrl = speakeasy.otpauthURL({
      secret: _secret,
      encoding: 'base32',
      label: encodeURIComponent('Discord AFK Dashboard'),
      issuer: encodeURIComponent(APP_NAME)
    });
    const qrDataUrl = await QRCode.toDataURL(otpAuthUrl, {
      width: 260,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });
    return qrDataUrl;
  } catch (err) {
    console.error('[TOTP ERROR] Gagal membuat QR Code:', err.message);
    return null;
  }
}

// Initialize on module load
loadOrGenerateSecret();

module.exports = {
  verifyTOTP,
  confirmSetup,
  isConfirmed,
  getQrCodeDataUrl
};
