// scripts/test-member-ui.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  EXPIRING_WITHIN_DAYS,
  pickNextEvent,
  expiringPointsSummary,
  membershipStatusTitle,
} = require('../lib/member-ui.js');

const now = new Date('2026-07-12T12:00:00.000Z');

test('EXPIRING_WITHIN_DAYS is 30', () => {
  assert.equal(EXPIRING_WITHIN_DAYS, 30);
});

test('pickNextEvent prefers soonest registered future event', () => {
  const events = [
    { id: '1', title: 'A', starts_at: '2026-07-20T00:00:00.000Z', registered: false },
    { id: '2', title: 'B', starts_at: '2026-07-18T00:00:00.000Z', registered: true },
    { id: '3', title: 'C', starts_at: '2026-07-15T00:00:00.000Z', registered: false },
  ];
  assert.equal(pickNextEvent(events, now).id, '2');
});

test('pickNextEvent falls back to soonest upcoming if none registered', () => {
  const events = [
    { id: '1', title: 'A', starts_at: '2026-07-20T00:00:00.000Z', registered: false },
    { id: '3', title: 'C', starts_at: '2026-07-15T00:00:00.000Z', registered: false },
  ];
  assert.equal(pickNextEvent(events, now).id, '3');
});

test('pickNextEvent returns null when empty or all past', () => {
  assert.equal(pickNextEvent([], now), null);
  assert.equal(pickNextEvent([
    { id: '1', starts_at: '2026-07-01T00:00:00.000Z', registered: true },
  ], now), null);
});

test('expiringPointsSummary sums remaining within 30d and picks earliest date', () => {
  const lots = [
    { remaining: 10, expires_at: '2026-07-20T00:00:00.000Z', available: true },
    { remaining: 20, expires_at: '2026-07-25T00:00:00.000Z', available: true },
    { remaining: 50, expires_at: null, available: true },
    { remaining: 5, expires_at: '2026-09-01T00:00:00.000Z', available: true },
    { remaining: 99, expires_at: '2026-07-13T00:00:00.000Z', available: false },
  ];
  const s = expiringPointsSummary(lots, now);
  assert.equal(s.points, 30);
  assert.equal(new Date(s.soonest).toISOString(), '2026-07-20T00:00:00.000Z');
});

test('expiringPointsSummary returns null when none', () => {
  assert.equal(expiringPointsSummary([
    { remaining: 10, expires_at: null, available: true },
  ], now), null);
});

test('membershipStatusTitle covers main states', () => {
  const T = {
    statusActive: (plan) => `${plan}進行中`,
    statusPending: '待首次進場啟用',
    statusExpired: '會籍已到期',
    statusNone: '尚未有會籍',
  };
  assert.match(membershipStatusTitle({
    active: true, planLabel: '月票', pending: false, hadEntitlement: true,
  }, T), /月票進行中/);
  assert.equal(membershipStatusTitle({
    active: false, planLabel: '', pending: true, hadEntitlement: true,
  }, T), '待首次進場啟用');
  assert.equal(membershipStatusTitle({
    active: false, planLabel: '', pending: false, hadEntitlement: true,
  }, T), '會籍已到期');
  assert.equal(membershipStatusTitle({
    active: false, planLabel: '', pending: false, hadEntitlement: false,
  }, T), '尚未有會籍');
});
