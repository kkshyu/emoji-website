// lib/member-ui.js
'use strict';

const EXPIRING_WITHIN_DAYS = 30;

function parseTime(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(+d) ? null : d;
}

function pickNextEvent(events, now = new Date()) {
  const list = Array.isArray(events) ? events : [];
  const upcoming = list
    .map((e) => ({ e, t: parseTime(e.starts_at) }))
    .filter((x) => x.t && x.t > now)
    .sort((a, b) => a.t - b.t);
  const registered = upcoming.find((x) => x.e.registered);
  if (registered) return registered.e;
  return upcoming.length ? upcoming[0].e : null;
}

function expiringPointsSummary(lots, now = new Date(), withinDays = EXPIRING_WITHIN_DAYS) {
  const horizon = new Date(+now + withinDays * 86400000);
  const hits = (Array.isArray(lots) ? lots : [])
    .filter((l) => l && l.available !== false)
    .map((l) => ({ rem: Number(l.remaining) || 0, exp: parseTime(l.expires_at) }))
    .filter((x) => x.rem > 0 && x.exp && x.exp > now && x.exp <= horizon);
  if (!hits.length) return null;
  const points = hits.reduce((s, x) => s + x.rem, 0);
  const soonest = hits.map((x) => x.exp).sort((a, b) => a - b)[0];
  return { points, soonest: soonest.toISOString() };
}

/** @param {{ active: boolean, planLabel: string, pending: boolean, hadEntitlement: boolean }} s */
function membershipStatusTitle(s, T) {
  if (s.active) return T.statusActive(s.planLabel || T.plansFallback || '');
  if (s.pending) return T.statusPending;
  if (s.hadEntitlement) return T.statusExpired;
  return T.statusNone;
}

module.exports = {
  EXPIRING_WITHIN_DAYS,
  pickNextEvent,
  expiringPointsSummary,
  membershipStatusTitle,
};
