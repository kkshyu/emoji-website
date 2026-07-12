// scripts/test-entitlements.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  PLAN_DURATION, endsAtAfterActivation,
  autoActivateAt, applyLazyAutoActivate, isEntitlementActive,
  deriveMemberAccess, pickEntitlementForQr,
} = require('../lib/entitlements.js');

const t0 = new Date('2026-07-01T10:00:00.000Z');

test('PLAN_DURATION covers all plans', () => {
  assert.equal(PLAN_DURATION.day_4h.hours, 4);
  assert.equal(PLAN_DURATION.day_12h.hours, 12);
  assert.equal(PLAN_DURATION.month.months, 1);
  assert.equal(PLAN_DURATION.quarter.months, 3);
  assert.equal(PLAN_DURATION.year.months, 12);
  assert.equal(PLAN_DURATION.founding, null);
});

test('endsAtAfterActivation day and month', () => {
  assert.equal(
    endsAtAfterActivation('day_4h', t0).toISOString(),
    '2026-07-01T14:00:00.000Z'
  );
  assert.equal(
    endsAtAfterActivation('month', t0).toISOString(),
    '2026-08-01T10:00:00.000Z'
  );
});

test('autoActivateAt is purchase + 7 days', () => {
  assert.equal(
    autoActivateAt(t0).toISOString(),
    '2026-07-08T10:00:00.000Z'
  );
});

test('applyLazyAutoActivate activates pending after 7 days', () => {
  const e = {
    id: 'en1', plan: 'month', purchased_at: t0,
    activated_at: null, starts_at: null, ends_at: null,
  };
  const now = new Date('2026-07-08T10:00:00.000Z');
  const out = applyLazyAutoActivate(e, now);
  assert.ok(out.changed);
  assert.equal(out.entitlement.activated_at.toISOString(), now.toISOString());
  assert.equal(out.entitlement.starts_at.toISOString(), now.toISOString());
  assert.ok(out.entitlement.ends_at > now);
});

test('applyLazyAutoActivate no-op before 7 days or if already active', () => {
  const e = {
    id: 'en1', plan: 'day_4h', purchased_at: t0,
    activated_at: null, starts_at: null, ends_at: null,
  };
  assert.equal(applyLazyAutoActivate(e, new Date('2026-07-05T10:00:00.000Z')).changed, false);
  const done = { ...e, activated_at: t0, starts_at: t0, ends_at: endsAtAfterActivation('day_4h', t0) };
  assert.equal(applyLazyAutoActivate(done, new Date('2026-07-20T00:00:00.000Z')).changed, false);
});

test('founding active only inside fixed window', () => {
  const e = {
    id: 'f1', plan: 'founding', purchased_at: t0,
    activated_at: t0,
    starts_at: new Date('2026-11-01T00:00:00.000Z'),
    ends_at: new Date('2028-04-30T23:59:59.999Z'),
  };
  assert.equal(isEntitlementActive(e, new Date('2026-12-01T00:00:00.000Z')), true);
  assert.equal(isEntitlementActive(e, new Date('2026-10-01T00:00:00.000Z')), false);
});

test('pending non-founding is not active', () => {
  const e = {
    id: 'p1', plan: 'month', purchased_at: t0,
    activated_at: null, starts_at: null, ends_at: null,
  };
  assert.equal(isEntitlementActive(e, new Date('2026-07-02T00:00:00.000Z')), false);
});

test('deriveMemberAccess union and pending', () => {
  const ents = [
    {
      id: 'a', plan: 'day_4h', purchased_at: t0,
      activated_at: t0, starts_at: t0,
      ends_at: endsAtAfterActivation('day_4h', t0),
    },
    {
      id: 'b', plan: 'month', purchased_at: t0,
      activated_at: null, starts_at: null, ends_at: null,
    },
  ];
  const d = deriveMemberAccess(ents, new Date('2026-07-01T12:00:00.000Z'));
  assert.equal(d.active, true);
  assert.equal(d.pending.length, 1);
  assert.equal(d.activeEntitlements[0].id, 'a');
});

test('pickEntitlementForQr prefers active then pending', () => {
  const pending = {
    id: 'p', plan: 'month', purchased_at: t0,
    activated_at: null, starts_at: null, ends_at: null,
  };
  const active = {
    id: 'a', plan: 'day_4h', purchased_at: t0,
    activated_at: t0, starts_at: t0,
    ends_at: endsAtAfterActivation('day_4h', t0),
  };
  assert.equal(pickEntitlementForQr([pending], new Date('2026-07-02T00:00:00.000Z')).id, 'p');
  assert.equal(pickEntitlementForQr([pending, active], new Date('2026-07-01T12:00:00.000Z')).id, 'a');
  assert.equal(pickEntitlementForQr([], t0), null);
});
