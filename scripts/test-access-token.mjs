// scripts/test-access-token.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { signAccessToken, verifyAccessToken } = require('../lib/access-token.js');

const SECRET = 'test-access-secret';
const base = {
  sub: 'u_1', ent: 'en_1', plan: 'month', floors: ['2', '3'],
  pending_activation: true,
};

test('sign and verify roundtrip', () => {
  const token = signAccessToken(base, SECRET, { now: 1_000_000, ttlSec: 60 });
  const p = verifyAccessToken(token, SECRET, { now: 1_000_030 });
  assert.equal(p.sub, 'u_1');
  assert.equal(p.ent, 'en_1');
  assert.equal(p.pending_activation, true);
  assert.deepEqual(p.floors, ['2', '3']);
  assert.equal(p.exp, 1_000_060);
});

test('rejects bad signature', () => {
  const token = signAccessToken(base, SECRET, { now: 1_000_000, ttlSec: 60 });
  assert.equal(verifyAccessToken(token, 'other', { now: 1_000_030 }), null);
});

test('rejects extra segment', () => {
  const token = signAccessToken(base, SECRET, { now: 1_000_000, ttlSec: 60 });
  assert.equal(verifyAccessToken(token + '.extra', SECRET, { now: 1_000_030 }), null);
});

test('rejects expired', () => {
  const token = signAccessToken(base, SECRET, { now: 1_000_000, ttlSec: 60 });
  assert.equal(verifyAccessToken(token, SECRET, { now: 1_000_061 }), null);
});

test('sign throws without secret', () => {
  assert.throws(() => signAccessToken(base, '', { now: 1, ttlSec: 60 }));
});
