// scripts/test-admin-key.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { isAdminApiKey, ADMIN_API_KEY_MIN } = require('../lib/admin-key.js');

const KEY = 'k'.repeat(ADMIN_API_KEY_MIN);

test('金鑰正確時通過', () => {
  assert.equal(isAdminApiKey(KEY, KEY), true);
});

test('金鑰錯誤時拒絕', () => {
  assert.equal(isAdminApiKey('x'.repeat(ADMIN_API_KEY_MIN), KEY), false);
  assert.equal(isAdminApiKey(KEY.slice(0, -1) + 'x', KEY), false);
});

test('長度不同不得丟例外（timingSafeEqual 會對不等長拋錯）', () => {
  assert.equal(isAdminApiKey(KEY + 'extra', KEY), false);
  assert.equal(isAdminApiKey('short', KEY), false);
});

test('未設定金鑰時一律拒絕——空字串不可成為萬用鑰', () => {
  assert.equal(isAdminApiKey('', ''), false);
  assert.equal(isAdminApiKey('anything', ''), false);
  assert.equal(isAdminApiKey('', undefined), false);
});

test('金鑰過短視同未設定', () => {
  const weak = 'a'.repeat(ADMIN_API_KEY_MIN - 1);
  assert.equal(isAdminApiKey(weak, weak), false);
});

test('非字串輸入一律拒絕', () => {
  assert.equal(isAdminApiKey(null, KEY), false);
  assert.equal(isAdminApiKey(undefined, KEY), false);
  assert.equal(isAdminApiKey({}, KEY), false);
});
