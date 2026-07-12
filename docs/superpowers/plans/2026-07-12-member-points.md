# 會員點數 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 實作封閉式點數：購點方案（本金無效期＋加贈 1 年）、會籍／後台贈點、active 兌換淋浴／膠囊／娛樂室、未用本金可退且作廢該單加贈；扣點效期近先用。

**Architecture:** 純函式放 `lib/points.js`（目錄、效期、跨 lot 扣點／退款規劃）；`server.js` 負責 schema、交易、API、串會籍 confirm／Stripe；會員頁與後台顯示餘額與操作。不引入新 npm 依賴。本階段不做 `users.points_balance` 快取（餘額一律由 lots 加總）。

**Tech Stack:** Node 18+、Express、Postgres（`pg`）、既有 Stripe、`node:test`／`assert`。

**Spec:** `docs/superpowers/specs/2026-07-12-member-points-design.md`  
**依賴：** `docs/superpowers/specs/2026-07-12-member-active-access-design.md`（`memberAccessFor`／active）

---

## File map

| 檔案 | 職責 |
|------|------|
| `lib/points.js` | 方案表、會籍贈點表、兌換價目、`addYears`、lot 排序、`planDebit`、`planRefund`、`availableBalance` |
| `scripts/test-points.mjs` | 上述純邏輯測試 |
| `server.js` | schema、入帳／扣點／退款交易、API、會籍贈點掛點、Stripe 購點 |
| `public/member.html` | 餘額、購點、兌換、退款入口 |
| `public/admin.html` | 發點、會員點數摘要、流水／退款輔助 |
| `.env.example` | 若新增變數則補（本階段可沿用既有 Stripe） |

## Global constraints

- 工作目錄：`taiwan-talent-hub-website`（建議 branch `member-points`）。
- 每個 Task 結束一次 commit；不 push，除非使用者要求。
- 包場不走點數；點數不可轉讓；已購時數預設不自動退點。
- 時區：TIMESTAMPTZ／ISO UTC；測試用固定 `Date`。
- 兌換須 `memberAccessFor(userId).active === true`。
- id 沿用既有 `uid('pl_')`／`uid('po_')` 等前綴風格（若專案有 `uid` helper）。

---

### Task 1: 目錄常數與餘額／效期純邏輯

**Files:**
- Create: `lib/points.js`
- Create: `scripts/test-points.mjs`

- [ ] **Step 1: 寫失敗測試**

```js
// scripts/test-points.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  POINT_PRICE_TWD, PACKS, MEMBERSHIP_GIFT_POINTS, REDEEM_PRICES,
  addYears, isLotAvailable, availableBalance, sortLotsForDebit,
} = require('../lib/points.js');

const t0 = new Date('2026-07-12T00:00:00.000Z');

test('packs and gifts match spec', () => {
  assert.equal(POINT_PRICE_TWD, 10);
  assert.deepEqual(PACKS.mid, { principal: 100, bonus: 10, pay_twd: 1000 });
  assert.equal(MEMBERSHIP_GIFT_POINTS.month, 100);
  assert.equal(MEMBERSHIP_GIFT_POINTS.founding, 2000);
  assert.equal(MEMBERSHIP_GIFT_POINTS.day_4h, 0);
  assert.equal(REDEEM_PRICES.shower, 7);
  assert.equal(REDEEM_PRICES.capsule_per_hour, 10);
  assert.equal(REDEEM_PRICES.entertainment_per_hour, 10);
});

test('addYears is +1 calendar year UTC', () => {
  assert.equal(addYears(t0, 1).toISOString(), '2027-07-12T00:00:00.000Z');
});

test('availableBalance ignores expired and zero remaining', () => {
  const lots = [
    { id: 'a', remaining: 50, expires_at: null },
    { id: 'b', remaining: 10, expires_at: new Date('2026-01-01T00:00:00.000Z') },
    { id: 'c', remaining: 5, expires_at: new Date('2027-01-01T00:00:00.000Z') },
  ];
  assert.equal(availableBalance(lots, t0), 55);
  assert.equal(isLotAvailable(lots[1], t0), false);
});

test('sortLotsForDebit nearest expiry first, null last', () => {
  const lots = [
    { id: 'p', remaining: 10, expires_at: null, created_at: t0 },
    { id: 'g2', remaining: 10, expires_at: new Date('2027-12-01T00:00:00.000Z'), created_at: t0 },
    { id: 'g1', remaining: 10, expires_at: new Date('2027-01-01T00:00:00.000Z'), created_at: t0 },
  ];
  assert.deepEqual(sortLotsForDebit(lots).map(l => l.id), ['g1', 'g2', 'p']);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test scripts/test-points.mjs`  
Expected: FAIL（模組不存在）

- [ ] **Step 3: 實作 `lib/points.js`（本 Task 匯出範圍）**

```js
'use strict';

const POINT_PRICE_TWD = 10;

const PACKS = {
  small: { id: 'small', principal: 50, bonus: 0, pay_twd: 500 },
  mid: { id: 'mid', principal: 100, bonus: 10, pay_twd: 1000 },
  large: { id: 'large', principal: 300, bonus: 45, pay_twd: 3000 },
  xl: { id: 'xl', principal: 500, bonus: 100, pay_twd: 5000 },
};

const MEMBERSHIP_GIFT_POINTS = {
  day_4h: 0, day_12h: 0,
  month: 100, quarter: 300, year: 1000, founding: 2000,
};

const REDEEM_PRICES = {
  shower: 7,
  capsule_per_hour: 10,
  entertainment_per_hour: 10,
};

function addYears(date, years) {
  const d = new Date(date);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d;
}

function isLotAvailable(lot, now = new Date()) {
  if (!lot.remaining || lot.remaining <= 0) return false;
  if (lot.expires_at == null) return true;
  return new Date(lot.expires_at) > now;
}

function availableBalance(lots, now = new Date()) {
  return lots.reduce((s, l) => s + (isLotAvailable(l, now) ? l.remaining : 0), 0);
}

function sortLotsForDebit(lots) {
  return [...lots].sort((a, b) => {
    const ae = a.expires_at == null ? Infinity : +new Date(a.expires_at);
    const be = b.expires_at == null ? Infinity : +new Date(b.expires_at);
    if (ae !== be) return ae - be;
    return +new Date(a.created_at) - +new Date(b.created_at);
  });
}

module.exports = {
  POINT_PRICE_TWD, PACKS, MEMBERSHIP_GIFT_POINTS, REDEEM_PRICES,
  addYears, isLotAvailable, availableBalance, sortLotsForDebit,
};
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test scripts/test-points.mjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/points.js scripts/test-points.mjs
git commit -m "$(cat <<'EOF'
feat(points): add packs catalog and lot availability helpers

EOF
)"
```

---

### Task 2: planDebit 與 planRefund

**Files:**
- Modify: `lib/points.js`
- Modify: `scripts/test-points.mjs`

- [ ] **Step 1: 追加失敗測試**

```js
const { planDebit, planRefund, redeemPointsFor } = require('../lib/points.js');

test('redeemPointsFor maps services', () => {
  assert.equal(redeemPointsFor('shower', 1), 7);
  assert.equal(redeemPointsFor('capsule', 2), 20);
  assert.equal(redeemPointsFor('entertainment', 1), 10);
  assert.throws(() => redeemPointsFor('venue', 1));
});

test('planDebit spends nearest expiry first', () => {
  const lots = [
    { id: 'p', type: 'purchase', remaining: 100, expires_at: null, created_at: t0 },
    { id: 'g', type: 'bonus', remaining: 10, expires_at: new Date('2027-01-01T00:00:00.000Z'), created_at: t0 },
  ];
  const plan = planDebit(lots, 15, t0);
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.allocations, [
    { lot_id: 'g', amount: 10 },
    { lot_id: 'p', amount: 5 },
  ]);
});

test('planDebit fails when insufficient', () => {
  const lots = [{ id: 'p', remaining: 3, expires_at: null, created_at: t0 }];
  assert.equal(planDebit(lots, 7, t0).ok, false);
});

test('planRefund voids all remaining bonus on that order', () => {
  const lots = [
    { id: 'p1', type: 'purchase', source_id: 'ord1', remaining: 60, expires_at: null },
    { id: 'b1', type: 'bonus', source_id: 'ord1', remaining: 8, expires_at: new Date('2027-07-01T00:00:00.000Z') },
    { id: 'g', type: 'membership_gift', source_id: 'c1', remaining: 100, expires_at: new Date('2027-07-01T00:00:00.000Z') },
  ];
  const r = planRefund(lots, 'ord1', 30);
  assert.equal(r.ok, true);
  assert.deepEqual(r.debit_principal, [{ lot_id: 'p1', amount: 30 }]);
  assert.deepEqual(r.void_bonus, [{ lot_id: 'b1', amount: 8 }]);
  assert.equal(r.refund_twd, 300);
  assert.equal(r.ok === false || !r.void_bonus.find(x => x.lot_id === 'g'), true);
});

test('planRefund rejects over principal remaining', () => {
  const lots = [
    { id: 'p1', type: 'purchase', source_id: 'ord1', remaining: 10, expires_at: null },
  ];
  assert.equal(planRefund(lots, 'ord1', 11).ok, false);
});
```

- [ ] **Step 2: 跑測試確認新案失敗**

Run: `node --test scripts/test-points.mjs`  
Expected: FAIL（`planDebit` 等未定義）

- [ ] **Step 3: 實作並匯出**

```js
function redeemPointsFor(service, hoursOrQty) {
  if (service === 'shower') return REDEEM_PRICES.shower * (hoursOrQty || 1);
  if (service === 'capsule') {
    if (!Number.isInteger(hoursOrQty) || hoursOrQty < 1) throw new Error('hours required');
    return REDEEM_PRICES.capsule_per_hour * hoursOrQty;
  }
  if (service === 'entertainment') {
    if (!Number.isInteger(hoursOrQty) || hoursOrQty < 1) throw new Error('hours required');
    return REDEEM_PRICES.entertainment_per_hour * hoursOrQty;
  }
  throw new Error('unsupported service');
}

function planDebit(lots, points, now = new Date()) {
  if (!Number.isInteger(points) || points < 1) return { ok: false, error: 'invalid_points' };
  let need = points;
  const allocations = [];
  for (const lot of sortLotsForDebit(lots)) {
    if (!isLotAvailable(lot, now) || need <= 0) continue;
    const take = Math.min(lot.remaining, need);
    if (take > 0) {
      allocations.push({ lot_id: lot.id, amount: take });
      need -= take;
    }
  }
  if (need > 0) return { ok: false, error: 'insufficient' };
  return { ok: true, allocations };
}

function planRefund(lots, orderId, principalPoints) {
  if (!Number.isInteger(principalPoints) || principalPoints < 1) {
    return { ok: false, error: 'invalid_points' };
  }
  const purchaseLots = lots.filter(l => l.type === 'purchase' && l.source_id === orderId && l.remaining > 0);
  const avail = purchaseLots.reduce((s, l) => s + l.remaining, 0);
  if (principalPoints > avail) return { ok: false, error: 'exceeds_principal' };

  let need = principalPoints;
  const debit_principal = [];
  for (const lot of purchaseLots) {
    if (need <= 0) break;
    const take = Math.min(lot.remaining, need);
    debit_principal.push({ lot_id: lot.id, amount: take });
    need -= take;
  }

  const void_bonus = lots
    .filter(l => l.type === 'bonus' && l.source_id === orderId && l.remaining > 0)
    .map(l => ({ lot_id: l.id, amount: l.remaining }));

  return {
    ok: true,
    debit_principal,
    void_bonus,
    refund_twd: principalPoints * POINT_PRICE_TWD,
  };
}

// module.exports 補上：planDebit, planRefund, redeemPointsFor
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test scripts/test-points.mjs`  
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add lib/points.js scripts/test-points.mjs
git commit -m "$(cat <<'EOF'
feat(points): plan debit by expiry and refund with bonus void

EOF
)"
```

---

### Task 3: Postgres schema

**Files:**
- Modify: `server.js`（`migrate()` 內 `CREATE TABLE`）

- [ ] **Step 1: 在既有 `access_scans` 表之後加入**

```sql
CREATE TABLE IF NOT EXISTS point_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  pack_id TEXT NOT NULL,
  principal INT NOT NULL,
  bonus INT NOT NULL DEFAULT 0,
  pay_twd INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  stripe_session_id TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS point_orders_stripe_session_uidx
  ON point_orders(stripe_session_id) WHERE stripe_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS point_lots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  original_amount INT NOT NULL,
  remaining INT NOT NULL,
  expires_at TIMESTAMPTZ,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS point_lots_user_idx ON point_lots(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS point_lots_source_type_uidx
  ON point_lots(user_id, type, source_type, source_id);

CREATE TABLE IF NOT EXISTS point_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  lot_id TEXT REFERENCES point_lots(id),
  delta INT NOT NULL,
  reason TEXT NOT NULL,
  ref_type TEXT,
  ref_id TEXT,
  actor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS point_ledger_user_idx ON point_ledger(user_id);

CREATE TABLE IF NOT EXISTS point_redemptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  service TEXT NOT NULL,
  points INT NOT NULL,
  hours INT,
  status TEXT NOT NULL DEFAULT 'paid',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS point_refunds (
  id TEXT PRIMARY KEY,
  point_order_id TEXT NOT NULL REFERENCES point_orders(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  principal_points INT NOT NULL,
  refund_twd INT NOT NULL,
  bonus_voided INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  stripe_refund_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

注意：`point_lots` 的 unique `(user_id, type, source_type, source_id)` 讓會籍贈點／購點本金／加贈各一筆可冪等；同一 order 的 purchase 與 bonus 因 `type` 不同可共存。

- [ ] **Step 2: 重啟或呼叫 migrate，確認無錯誤**

Run: `npm run dev`（或既有啟動方式）  
Expected: log 含 `[db] 連線並完成 migrate`

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "$(cat <<'EOF'
feat(points): add point_orders lots ledger redemptions schema

EOF
)"
```

---

### Task 4: 入帳 helper 與查詢 API

**Files:**
- Modify: `server.js`
- Keep using: `lib/points.js`

- [ ] **Step 1: 實作 DB helper（放 `server.js`，與 entitlements 同風格）**

```js
const {
  POINT_PRICE_TWD, PACKS, MEMBERSHIP_GIFT_POINTS, REDEEM_PRICES,
  addYears, availableBalance, planDebit, planRefund, redeemPointsFor,
} = require('./lib/points');

async function loadPointLots(userId, client) {
  const run = client ? client.query.bind(client) : q;
  const r = await run(
    `SELECT id, user_id, type, original_amount, remaining, expires_at, source_type, source_id, created_at
     FROM point_lots WHERE user_id=$1 ORDER BY created_at`,
    [userId]
  );
  return r.rows.map(row => ({
    ...row,
    expires_at: row.expires_at ? new Date(row.expires_at) : null,
    created_at: new Date(row.created_at),
  }));
}

/** 冪等入帳一筆 lot；已存在則回傳既有列 */
async function creditLot(client, {
  userId, type, amount, expiresAt, sourceType, sourceId, reason, actor,
}) {
  const id = uid('pl_');
  const ins = await client.query(
    `INSERT INTO point_lots
       (id, user_id, type, original_amount, remaining, expires_at, source_type, source_id)
     VALUES ($1,$2,$3,$4,$4,$5,$6,$7)
     ON CONFLICT (user_id, type, source_type, source_id) DO NOTHING
     RETURNING *`,
    [id, userId, type, amount, expiresAt, sourceType, sourceId]
  );
  let row = ins.rows[0];
  if (!row) {
    row = (await client.query(
      `SELECT * FROM point_lots WHERE user_id=$1 AND type=$2 AND source_type=$3 AND source_id=$4`,
      [userId, type, sourceType, sourceId]
    )).rows[0];
    return { lot: row, created: false };
  }
  await client.query(
    `INSERT INTO point_ledger (id, user_id, lot_id, delta, reason, ref_type, ref_id, actor)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [uid('ldg_'), userId, row.id, amount, reason, sourceType, sourceId, actor || 'system']
  );
  return { lot: row, created: true };
}

async function fulfillPointOrder(client, order, now = new Date()) {
  if (order.status === 'paid') return { already: true };
  await client.query(
    `UPDATE point_orders SET status='paid', paid_at=$2 WHERE id=$1 AND status='pending'`,
    [order.id, now]
  );
  await creditLot(client, {
    userId: order.user_id, type: 'purchase', amount: order.principal,
    expiresAt: null, sourceType: 'point_order', sourceId: order.id,
    reason: 'purchase', actor: 'system',
  });
  if (order.bonus > 0) {
    await creditLot(client, {
      userId: order.user_id, type: 'bonus', amount: order.bonus,
      expiresAt: addYears(now, 1), sourceType: 'point_order', sourceId: order.id,
      reason: 'bonus', actor: 'system',
    });
  }
  return { already: false };
}

async function grantMembershipGift(client, userId, plan, sourceId, now = new Date()) {
  const amount = MEMBERSHIP_GIFT_POINTS[plan];
  if (amount == null) throw new Error('unknown plan');
  if (amount <= 0) return { skipped: true };
  return creditLot(client, {
    userId, type: 'membership_gift', amount,
    expiresAt: addYears(now, 1),
    sourceType: 'commitment', sourceId,
    reason: 'membership_gift', actor: 'system',
  });
}
```

若 Postgres 尚無該 unique 约束名稱，確認 Task 3 的 index 與 `ON CONFLICT (user_id, type, source_type, source_id)` 一致（需 UNIQUE 約束，不是僅 INDEX——Task 3 改用）：

```sql
CREATE UNIQUE INDEX IF NOT EXISTS ... 
```
改為：

```sql
-- 在 CREATE TABLE point_lots 後：
DO $$ BEGIN
  ALTER TABLE point_lots
    ADD CONSTRAINT point_lots_source_uniq UNIQUE (user_id, type, source_type, source_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

（實作時二選一：表定義內 `UNIQUE (...)` 或上述 DO 區塊；測試 migrate 一次即可。）

- [ ] **Step 2: API**

```js
app.get('/api/points/packs', (req, res) => {
  res.json({ price_twd: POINT_PRICE_TWD, packs: Object.values(PACKS) });
});

app.get('/api/me/points', auth, requireDb, wrap(async (req, res) => {
  if (!req.auth.sub) return res.status(403).json({ error: '請以會員身分登入。' });
  const lots = await loadPointLots(req.auth.sub);
  const now = new Date();
  res.json({
    balance: availableBalance(lots, now),
    lots: lots.map(l => ({
      id: l.id, type: l.type, remaining: l.remaining,
      expires_at: l.expires_at, source_type: l.source_type, source_id: l.source_id,
      available: isLotAvailable(l, now),
    })),
  });
}));
```

記得 `const { isLotAvailable } = require('./lib/points');`。

- [ ] **Step 3: 手動煙測**

登入後 `GET /api/me/points` → `{ balance: 0, lots: [] }`；`GET /api/points/packs` 有四檔。

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "$(cat <<'EOF'
feat(points): credit helpers and me/points packs APIs

EOF
)"
```

---

### Task 5: 後台發點 ＋ 會籍 confirm 贈點

**Files:**
- Modify: `server.js`（`POST /api/admin/commitments/:id/confirm` 與新 API）
- Modify: `public/admin.html`（發點表單，最小）

- [ ] **Step 1: Admin grant API**

```js
app.post('/api/admin/points/grants', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const userId = (req.body.user_id || '').trim();
  const amount = Number(req.body.amount);
  const note = (req.body.note || '').trim();
  if (!userId || !Number.isInteger(amount) || amount < 1) {
    return res.status(400).json({ error: 'user_id 與正整數 amount 必填。' });
  }
  if (!note) return res.status(400).json({ error: '備註必填。' });
  const now = new Date();
  let expiresAt = addYears(now, 1);
  if (req.body.expires_at) {
    const d = new Date(req.body.expires_at);
    if (Number.isNaN(+d)) return res.status(400).json({ error: 'expires_at 無效。' });
    expiresAt = d;
  }
  const grantId = uid('pg_');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { lot } = await creditLot(client, {
      userId, type: 'admin', amount, expiresAt,
      sourceType: 'admin_grant', sourceId: grantId,
      reason: 'admin', actor: req.auth.sub,
    });
    // 備註寫入 ledger：可多一欄；若無 note 欄，把 note 放 ref 或另表。最簡：ledger reason 仍 admin，ref_id=grantId，並 INSERT 一小表或 updates——YAGNI：把 note 存 site 無。改 point_ledger 加 note TEXT 可空。
    await client.query('COMMIT');
    res.json({ lot, grant_id: grantId, note });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));
```

**修正：** Task 3 的 `point_ledger` 加 `note TEXT`；`creditLot` 接受可選 `note`。Admin grant 傳入 `note`。

- [ ] **Step 2: 在 confirm commitment 成功後**

於 `POST /api/admin/commitments/:id/confirm` 在既有 founding entitlement 同步之後：

```js
const client = await pool.connect();
try {
  await client.query('BEGIN');
  // ...既有 update＋syncFounding...
  await grantMembershipGift(client, c.user_id, 'founding', c.id);
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
}
```

若 confirm 目前無 transaction，包進同一 transaction；`grantMembershipGift` 對 founding＝2000 點、冪等。

- [ ] **Step 3: admin.html 最小發點 UI**

在會員列或獨立區塊：user id、amount、expires_at（可空）、note → `POST /api/admin/points/grants`。列表可暫時只靠重新載入 `/api/state` 後顯示（下一步可把 balance 併進 state）。

- [ ] **Step 4: `/api/state` 會員物件附加 `points_balance`**

Admin／會員 state 載入時：`points_balance: availableBalance(await loadPointLots(id))`。

- [ ] **Step 5: 手動驗：confirm 創始 → 會員 2000 贈點；後台發 50 → 餘額增加**

- [ ] **Step 6: Commit**

```bash
git add server.js public/admin.html
git commit -m "$(cat <<'EOF'
feat(points): admin grants and founding membership gift points

EOF
)"
```

---

### Task 6: 兌換 API（須 active）

**Files:**
- Modify: `server.js`

- [ ] **Step 1: 實作 `applyDebit(client, userId, allocations, reason, ref)`**

```js
async function applyDebit(client, userId, allocations, reason, refType, refId, actor) {
  for (const a of allocations) {
    const u = await client.query(
      `UPDATE point_lots SET remaining = remaining - $2
       WHERE id=$1 AND remaining >= $2
         AND (expires_at IS NULL OR expires_at > now())
       RETURNING id`,
      [a.lot_id, a.amount]
    );
    if (!u.rowCount) throw Object.assign(new Error('lot_debit_conflict'), { status: 409 });
    await client.query(
      `INSERT INTO point_ledger (id, user_id, lot_id, delta, reason, ref_type, ref_id, actor, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [uid('ldg_'), userId, a.lot_id, -a.amount, reason, refType, refId, actor, null]
    );
  }
}
```

- [ ] **Step 2: Redeem 端點**

```js
app.post('/api/me/points/redeem', auth, requireDb, wrap(async (req, res) => {
  if (!req.auth.sub) return res.status(403).json({ error: '請以會員身分登入。' });
  const access = await memberAccessFor(req.auth.sub);
  if (!access.active) return res.status(403).json({ error: '需要 active 會員才能兌換二樓服務。', code: 'not_active' });

  const service = (req.body.service || '').trim();
  let hours = req.body.hours;
  if (service === 'shower') hours = 1;
  else {
    hours = Number(hours);
    if (!Number.isInteger(hours) || hours < 1) return res.status(400).json({ error: 'hours 須為正整數。' });
  }
  let points;
  try { points = redeemPointsFor(service, hours); }
  catch { return res.status(400).json({ error: '不支援的服務。' }); }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lots = (await client.query(
      `SELECT * FROM point_lots WHERE user_id=$1 FOR UPDATE`, [req.auth.sub]
    )).rows.map(/* same shape as loadPointLots */);
    const plan = planDebit(lots, points, new Date());
    if (!plan.ok) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '點數不足。', code: plan.error });
    }
    const rid = uid('pr_');
    await client.query(
      `INSERT INTO point_redemptions (id, user_id, service, points, hours, status)
       VALUES ($1,$2,$3,$4,$5,'paid')`,
      [rid, req.auth.sub, service, points, service === 'shower' ? null : hours]
    );
    await applyDebit(client, req.auth.sub, plan.allocations, 'redeem', 'point_redemption', rid, req.auth.sub);
    await client.query('COMMIT');
    res.json({
      redemption: { id: rid, service, points, hours: service === 'shower' ? null : hours, status: 'paid' },
      balance: availableBalance(await loadPointLots(req.auth.sub)),
    });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.status === 409) return res.status(409).json({ error: '扣點衝突，請重試。' });
    throw e;
  } finally {
    client.release();
  }
}));
```

- [ ] **Step 3: 驗收**

非 active → 403；active＋餘額足夠 → 扣點正確（先贈點後本金）；餘額不足 → 400。

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "$(cat <<'EOF'
feat(points): redeem shower capsule entertainment when active

EOF
)"
```

---

### Task 7: 購點訂單 ＋ Stripe Checkout ＋ 入帳

**Files:**
- Modify: `server.js`
- Modify: `public/member.html`

- [ ] **Step 1: 建立訂單並開 Checkout**

```js
app.post('/api/me/points/orders', auth, requireDb, wrap(async (req, res) => {
  if (!req.auth.sub) return res.status(403).json({ error: '請以會員身分登入。' });
  if (!stripe) return res.status(503).json({ error: '購買功能尚未開通（未設定 Stripe）。' });
  const pack = PACKS[(req.body.pack_id || '').trim()];
  if (!pack) return res.status(400).json({ error: '未知方案。' });

  const id = uid('po_');
  await q(
    `INSERT INTO point_orders (id, user_id, pack_id, principal, bonus, pay_twd, status)
     VALUES ($1,$2,$3,$4,$5,$6,'pending')`,
    [id, req.auth.sub, pack.id, pack.principal, pack.bonus, pack.pay_twd]
  );

  const origin = SITE_BASE;
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'twd',
        product_data: {
          name: `言文字點數方案 ${pack.id}`,
          description: `本金 ${pack.principal} 點` + (pack.bonus ? `＋加贈 ${pack.bonus} 點` : ''),
        },
        unit_amount: pack.pay_twd * 100,
      },
      quantity: 1,
    }],
    success_url: `${origin}/member?points_paid=1&oid=${id}&s={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/member?points_canceled=1`,
    client_reference_id: id,
    metadata: { kind: 'point_pack', point_order_id: id, user_id: req.auth.sub, pack_id: pack.id },
  });
  await q(`UPDATE point_orders SET stripe_session_id=$2 WHERE id=$1`, [id, session.id]);
  res.json({ order_id: id, url: session.url });
}));
```

- [ ] **Step 2: 履約（會員帶回 session id）**

```js
app.post('/api/me/points/orders/:id/fulfill', auth, requireDb, wrap(async (req, res) => {
  if (!req.auth.sub) return res.status(403).json({ error: '請以會員身分登入。' });
  if (!stripe) return res.status(503).json({ error: 'Stripe 未設定。' });
  const order = (await q(`SELECT * FROM point_orders WHERE id=$1`, [req.params.id])).rows[0];
  if (!order || order.user_id !== req.auth.sub) return res.status(404).json({ error: '找不到訂單。' });
  if (order.status === 'paid') return res.json({ ok: true, already: true });

  const sessionId = (req.body.session_id || order.stripe_session_id || '').trim();
  if (!sessionId) return res.status(400).json({ error: '缺少 session_id。' });
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== 'paid') return res.status(402).json({ error: '尚未付款。' });
  if (session.metadata?.point_order_id && session.metadata.point_order_id !== order.id) {
    return res.status(400).json({ error: 'session 與訂單不符。' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = (await client.query(`SELECT * FROM point_orders WHERE id=$1 FOR UPDATE`, [order.id])).rows[0];
    await fulfillPointOrder(client, locked);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  res.json({ ok: true, balance: availableBalance(await loadPointLots(req.auth.sub)) });
}));
```

另提供 `POST /api/admin/points/orders/:id/fulfill`（adminOnly）供人工入帳（無 Stripe 時測資）。

- [ ] **Step 3: member.html**

- 顯示 `points` 餘額  
- 四檔購點按鈕 → orders → redirect `url`  
- URL 含 `points_paid` 時呼叫 fulfill  

- [ ] **Step 4: Commit**

```bash
git add server.js public/member.html
git commit -m "$(cat <<'EOF'
feat(points): stripe checkout for point packs and fulfill

EOF
)"
```

---

### Task 8: 退款（本金＋作廢加贈）

**Files:**
- Modify: `server.js`
- Modify: `public/member.html`

- [ ] **Step 1: Refund API**

```js
app.post('/api/me/points/refunds', auth, requireDb, wrap(async (req, res) => {
  if (!req.auth.sub) return res.status(403).json({ error: '請以會員身分登入。' });
  const orderId = (req.body.point_order_id || '').trim();
  const principalPoints = Number(req.body.principal_points);
  if (!orderId || !Number.isInteger(principalPoints) || principalPoints < 1) {
    return res.status(400).json({ error: 'point_order_id 與 principal_points 必填。' });
  }
  const order = (await q(`SELECT * FROM point_orders WHERE id=$1`, [orderId])).rows[0];
  if (!order || order.user_id !== req.auth.sub) return res.status(404).json({ error: '找不到訂單。' });
  if (order.status !== 'paid') return res.status(400).json({ error: '訂單未付款。' });

  const client = await pool.connect();
  let refundRow;
  try {
    await client.query('BEGIN');
    const lots = (await client.query(
      `SELECT * FROM point_lots WHERE user_id=$1 FOR UPDATE`, [req.auth.sub]
    )).rows.map(/* normalize */);
    const plan = planRefund(lots, orderId, principalPoints);
    if (!plan.ok) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '無法退款。', code: plan.error });
    }
    const rid = uid('prf_');
    const bonusVoided = plan.void_bonus.reduce((s, x) => s + x.amount, 0);
    await applyDebit(client, req.auth.sub, plan.debit_principal, 'refund', 'point_refund', rid, req.auth.sub);
    for (const v of plan.void_bonus) {
      await client.query(
        `UPDATE point_lots SET remaining = 0 WHERE id=$1 AND remaining=$2`,
        [v.lot_id, v.amount]
      );
      await client.query(
        `INSERT INTO point_ledger (id, user_id, lot_id, delta, reason, ref_type, ref_id, actor)
         VALUES ($1,$2,$3,$4,'void_bonus','point_refund',$5,$6)`,
        [uid('ldg_'), req.auth.sub, v.lot_id, -v.amount, rid, req.auth.sub]
      );
    }
    // Stripe 退款（有 session 時）
    let stripeRefundId = null;
    if (stripe && order.stripe_session_id) {
      const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id, {
        expand: ['payment_intent'],
      });
      const pi = session.payment_intent;
      const piId = typeof pi === 'string' ? pi : pi && pi.id;
      if (piId) {
        const rf = await stripe.refunds.create({
          payment_intent: piId,
          amount: plan.refund_twd * 100,
        });
        stripeRefundId = rf.id;
      }
    }
    await client.query(
      `INSERT INTO point_refunds
         (id, point_order_id, user_id, principal_points, refund_twd, bonus_voided, status, stripe_refund_id)
       VALUES ($1,$2,$3,$4,$5,$6,'completed',$7)`,
      [rid, orderId, req.auth.sub, principalPoints, plan.refund_twd, bonusVoided, stripeRefundId]
    );
    await client.query('COMMIT');
    refundRow = { id: rid, principal_points: principalPoints, refund_twd: plan.refund_twd, bonus_voided: bonusVoided };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  res.json({ refund: refundRow, balance: availableBalance(await loadPointLots(req.auth.sub)) });
}));
```

**注意：** Stripe partial refund 多次時需 payment_intent 仍有可退餘額；失敗應整筆 ROLLBACK（把 stripe.refunds.create 放 transaction 外或先退款再寫 DB——較穩做法：**先 DB 條件扣點成功 COMMIT 前先算 plan，呼叫 Stripe，成功再 COMMIT；Stripe 失敗 ROLLBACK**）。實作採用：BEGIN → lock／plan／debit／void → Stripe refund → INSERT refund → COMMIT；Stripe 丟錯則 ROLLBACK（點數回滾）。若 Stripe 成功但 COMMIT 失敗，需人工對帳（文件化於錯誤處理註解即可）。

- [ ] **Step 2: member 頁列出已付訂單剩餘本金＋退款表單**

- [ ] **Step 3: 驗收部分退 → 加贈全作廢；會籍贈點仍在**

- [ ] **Step 4: Commit**

```bash
git add server.js public/member.html
git commit -m "$(cat <<'EOF'
feat(points): refund unused purchase points and void pack bonus

EOF
)"
```

---

### Task 9: 過期處理 ＋ 後台流水 ＋ 會員兌換 UI 收尾

**Files:**
- Modify: `server.js`
- Modify: `public/member.html`
- Modify: `public/admin.html`

- [ ] **Step 1: 懶惰過期（讀取 lots 時）**

```js
async function expireLots(client, userId, now = new Date()) {
  const r = await client.query(
    `UPDATE point_lots SET remaining = 0
     WHERE user_id=$1 AND remaining > 0 AND expires_at IS NOT NULL AND expires_at <= $2
     RETURNING id, remaining, user_id`,
    // 注意：RETURNING remaining 已是 0；改用 CTE 先選再更新
  );
}
```

改用：

```js
async function expireLots(userId, now = new Date()) {
  const due = await q(
    `SELECT id, remaining FROM point_lots
     WHERE user_id=$1 AND remaining > 0 AND expires_at IS NOT NULL AND expires_at <= $2`,
    [userId, now]
  );
  for (const row of due.rows) {
    await q(`UPDATE point_lots SET remaining=0 WHERE id=$1 AND remaining=$2`, [row.id, row.remaining]);
    await q(
      `INSERT INTO point_ledger (id, user_id, lot_id, delta, reason, actor)
       VALUES ($1,$2,$3,$4,'expire','system')`,
      [uid('ldg_'), userId, row.id, -row.remaining]
    );
  }
}
```

在 `GET /api/me/points` 開頭呼叫。

- [ ] **Step 2: Admin**

- `GET` 已含於 state 的 balance  
- 簡易：選會員看 ledger `SELECT * FROM point_ledger WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`  
  新端點：`GET /api/admin/users/:id/points` → lots＋ledger＋orders  

- [ ] **Step 3: member.html 兌換區**

淋浴 1 次；膠囊／娛樂室選小時數 → `POST /api/me/points/redeem`；非 active 顯示不可兌換。

- [ ] **Step 4: 跑全測**

Run: `npm test`  
Expected: entitlements／access-token／menu／points 全 PASS

- [ ] **Step 5: Commit**

```bash
git add server.js public/member.html public/admin.html
git commit -m "$(cat <<'EOF'
feat(points): expire gifts lazily and finish member admin UI

EOF
)"
```

---

### Task 10: Spec 狀態與交叉引用

**Files:**
- Modify: `docs/superpowers/specs/2026-07-12-member-points-design.md`（加實作計畫連結）
- Modify: `docs/superpowers/specs/2026-07-12-member-active-access-design.md`（非目標「休憩時數扣點」加註：已由 member-points 承接）

- [ ] **Step 1: 更新兩份 spec 各 1～2 行交叉連結**

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-07-12-member-points-design.md docs/superpowers/specs/2026-07-12-member-active-access-design.md
git commit -m "$(cat <<'EOF'
docs: link member-points plan and active-access cross-ref

EOF
)"
```

---

## Spec coverage checklist

| Spec 項目 | Task |
|-----------|------|
| 購點四檔＋加贈 1 年 | 1, 7 |
| 會籍贈點表＋付款／confirm 入帳 | 1, 5 |
| 後台發點（可自訂效期、備註必填） | 5 |
| 效期近先扣、購買點最後 | 2, 6 |
| active 才兌換淋浴／膠囊／娛樂室 | 6, 9 |
| 包場不走點數 | 全域／redeem 拒 venue |
| 未用本金可部分退、加贈全作廢 | 2, 8 |
| 會籍贈點不受購點退款影響 | 2, 8 |
| lots＋ledger SoT | 3–8 |
| 過期 | 9 |
| 會員／後台 UI | 5, 7–9 |

## Placeholder / 一致性自檢

- 無 TBD；Stripe fulfill 採 session 帶回（與現有無 webhook 風格一致）。
- `PACKS`／`MEMBERSHIP_GIFT_POINTS`／`REDEEM_PRICES` 單一來源在 `lib/points.js`。
- `source_id` 對購點＝`point_orders.id`；會籍＝`commitments.id`；後台＝`pg_…` grant id。
