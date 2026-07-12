# 會員 Active 與二三樓 QR 門禁 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 登入即會員；以 `entitlements` 推導 active；會員頁出示短效 QR；門禁地端 JWT 驗簽開門並回報啟用；購後 7 天未啟用自動起算（僅創始為固定窗）。

**Architecture:** 純函式放 `lib/`（可 `node:test`）；`server.js` 負責 schema／API／懶惰自動啟用；會員頁發 QR；`access-mock.html` 模擬地端驗簽＋`POST /api/access/scan`。active 不存死旗標。

**Tech Stack:** Node 18+、Express、Postgres（`pg`）、內建 `crypto` HMAC（與既有 `signToken` 同型）、`node:test`／`assert`。不新增 npm 依賴（不做 `jsonwebtoken` 套件；自實作 base64url＋HMAC，payload 形狀等同 JWT）。

**Spec:** `docs/superpowers/specs/2026-07-12-member-active-access-design.md`

---

## File map

| 檔案 | 職責 |
|------|------|
| `lib/entitlements.js` | 方案長度、`windowFor`、`isEntitlementActive`、`deriveMemberAccess`、`autoActivateAt`、懶惰啟用純邏輯 |
| `lib/access-token.js` | 簽／驗 access QR token（短效） |
| `server.js` | schema `entitlements`／`access_scans`、CRUD、API、創始同步、懶惰啟用 |
| `public/member.html` | 顯示 active／權益／QR（或不可進出原因） |
| `public/admin.html` | 會員表加 active／權益；側欄會員不加人數 badge；mock 入口 |
| `public/access-mock.html` | 貼 token → 地端驗簽模擬 → 呼叫 scan |
| `scripts/test-entitlements.mjs` | entitlements 純邏輯測試 |
| `scripts/test-access-token.mjs` | access token 簽驗測試 |
| `.env.example` | `ACCESS_QR_SECRET`、`ACCESS_DOOR_SECRET` |
| `package.json` | `"test": "node --test scripts/test-*.mjs"` |

## Global constraints

- 工作區：`.tth-worktrees/admin-no-member-badge`（branch `admin-no-member-badge`）。
- 每個 Task 結束一次 commit；不 push，除非使用者要求。
- 不接真人臉／真門鎖硬體；不實作一樓扣點。
- 非創始方案的 Stripe 商品目錄本階段不做；以 `POST /api/admin/entitlements` 發權益＋創始 confirm 同步。未來 Stripe webhook 呼叫同一 `insertEntitlement` 即可。
- 月／季／年長度：自 `activated_at` 起加 **1／3／12 個日曆月**（重用／抽出 `addMonthsISO` 邏輯）。單日：+4h／+12h。
- 時區：一律 **UTC** 存 TIMESTAMPTZ；測試用固定 `Date`。
- `ACCESS_QR_SECRET`：簽 QR；未設則發碼／verify 回 503。`ACCESS_DOOR_SECRET`：掃碼回報 Bearer；未設則 scan 回 503。本地可與 `APP_SECRET` 分開設。

---

### Task 1: Entitlement 純邏輯 + 測試

**Files:**
- Create: `lib/entitlements.js`
- Create: `scripts/test-entitlements.mjs`
- Modify: `package.json`（加 `test` script）

- [ ] **Step 1: 寫失敗測試**

```js
// scripts/test-entitlements.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  PLAN_DURATION, addMonthsISO, endsAtAfterActivation,
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
    endsAtAfterActivation('month', t0).toISOString().slice(0, 10),
    addMonthsISO('2026-07-01', 1)
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
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd /Users/kkshyu/Repos/taiwan-talent-hub/.tth-worktrees/admin-no-member-badge && node --test scripts/test-entitlements.mjs`  
Expected: FAIL（無法 resolve `../lib/entitlements.js`）

- [ ] **Step 3: 實作 `lib/entitlements.js`**

```js
'use strict';

const PLAN_DURATION = {
  day_4h: { hours: 4 },
  day_12h: { hours: 12 },
  month: { months: 1 },
  quarter: { months: 3 },
  year: { months: 12 },
  founding: null,
};

function addMonthsISO(isoDate /* YYYY-MM-DD */, months) {
  const d = new Date(isoDate + 'T00:00:00.000Z');
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  if (d.getUTCDate() < day) d.setUTCDate(0); // clamp month-end
  return d.toISOString().slice(0, 10);
}

function endsAtAfterActivation(plan, activatedAt) {
  const spec = PLAN_DURATION[plan];
  if (!spec) throw new Error('founding has fixed window');
  const start = new Date(activatedAt);
  if (spec.hours) {
    return new Date(start.getTime() + spec.hours * 3600 * 1000);
  }
  const startDay = start.toISOString().slice(0, 10);
  const endDay = addMonthsISO(startDay, spec.months);
  // end exclusive at 00:00 of endDay → use end of previous instant: endDay 00:00 UTC
  return new Date(endDay + 'T00:00:00.000Z');
}

function autoActivateAt(purchasedAt) {
  return new Date(new Date(purchasedAt).getTime() + 7 * 24 * 3600 * 1000);
}

function applyLazyAutoActivate(ent, now = new Date()) {
  if (ent.plan === 'founding') return { changed: false, entitlement: ent };
  if (ent.activated_at) return { changed: false, entitlement: ent };
  const due = autoActivateAt(ent.purchased_at);
  if (now < due) return { changed: false, entitlement: ent };
  const activated_at = new Date(now);
  const starts_at = activated_at;
  const ends_at = endsAtAfterActivation(ent.plan, activated_at);
  return {
    changed: true,
    entitlement: { ...ent, activated_at, starts_at, ends_at },
  };
}

function isEntitlementActive(ent, now = new Date()) {
  if (!ent.activated_at || !ent.starts_at || !ent.ends_at) return false;
  const t = +now;
  return t >= +new Date(ent.starts_at) && t < +new Date(ent.ends_at);
}

function deriveMemberAccess(ents, now = new Date()) {
  const normalized = ents.map(e => applyLazyAutoActivate(e, now).entitlement);
  const activeEntitlements = normalized.filter(e => isEntitlementActive(e, now));
  const pending = normalized.filter(
    e => e.plan !== 'founding' && !e.activated_at
  );
  return {
    active: activeEntitlements.length > 0,
    activeEntitlements,
    pending,
    entitlements: normalized,
    lazyChanges: ents
      .map((e, i) => ({ before: e, after: applyLazyAutoActivate(e, now) }))
      .filter(x => x.after.changed)
      .map(x => x.after.entitlement),
  };
}

function pickEntitlementForQr(ents, now = new Date()) {
  const d = deriveMemberAccess(ents, now);
  if (d.activeEntitlements.length) return d.activeEntitlements[0];
  if (d.pending.length) return d.pending[0];
  return null;
}

module.exports = {
  PLAN_DURATION, addMonthsISO, endsAtAfterActivation,
  autoActivateAt, applyLazyAutoActivate, isEntitlementActive,
  deriveMemberAccess, pickEntitlementForQr,
};
```

- [ ] **Step 4: 跑測試確認通過 + 加 npm script**

`package.json` scripts 加：`"test": "node --test scripts/test-*.mjs"`

Run: `npm test`  
Expected: `test-entitlements` 全過（尚無其他測試檔時亦可）

- [ ] **Step 5: Commit**

```bash
git add lib/entitlements.js scripts/test-entitlements.mjs package.json
git commit -m "$(cat <<'EOF'
feat(access): 新增 entitlement 純邏輯與測試

涵蓋方案長度、7 天懶惰自動啟用、active 推導與 QR 權益挑選。
EOF
)"
```

---

### Task 2: Access token 簽驗 + 測試

**Files:**
- Create: `lib/access-token.js`
- Create: `scripts/test-access-token.mjs`

- [ ] **Step 1: 寫失敗測試**

```js
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

test('rejects expired', () => {
  const token = signAccessToken(base, SECRET, { now: 1_000_000, ttlSec: 60 });
  assert.equal(verifyAccessToken(token, SECRET, { now: 1_000_061 }), null);
});

test('sign throws without secret', () => {
  assert.throws(() => signAccessToken(base, '', { now: 1, ttlSec: 60 }));
});
```

- [ ] **Step 2: 跑測確認失敗**

Run: `node --test scripts/test-access-token.mjs`  
Expected: FAIL

- [ ] **Step 3: 實作 `lib/access-token.js`**

```js
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
```

注意：`now`／`iat`／`exp` 用**秒**（與常見 JWT 一致）。既有 app `signToken` 用毫秒 `Date.now()`——access token **刻意用秒**，勿混用。

- [ ] **Step 4: 跑測通過**

Run: `npm test`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/access-token.js scripts/test-access-token.mjs
git commit -m "$(cat <<'EOF'
feat(access): 新增短效 QR access token 簽驗

地端門禁可共用金鑰驗簽與過期，無需打伺服器即可判定格式有效。
EOF
)"
```

---

### Task 3: DB schema + server 掛載 lib + 懶惰持久化 helper

**Files:**
- Modify: `server.js`（SCHEMA、migrate、require libs、persist helpers）

- [ ] **Step 1: 在 `SCHEMA_SQL` 追加表**

```sql
CREATE TABLE IF NOT EXISTS entitlements (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  source TEXT,
  source_id TEXT,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (source, source_id)
);
CREATE INDEX IF NOT EXISTS entitlements_user_idx ON entitlements(user_id);

CREATE TABLE IF NOT EXISTS access_scans (
  id TEXT PRIMARY KEY,
  entitlement_id TEXT REFERENCES entitlements(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  token_iat INT,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entitlement_id, token_iat)
);
```

`UNIQUE (source, source_id)`：創始用 `('commitment', commitment.id)` 冪等同步。

- [ ] **Step 2: require 與環境變數**（靠近檔案頂部）

```js
const {
  endsAtAfterActivation, deriveMemberAccess, pickEntitlementForQr,
  applyLazyAutoActivate,
} = require('./lib/entitlements');
const { signAccessToken, verifyAccessToken } = require('./lib/access-token');
const ACCESS_QR_SECRET = process.env.ACCESS_QR_SECRET || '';
const ACCESS_DOOR_SECRET = process.env.ACCESS_DOOR_SECRET || '';
if (!ACCESS_QR_SECRET) console.warn('[warn] ACCESS_QR_SECRET 未設定，進出 QR 停用。');
if (!ACCESS_DOOR_SECRET) console.warn('[warn] ACCESS_DOOR_SECRET 未設定，access/scan 停用。');
```

- [ ] **Step 3: 實作 DB helpers**（`server.js` 內）

```js
const SEL_ENT = `id,user_id,plan,source,source_id,
  purchased_at, activated_at, starts_at, ends_at`;

function rowToEnt(r) {
  if (!r) return null;
  return {
    ...r,
    purchased_at: r.purchased_at ? new Date(r.purchased_at) : null,
    activated_at: r.activated_at ? new Date(r.activated_at) : null,
    starts_at: r.starts_at ? new Date(r.starts_at) : null,
    ends_at: r.ends_at ? new Date(r.ends_at) : null,
  };
}

async function loadEntitlements(userId) {
  const rows = (await q(
    `SELECT ${SEL_ENT} FROM entitlements WHERE user_id=$1 ORDER BY purchased_at`,
    [userId]
  )).rows.map(rowToEnt);
  return rows;
}

async function persistLazyActivations(ents, now = new Date()) {
  const out = [];
  for (const e of ents) {
    const { changed, entitlement } = applyLazyAutoActivate(e, now);
    if (!changed) { out.push(e); continue; }
    const r = await q(
      `UPDATE entitlements SET activated_at=$2, starts_at=$3, ends_at=$4
       WHERE id=$1 AND activated_at IS NULL
       RETURNING ${SEL_ENT}`,
      [e.id, entitlement.activated_at, entitlement.starts_at, entitlement.ends_at]
    );
    out.push(r.rows[0] ? rowToEnt(r.rows[0]) : (await loadEntitlements(e.user_id)).find(x => x.id === e.id) || entitlement);
  }
  return out;
}

async function memberAccessFor(userId, now = new Date()) {
  let ents = await loadEntitlements(userId);
  ents = await persistLazyActivations(ents, now);
  return deriveMemberAccess(ents, now);
}

async function ensureFoundingEntitlement(commitment) {
  // commitment: { id, user_id, start_date, maturity_date, payment_status, membership_status }
  if (commitment.payment_status !== '已付款') return null;
  const starts = new Date(String(commitment.start_date).replace(/\//g, '-') + 'T00:00:00.000Z');
  const endDay = String(commitment.maturity_date).replace(/\//g, '-');
  const ends = new Date(endDay + 'T00:00:00.000Z'); // maturity 當日 00:00 為 exclusive end；若 maturity 是最後一天，改為次日 00:00
  // 既有 maturity_date 為會籍末日：ends = maturity + 1 day 00:00 UTC
  const endsExclusive = new Date(ends.getTime() + 24 * 3600 * 1000);
  const id = uid('en_');
  await q(
    `INSERT INTO entitlements
      (id,user_id,plan,source,source_id,purchased_at,activated_at,starts_at,ends_at)
     VALUES ($1,$2,'founding','commitment',$3,now(),$4,$4,$5)
     ON CONFLICT (source, source_id) DO UPDATE SET
       starts_at=EXCLUDED.starts_at, ends_at=EXCLUDED.ends_at,
       activated_at=COALESCE(entitlements.activated_at, EXCLUDED.activated_at)
     RETURNING ${SEL_ENT}`,
    [id, commitment.user_id, commitment.id, starts, endsExclusive]
  );
}
```

將 `maturity` 末日語意寫進註解：`ends_at` = 末日次日 00:00 UTC（半開區間 `[starts, ends)`）。

- [ ] **Step 4: 手動煙測 schema**（有 DB 時）

Run: `node -e "require('dotenv')" 2>/dev/null; node --env-file=../.env -e "
const {Pool}=require('pg');
(async()=>{
  /* 或直接重啟 server 看 migrate 無錯 */
  console.log('skip if no db');
})()" `

實務：重啟 `npm run dev`，確認 log 無 migrate error。

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "$(cat <<'EOF'
feat(access): entitlements／access_scans schema 與懶惰啟用持久化

掛載純邏輯 lib，並提供創始 entitlement 冪等同步 helper。
EOF
)"
```

---

### Task 4: 創始 confirm 同步 + admin 建立權益 API + `/api/state` 帶 access

**Files:**
- Modify: `server.js`
- Modify: `.env.example`（若存在；否則 `zeabur.env.example`）

- [ ] **Step 1: 改 `POST /api/admin/commitments/:id/confirm`**

在更新 commitment 成功後：

```js
const c = (await q(`SELECT ${SEL_C} FROM commitments WHERE id=$1`, [req.params.id])).rows[0];
await ensureFoundingEntitlement(c);
```

- [ ] **Step 2: 新增 admin 發權益**

```js
const FLOOR_PLANS = ['day_4h', 'day_12h', 'month', 'quarter', 'year'];

app.post('/api/admin/entitlements', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const userId = (req.body.user_id || '').trim();
  const plan = req.body.plan;
  if (!userId || !FLOOR_PLANS.includes(plan))
    return res.status(400).json({ error: '需要 user_id 與合法 plan（day_4h／day_12h／month／quarter／year）。' });
  const u = (await q(`SELECT id FROM users WHERE id=$1`, [userId])).rows[0];
  if (!u) return res.status(404).json({ error: '找不到使用者。' });
  const id = uid('en_');
  const sourceId = req.body.source_id || id;
  await q(
    `INSERT INTO entitlements (id,user_id,plan,source,source_id,purchased_at)
     VALUES ($1,$2,$3,'admin',$4,now())`,
    [id, userId, plan, sourceId]
  );
  const row = rowToEnt((await q(`SELECT ${SEL_ENT} FROM entitlements WHERE id=$1`, [id])).rows[0]);
  res.json({ entitlement: row });
}));
```

- [ ] **Step 3: 擴充 `/api/state`**

對 admin 與一般會員皆附加：

```js
// 會員自己：
const access = await memberAccessFor(me.id);
// 回傳
{ ..., access: {
    active: access.active,
    entitlements: access.entitlements,
    pending: access.pending,
    activeEntitlements: access.activeEntitlements,
  }
}

// admin：每位 user 可在列表用
const allEnts = (await q(`SELECT ${SEL_ENT} FROM entitlements`)).rows.map(rowToEnt);
// 依 user 分組後 derive；或回傳 entitlements 陣列讓前端 derived
```

為減少重寫，admin 回傳頂層 `entitlements: allEnts`（全站），前端 `derived` 依 user 聚合。會員只回自己的 `access`。

遷移既有已付款創始（migrate 結尾）：

```js
const paid = (await q(
  `SELECT ${SEL_C} FROM commitments WHERE payment_status='已付款'`
)).rows;
for (const c of paid) await ensureFoundingEntitlement(c);
```

- [ ] **Step 4: 環境變數範例**

在 `.env.example` 或 `zeabur.env.example` 加：

```
ACCESS_QR_SECRET=
ACCESS_DOOR_SECRET=
```

- [ ] **Step 5: Commit**

```bash
git add server.js zeabur.env.example .env.example 2>/dev/null
git commit -m "$(cat <<'EOF'
feat(access): 創始同步、後台發權益、state 回傳 access

已付款創始會籍冪等寫入 founding entitlement；非創始可由管理員建立待啟用權益。
EOF
)"
```

---

### Task 5: `GET /api/me/access-qr` + `POST /api/access/verify` + `POST /api/access/scan`

**Files:**
- Modify: `server.js`

- [ ] **Step 1: 發碼 API**

```js
app.get('/api/me/access-qr', auth, requireDb, wrap(async (req, res) => {
  if (!ACCESS_QR_SECRET) return res.status(503).json({ error: '進出 QR 尚未開通（未設定 ACCESS_QR_SECRET）。' });
  if (!req.auth.sub) return res.status(403).json({ error: '請以會員身分登入。' });
  const now = new Date();
  let ents = await persistLazyActivations(await loadEntitlements(req.auth.sub), now);
  const pick = pickEntitlementForQr(ents, now);
  if (!pick) return res.status(403).json({ error: '目前無法進出二三樓（無有效或待啟用權益）。', code: 'NO_ENTITLEMENT' });
  const pending = !pick.activated_at;
  const token = signAccessToken({
    sub: req.auth.sub,
    ent: pick.id,
    plan: pick.plan,
    floors: ['2', '3'],
    pending_activation: pending,
  }, ACCESS_QR_SECRET, { ttlSec: 45 });
  const payload = verifyAccessToken(token, ACCESS_QR_SECRET); // 取 exp
  res.json({
    token,
    exp: payload.exp,
    pending_activation: pending,
    plan: pick.plan,
    entitlement_id: pick.id,
  });
}));
```

- [ ] **Step 2: verify（mock／除錯）**

```js
app.post('/api/access/verify', wrap(async (req, res) => {
  if (!ACCESS_QR_SECRET) return res.status(503).json({ error: '未設定 ACCESS_QR_SECRET。' });
  const token = String((req.body && req.body.token) || '');
  const p = verifyAccessToken(token, ACCESS_QR_SECRET);
  if (!p) return res.status(401).json({ ok: false, error: '無效或過期的 QR。' });
  res.json({ ok: true, claims: p });
}));
```

- [ ] **Step 3: scan（門禁回報）**

```js
function doorAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!ACCESS_DOOR_SECRET || t !== ACCESS_DOOR_SECRET)
    return res.status(401).json({ error: '門禁憑證無效。' });
  next();
}

app.post('/api/access/scan', doorAuth, requireDb, wrap(async (req, res) => {
  if (!ACCESS_QR_SECRET) return res.status(503).json({ error: '未設定 ACCESS_QR_SECRET。' });
  const token = String((req.body && req.body.token) || '');
  const p = verifyAccessToken(token, ACCESS_QR_SECRET);
  if (!p) return res.status(401).json({ ok: false, error: '無效或過期的 QR。' });

  const ent = rowToEnt((await q(`SELECT ${SEL_ENT} FROM entitlements WHERE id=$1`, [p.ent])).rows[0]);
  if (!ent || ent.user_id !== p.sub)
    return res.status(400).json({ ok: false, error: '權益不符。' });

  const now = new Date();
  // 冪等：同一 token_iat + entitlement 只記一次
  const scanId = uid('as_');
  const ins = await q(
    `INSERT INTO access_scans (id,entitlement_id,user_id,token_iat,scanned_at)
     VALUES ($1,$2,$3,$4,now())
     ON CONFLICT (entitlement_id, token_iat) DO NOTHING
     RETURNING id`,
    [scanId, ent.id, ent.user_id, p.iat]
  );

  let activated = false;
  if (!ent.activated_at && ent.plan !== 'founding') {
    const ends = endsAtAfterActivation(ent.plan, now);
    const upd = await q(
      `UPDATE entitlements SET activated_at=$2, starts_at=$2, ends_at=$3
       WHERE id=$1 AND activated_at IS NULL
       RETURNING ${SEL_ENT}`,
      [ent.id, now, ends]
    );
    activated = !!upd.rows[0];
  }

  res.json({
    ok: true,
    door: 'open',
    activated,
    duplicate: !ins.rows[0],
    access: await memberAccessFor(ent.user_id, now),
  });
}));
```

- [ ] **Step 4: 手動 curl 煙測**（server 跑著、secret 已設）

```bash
# 先用 admin 發 month 權益給某 user，會員 token 取 QR，再：
curl -s -X POST localhost:8080/api/access/verify -H 'content-type: application/json' -d '{"token":"..."}'
curl -s -X POST localhost:8080/api/access/scan \
  -H "authorization: Bearer $ACCESS_DOOR_SECRET" \
  -H 'content-type: application/json' -d '{"token":"..."}'
```

Expected: verify `ok:true`；scan `door:open`，首次 `activated:true`，重送同 token `duplicate:true` 且不重設 `activated_at`。

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "$(cat <<'EOF'
feat(access): 發碼、地端驗簽與掃碼啟用 API

會員可取短效 QR；門禁驗簽後回報 scan，待啟用權益首次掃碼起算方案期間。
EOF
)"
```

---

### Task 6: 會員頁 QR UI

**Files:**
- Modify: `public/member.html`

- [ ] **Step 1: 在 `renderMember` 加入進出區塊**

在歡迎區塊後插入（保留創始 badge）：

- 顯示 `data.access.active ? 'Active（可進出二三樓）' : '非 Active'`
- 列出 `activeEntitlements`／`pending` 摘要（plan + 起迄或「待首次進場啟用」）
- 若可發碼：`<div id="m-qr">` 放 QR（用 API 回傳的 `token` 字串；以第三方 CDN 或簡易自繪皆可）

QR 繪製（免新依賴）：使用已存在於網頁的做法——`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=` + encodeURIComponent(token)，或 SVG 小庫。為免外連依賴不穩，優先：

```html
<img id="m-qr-img" alt="進出 QR" width="200" height="200">
<p class="m-note" id="m-qr-meta"></p>
```

```js
async function refreshQr() {
  const r = await fetch(FELLOW + '/api/me/access-qr', { headers: { authorization: 'Bearer ' + token } });
  const d = await r.json().catch(() => ({}));
  const img = document.getElementById('m-qr-img');
  const meta = document.getElementById('m-qr-meta');
  if (!r.ok) {
    if (img) img.style.display = 'none';
    if (meta) meta.textContent = d.error || '目前無法產生進出 QR';
    return;
  }
  // 使用 Google Charts 已淘汰；改 inline：把 token 當文字也可先顯示供 mock 貼上
  img.style.display = '';
  img.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js'; // 勿用此當 img
}
```

**改為可靠做法：** 在 `public/vendor/qrcode-mini.js` 不強制。最小可用：

1. 顯示 `<code id="m-qr-token">` 供 mock 複製；  
2. 同時用 `https://quickchart.io/qr?text=` + encodeURIComponent(token) + `&size=200` 當 `<img src>`（僅展示；真機掃的是 token 字串內容）。

若不想依賴外網圖：只顯示 token 文字 +「請用 mock 頁測試」——**本 Task 採 quickchart img + 明文 token 備份**。

每 30 秒 `refreshQr()`；頁面 `visibilitychange` 時立即刷新。

`/api/state` 回應需含 `access`；若缺則當非 active。

- [ ] **Step 2: 瀏覽器手動確認**

登入會員頁 → 無權益顯示原因；admin 發 `day_4h` 後重整 → 出現 QR／token → 倒數內自動刷新。

- [ ] **Step 3: Commit**

```bash
git add public/member.html
git commit -m "$(cat <<'EOF'
feat(member): 會員頁顯示 active 狀態與進出 QR

短效 token 自動刷新；無權益時說明不可進出二三樓。
EOF
)"
```

---

### Task 7: Mock 門禁頁 + 後台會員欄位

**Files:**
- Create: `public/access-mock.html`
- Modify: `public/admin.html`

- [ ] **Step 1: 建立 mock 頁**

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<title>門禁 Mock · 言文字</title>
<link rel="stylesheet" href="/style.css">
</head>
<body style="max-width:560px;margin:40px auto;padding:24px;font-family:var(--sans)">
  <h1>門禁 Mock</h1>
  <p>貼上會員 QR token → 地端驗簽 → 開門並回報 scan。</p>
  <label>ACCESS_DOOR_SECRET<input id="door" type="password" style="width:100%"></label>
  <label>Token<textarea id="tok" rows="4" style="width:100%"></textarea></label>
  <button class="btn btn--solid" id="go">驗簽並開門</button>
  <pre id="out"></pre>
<script>
document.getElementById('go').onclick = async () => {
  const token = document.getElementById('tok').value.trim();
  const door = document.getElementById('door').value;
  const out = document.getElementById('out');
  const v = await fetch('/api/access/verify', {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ token })
  }).then(r=>r.json());
  if (!v.ok) { out.textContent = JSON.stringify(v,null,2); return; }
  const s = await fetch('/api/access/scan', {
    method:'POST',
    headers:{'content-type':'application/json', authorization:'Bearer '+door},
    body: JSON.stringify({ token })
  }).then(r=>r.json());
  out.textContent = JSON.stringify({ verify:v, scan:s },null,2);
};
</script>
</body>
</html>
```

- [ ] **Step 2: 改 `tabMembers`**

欄位：姓名、Email、電話、**Active**、**權益摘要**、創始狀態／編號、加入日。

```js
function entSummary(u, ents) {
  const mine = (ents||[]).filter(e => e.user_id === u.id);
  const d = /* 若後端已推導可改讀；否則前端簡單顯示 */
  mine.map(e => e.plan + (e.activated_at ? '' : '（待啟用）')).join('、') || '—';
}
```

後端 admin `state` 已回 `entitlements` 時：

```js
function tabMembers(d, x){
  const ents = d.entitlements || [];
  // 對每個 user 算 active：有任一 ends_at>now && activated
  ...
}
```

簡易前端 active（與 server 對齊不夠完美但可讀）：以 `ends_at`／`activated_at` ISO 字串比較 `Date.now()`。更好：Task 4 admin state 直接帶 `users` 上附 `access: { active, summary }`——**若 Task 4 未附，本 Task 在 server 補**：

```js
// admin state 建構 users 時
for (const u of users) {
  const a = await memberAccessFor(u.id); // N+1；會員量小可接受
  u.access_active = a.active;
  u.access_summary = [
    ...a.activeEntitlements.map(e => e.plan),
    ...a.pending.map(e => e.plan + '(待啟用)'),
  ].join('、') || '—';
}
```

側欄 badge：**僅 events**，確認無 members 數量（若分支上已改則跳過）。

後台 hint 加連結：`/access-mock`。

- [ ] **Step 3: 端到端手動驗收清單**

1. 新 Google 登入 → 會員、非 active、無 QR。  
2. Admin 發 `month` → 會員有待啟用 QR → mock 開門 → active、期間正確。  
3. 同 token 再 scan → duplicate，`activated_at` 不變。  
4. 確認創始入帳 → founding 窗內 active。  
5. 側欄會員無數字 badge。

- [ ] **Step 4: Commit**

```bash
git add public/access-mock.html public/admin.html server.js
git commit -m "$(cat <<'EOF'
feat(access): mock 門禁頁與後台會員 active 欄位

方便地端驗簽與掃碼啟用的手動驗證；後台可見通行權益摘要。
EOF
)"
```

---

### Task 8: 回歸測試與文件勾稽

**Files:**
- Modify: `scripts/test-entitlements.mjs`（若實作時發現邊界需補）
- 可選：`docs/superpowers/specs/2026-07-12-member-active-access-design.md` 加一行「Plan: `docs/superpowers/plans/2026-07-12-member-active-access.md`」

- [ ] **Step 1: 跑全測**

Run: `npm test`  
Expected: 全部 PASS

- [ ] **Step 2: Spec 對照勾選**

| Spec 要求 | Task |
|-----------|------|
| 登入即會員 | 既有 OAuth（不變） |
| active 推導 | 1, 3, 4 |
| 僅創始固定窗 | 1, 3, 4 |
| 其餘首次進場／7 天自動 | 1, 3, 5 |
| QR 地端驗簽 | 2, 5, 6, 7 |
| scan 回報啟用 | 5, 7 |
| 後台顯示 | 7 |
| 無會員人數 badge | 7 |
| mock | 7 |

- [ ] **Step 3: Commit（若有文件交叉連結）**

```bash
git add docs/superpowers/specs/2026-07-12-member-active-access-design.md
git commit -m "docs(access): spec 連結實作計畫"
```

---

## Self-review (plan author)

1. **Spec coverage:** 上表已覆蓋；非目標（人臉、硬體、一樓扣點、Stripe 非創始目錄）未排入 Task。  
2. **Placeholders:** 無 TBD；QR 圖採 quickchart＋明文 token 雙軌，可離線用 mock。  
3. **Types:** `plan` 字串集合與 `FLOOR_PLANS`／`PLAN_DURATION` 一致；token 用秒級 `iat`／`exp`。  
4. **Risk:** admin state N+1 `memberAccessFor` 會員量大時再改批量；本階段可接受。

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-12-member-active-access.md`. Two execution options:

**1. Subagent-Driven (recommended)** — 每個 Task 派一個新 subagent，Task 間做審查，迭代快  

**2. Inline Execution** — 本對話用 executing-plans 連續做，並設檢查點  

Which approach?
