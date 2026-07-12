// scripts/test-space-upload.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { assertSpaceImageFile, buildSafeSpaceFilename } = require('../lib/space-upload.js');

test('assertSpaceImageFile accepts jpeg/png/webp under 5MB', () => {
  assert.equal(assertSpaceImageFile({ mimetype: 'image/jpeg', size: 1000 }), null);
  assert.equal(assertSpaceImageFile({ mimetype: 'image/png', size: 1000 }), null);
  assert.equal(assertSpaceImageFile({ mimetype: 'image/webp', size: 1000 }), null);
});

test('assertSpaceImageFile rejects bad type or size', () => {
  assert.match(assertSpaceImageFile({ mimetype: 'application/pdf', size: 100 }), /image/i);
  assert.match(assertSpaceImageFile({ mimetype: 'image/jpeg', size: 6 * 1024 * 1024 }), /5/);
});

test('buildSafeSpaceFilename keeps extension and sanitizes', () => {
  const n = buildSafeSpaceFilename('My Floor!!.PNG');
  assert.match(n, /\.png$/);
  assert.doesNotMatch(n, /[!/]/);
});
