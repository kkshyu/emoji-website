'use strict';
const crypto = require('crypto');

const b64 = s => Buffer.from(s).toString('base64url');
const unb64 = s => Buffer.from(s, 'base64url').toString('utf8');
const hmac = (body, secret) =>
  crypto.createHmac('sha256', secret).update(body).digest('base64url');

function signAccessToken(claims, secret, { now = Date.now() / 1000 | 0, ttlSec = 45 } = {}) {
  if (!secret) throw new Error('ACCESS_QR_SECRET required');
  const iat = now;
  const exp = now + ttlSec;
  const body = b64(JSON.stringify({ ...claims, iat, exp }));
  return body + '.' + hmac(body, secret);
}

function verifyAccessToken(token, secret, { now = Date.now() / 1000 | 0 } = {}) {
  if (!token || !secret || token.indexOf('.') < 0) return null;
  const [body, sig] = token.split('.');
  const expected = hmac(body, secret);
  if (sig.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  let p;
  try { p = JSON.parse(unb64(body)); } catch { return null; }
  if (typeof p.exp !== 'number' || now >= p.exp) return null;
  if (!p.sub || !p.ent || !p.plan) return null;
  return p;
}

module.exports = { signAccessToken, verifyAccessToken };
