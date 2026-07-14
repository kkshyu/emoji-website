'use strict';
const path = require('path');
const crypto = require('crypto');

const MAX_BYTES = 5 * 1024 * 1024;
const OK = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

function assertSocialImageFile(file) {
  if (!file || !OK.has(file.mimetype)) return 'Only JPEG, PNG, or WebP images are allowed.';
  if (Number(file.size) > MAX_BYTES) return 'Image must be 5MB or smaller.';
  return null;
}

function buildSafeSocialFilename(originalName, mimetype) {
  const fromMime = EXT[mimetype] || '';
  const ext = fromMime || path.extname(originalName || '').toLowerCase() || '.bin';
  const stamp = Date.now().toString(36);
  const rand = crypto.randomBytes(4).toString('hex');
  return `social-${stamp}-${rand}${ext}`;
}

// 檔頭 magic bytes 驗證（用戶端 MIME 可偽造）：回傳偵測到的 MIME 或 null
function sniffImageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

module.exports = { assertSocialImageFile, buildSafeSocialFilename, sniffImageType, MAX_BYTES, OK_MIME: OK };
