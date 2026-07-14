// scripts/test-social-upload.mjs — 社群圖片上傳驗證（lib/social-upload.js）
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { assertSocialImageFile, buildSafeSocialFilename, sniffImageType, MAX_BYTES } = require('../lib/social-upload.js');

test('MIME 白名單與大小上限', () => {
  assert.equal(assertSocialImageFile({ mimetype: 'image/png', size: 1000 }), null);
  assert.match(assertSocialImageFile({ mimetype: 'text/html', size: 10 }), /Only JPEG/);
  assert.match(assertSocialImageFile({ mimetype: 'image/png', size: MAX_BYTES + 1 }), /5MB/);
});

test('安全檔名：social- 前綴、不含原始檔名、副檔名依 MIME', () => {
  const n = buildSafeSocialFilename('../../evil<script>.png.exe', 'image/webp');
  assert.match(n, /^social-[a-z0-9]+-[0-9a-f]{8}\.webp$/);
});

test('sniffImageType：JPEG/PNG/WebP magic bytes，其餘回 null', () => {
  const jpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const png = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0]);
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);
  const html = Buffer.from('<html><body>hi</body>');
  assert.equal(sniffImageType(jpeg), 'image/jpeg');
  assert.equal(sniffImageType(png), 'image/png');
  assert.equal(sniffImageType(webp), 'image/webp');
  assert.equal(sniffImageType(html), null);
  assert.equal(sniffImageType(Buffer.alloc(4)), null);
  assert.equal(sniffImageType(null), null);
});
