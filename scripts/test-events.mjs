import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { eventSlug, normalizeEventInput } = require('../lib/events.js');

test('event slug keeps unicode letters and removes unsafe separators', () => {
  assert.equal(eventSlug('  九月・交流 Night!  '), '九月-交流-night');
});

test('event input accepts a private paid event', () => {
  const { value, error } = normalizeEventInput({
    title: 'Demo', visibility: 'private', price_twd: '800', capacity: '20',
    starts_at: '2026-09-20T18:00:00+08:00', ends_at: '2026-09-20T20:00:00+08:00',
  });
  assert.equal(error, undefined);
  assert.equal(value.visibility, 'private');
  assert.equal(value.priceTwd, 800);
  assert.equal(value.capacity, 20);
});

test('datetime-local is interpreted as Taiwan time', () => {
  const { value } = normalizeEventInput({ title: 'Demo', starts_at: '2026-10-20T19:00' });
  assert.equal(value.startsAt.toISOString(), '2026-10-20T11:00:00.000Z');
  assert.match(fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8'), /starts_at AT TIME ZONE 'Asia\/Taipei'/);
});

test('event input rejects inverted dates and fractional prices', () => {
  assert.match(normalizeEventInput({
    title: 'Demo', starts_at: '2026-09-20T20:00:00+08:00', ends_at: '2026-09-20T18:00:00+08:00',
  }).error, /結束時間/);
  assert.match(normalizeEventInput({ title: 'Demo', price_twd: 1.5 }).error, /票價/);
});
