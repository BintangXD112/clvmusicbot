'use strict';
/**
 * src/webhook/security.js
 * Verifikasi HMAC-SHA256 signature dari GitHub Webhook.
 */

const crypto = require('crypto');
const { WEBHOOK_SECRET } = require('./config');

/**
 * Verifikasi X-Hub-Signature-256 header dari GitHub.
 * Jika WEBHOOK_SECRET tidak diset, verifikasi dilewati (return true).
 *
 * @param {string} rawBody        - Raw request body sebagai string
 * @param {string|undefined} signatureHeader - Nilai header 'x-hub-signature-256'
 * @returns {boolean}
 */
function verifySignature(rawBody, signatureHeader) {
  if (!WEBHOOK_SECRET) return true; // Tidak ada secret → lewati verifikasi
  if (!signatureHeader) return false;

  const expected = `sha256=${crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex')}`;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signatureHeader)
    );
  } catch {
    return false;
  }
}

module.exports = { verifySignature };
