'use strict';
const path = require('path');
const crypto = require('crypto');

const MAX_BYTES = 5 * 1024 * 1024;
const OK = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

function assertSpaceImageFile(file) {
  if (!file || !OK.has(file.mimetype)) return 'Only JPEG, PNG, or WebP images are allowed.';
  if (Number(file.size) > MAX_BYTES) return 'Image must be 5MB or smaller.';
  return null;
}

function buildSafeSpaceFilename(originalName, mimetype) {
  const fromMime = EXT[mimetype] || '';
  const ext = fromMime || path.extname(originalName || '').toLowerCase() || '.bin';
  const stamp = Date.now().toString(36);
  const rand = crypto.randomBytes(4).toString('hex');
  return `space-${stamp}-${rand}${ext}`;
}

module.exports = { assertSpaceImageFile, buildSafeSpaceFilename, MAX_BYTES, OK_MIME: OK };
