# 會員頁 UX／版面優化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依定稿 spec 重構 `member.html`：狀態主體、右上 Active/QR overlay、下一場通知卡、精簡點數錢包、同頁降權區、toast 與引導，三語同步。

**Architecture:** 可測純邏輯抽到 `lib/member-ui.js`（下一場挑選、快過期加總、狀態標題）；`public/member.html` 重寫 CSS／`render*`（瀏覽器內聯同等邏輯，註解要求與 lib 同步）；`en/`、`ja/` 為同一檔複本（LANG 由 path 決定）。不改門禁／點數後端規則。

**Tech Stack:** 既有靜態 HTML＋vanilla JS、`node:test`、CIS token（`style.css`）。

**Spec:** `docs/superpowers/specs/2026-07-12-member-page-ux-design.md`

---

## File map

| 檔案 | 職責 |
|------|------|
| `lib/member-ui.js` | `EXPIRING_WITHIN_DAYS`、`pickNextEvent`、`expiringPointsSummary`、`membershipStatusTitle`（純函式） |
| `scripts/test-member-ui.mjs` | 上述單元測試 |
| `scripts/test-layout.mjs` | 加會員頁結構標記／關鍵 class 斷言 |
| `public/member.html` | UI 實作（CSS、I18N、render、overlay、toast） |
| `public/en/member.html` | 與 zh 同源複本 |
| `public/ja/member.html` | 與 zh 同源複本 |

## Global constraints

- 工作目錄：`emoji-website`；建議 branch `member-page-ux`。
- 每個 Task 結束一次 commit；不 push，除非使用者要求。
- 禁止投資術語（申購／本金／持倉／贖回）；用購買點數／退款／點數錢包。
- QR 僅 overlay 開啟時 `startQrRefresh`；關閉時 `stopQrRefresh`。
- 黃 accent：Active 點＋通知卡底；遵守 CIS。
- `prefers-reduced-motion: reduce` 時關掉 pulse／toast 動畫。

---

### Task 1: 純邏輯 `lib/member-ui.js`＋測試

**Files:**
- Create: `lib/member-ui.js`
- Create: `scripts/test-member-ui.mjs`

- [ ] **Step 1: 寫失敗測試**

```js
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
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test scripts/test-member-ui.mjs`  
Expected: FAIL（模組不存在）

- [ ] **Step 3: 實作 `lib/member-ui.js`**

```js
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
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test scripts/test-member-ui.mjs`  
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add lib/member-ui.js scripts/test-member-ui.mjs
git commit -m "$(cat <<'EOF'
feat(member): 抽出會員頁下一場／快過期／狀態標題純邏輯

供前端重構與單元測試共用同一規則。

EOF
)"
```

---

### Task 2: Toast 元件＋CSS 骨架（member.html）

**Files:**
- Modify: `public/member.html`（`<style>` 區塊與 script 開頭工具函式）

- [ ] **Step 1: 擴充 `<style>`**

在既有 `.m-*` 樣式後追加（沿用 CIS 變數，勿引入新色系）：

```css
.m-wrap{max-width:440px;margin:0 auto;padding:24px 18px 96px;min-height:calc(100vh - 70px)}
.m-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px}
.m-eyebrow{font-size:.74rem;letter-spacing:.22em;text-transform:uppercase;color:var(--muted)}
.m-chip{flex:0 0 auto;display:inline-flex;align-items:center;gap:7px;padding:5px 7px 5px 10px;
  border:1px solid var(--ink);border-radius:999px;background:var(--card);font-size:.82rem;font-weight:600;
  cursor:pointer;font-family:inherit;color:inherit}
.m-chip:disabled{opacity:.55;cursor:default}
.m-chip .dot{width:8px;height:8px;border-radius:50%;background:var(--muted);border:1px solid var(--ink)}
.m-chip .dot.on{background:var(--accent)}
.m-chip .qr-ico{width:26px;height:26px;border-radius:7px;border:1px solid var(--line);background:var(--paper);
  display:grid;place-items:center}
.m-notice{border:1px solid var(--ink);border-radius:14px;padding:12px 14px;background:rgba(255,222,52,.22);
  margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;gap:10px}
.m-panel{border:1.5px solid var(--ink);border-radius:16px;padding:16px;background:var(--card);
  position:relative;overflow:hidden;margin-bottom:14px;box-shadow:var(--shadow)}
.m-panel::after{content:"";position:absolute;right:-16px;top:-16px;width:80px;height:80px;border-radius:50%;
  background:var(--accent);opacity:.22;pointer-events:none}
.m-panel--wallet::after{display:none}
.m-progress{height:8px;background:var(--line);border-radius:99px;overflow:hidden;margin-bottom:8px}
.m-progress>i{display:block;height:100%;background:var(--ink);border-radius:99px}
.m-meta{display:flex;justify-content:space-between;gap:10px;font-size:.82rem;color:var(--muted);margin-bottom:14px}
.m-stat-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:8px;margin-bottom:12px}
.m-stat{border:1px solid var(--line);border-radius:12px;padding:14px 12px;text-align:center;background:var(--paper)}
.m-stat--hi{border-style:dashed;border-color:var(--ink);background:rgba(255,222,52,.12)}
.m-stat b{display:block;font-size:1.75rem;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.1;margin:4px 0}
.m-btn-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.m-btn-row .btn{justify-content:center;width:100%;box-sizing:border-box}
.m-quiet{opacity:.75;margin:22px 0}
.m-overlay{position:fixed;inset:0;background:rgba(27,26,23,.9);color:var(--paper);z-index:80;
  display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center}
.m-overlay[hidden]{display:none!important}
.m-overlay .x{position:absolute;top:16px;right:18px;border:0;background:transparent;color:inherit;
  font-size:1.6rem;cursor:pointer;opacity:.7}
.m-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:90;
  background:var(--ink);color:var(--paper);padding:.75em 1.2em;border-radius:var(--radius-sm);
  font-size:.9rem;max-width:min(420px,92vw);box-shadow:var(--shadow)}
.m-toast[hidden]{display:none!important}
.m-drawer{border:1px solid var(--line);border-radius:12px;padding:12px;margin-top:12px;background:var(--paper)}
.m-drawer[hidden]{display:none!important}
@media (prefers-reduced-motion:reduce){
  .m-chip .dot.on{animation:none}
}
```

刪除或停用舊的單一 `.m-card` 大卡片依賴（render 改為多區塊）；保留登入態置中樣式。

- [ ] **Step 2: 加入 toast DOM 與函式**

在 `<main>` 後加：

```html
<div class="m-toast" id="m-toast" hidden role="status" aria-live="polite"></div>
<div class="m-overlay" id="m-qr-overlay" hidden aria-modal="true" role="dialog" aria-label="QR">
  <button type="button" class="x" id="m-qr-close" aria-label="Close">×</button>
  <p class="m-note" id="m-qr-overlay-meta"></p>
  <img id="m-qr-img" alt="" width="220" height="220" style="border-radius:12px;background:#fff;padding:12px">
</div>
```

Script：

```js
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('m-toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}
```

將 `alert(...)` 成功／失敗主路徑改呼叫 `showToast`（退款改 modal 留 Task 5）。

- [ ] **Step 3: 手動開頁確認登入前仍正常**

Run: 既有 `npm start`／`npm run dev`，開 `/member`  
Expected: 無 JS 錯；toast／overlay 隱藏

- [ ] **Step 4: Commit**

```bash
git add public/member.html
git commit -m "$(cat <<'EOF'
feat(member): 加入會員頁 HUD 樣式骨架與 toast／QR overlay 殼

為狀態卡與右上進出控件重構鋪路。

EOF
)"
```

---

### Task 3: 右上 Active／QR chip＋overlay 刷新

**Files:**
- Modify: `public/member.html`（`renderAccess` 改為 chip；overlay 綁定）

- [ ] **Step 1: 實作 `renderAccessChip(data)`**

回傳 chip HTML（放入 header 右側），邏輯：

- `canIssueQr = activeEntitlements.length || pending.length`
- active → `dot on` + `T.activeShort`（短文案如「Active」）
- else if pending → `T.pendingShort` + 仍可點
- else → disabled 或 click 只 `showToast(T.needPlan)`，無 QR icon 可點發碼

```js
function renderAccessChip(data) {
  const access = data.access || {};
  const activeEntitlements = Array.isArray(access.activeEntitlements) ? access.activeEntitlements : [];
  const pending = Array.isArray(access.pending) ? access.pending : [];
  const canIssue = activeEntitlements.length > 0 || pending.length > 0;
  const on = !!access.active;
  const label = on ? T.activeShort : (pending.length ? T.pendingShort : T.inactiveShort);
  return `<button type="button" class="m-chip" id="m-access-chip" ${canIssue ? '' : 'data-blocked="1"'}
    aria-label="${T.accessLabel}">
    <span class="dot${on ? ' on' : ''}"></span>${esc(label)}
    <span class="qr-ico" aria-hidden="true"><!-- 內嵌既有 QR 風格 SVG --></span>
  </button>`;
}
```

- [ ] **Step 2: Overlay 開關**

```js
function openQrOverlay() {
  const ov = document.getElementById('m-qr-overlay');
  if (!ov) return;
  ov.hidden = false;
  startQrRefresh(true);
}
function closeQrOverlay() {
  const ov = document.getElementById('m-qr-overlay');
  if (ov) ov.hidden = true;
  stopQrRefresh();
}
```

`refreshQr` 改寫 meta 到 `#m-qr-overlay-meta`；img 用 overlay 內節點。關閉鈕、背景 click、`Escape` 呼叫 `closeQrOverlay`。

Chip click：若 `data-blocked` → `showToast(T.needPlan)`；否則 `openQrOverlay`。

- [ ] **Step 3: 從主欄移除舊的大塊 `renderAccess` 區**（權益明细可選放狀態卡弱化列，不常駐大 QR）

- [ ] **Step 4: Commit**

```bash
git add public/member.html
git commit -m "$(cat <<'EOF'
feat(member): Active／QR 收合右上角並改 overlay 出示

現場掃碼改為點擊展開，關閉後停止刷新。

EOF
)"
```

---

### Task 4: 通知卡＋目前狀態 HUD

**Files:**
- Modify: `public/member.html`（`renderMember`）

- [ ] **Step 1: 在 script 內聯與 `lib/member-ui.js` 同步的三個函式**（檔案頂註解 `// sync with lib/member-ui.js`），避免瀏覽器打包。

- [ ] **Step 2: `renderNotice(events)`**

```js
function renderNotice(events) {
  const ev = pickNextEvent(events);
  if (!ev) return '';
  return `<section class="m-notice" aria-label="${T.nextEvent}">
    <div>
      <div class="m-eyebrow" style="letter-spacing:.14em">${T.nextEvent}</div>
      <div style="font-family:var(--serif);font-size:1.05rem;font-weight:600;margin-top:2px">${esc(ev.title)}</div>
      <div class="m-note" style="margin:2px 0 0">${esc(ev.starts_at || T.timeTbd)}${ev.location ? ' · ' + esc(ev.location) : ''}${ev.registered ? ' · ' + T.registered : ''}</div>
    </div>
    <a class="btn btn--solid" href="#m-events" style="padding:.55em 1em;font-size:.82rem">${T.viewEvent}</a>
  </section>`;
}
```

- [ ] **Step 3: `renderStatus(data)`**

- 標題：`目前狀態` +（若 `c.cert_no`）` · No. ${cert_no}`
- 主標：`membershipStatusTitle(...)`
- 進度條：若有 `starts_at`/`ends_at`（取當前 active entitlement 或 commitment 期間）算百分比與剩餘天數
- `.m-meta`：左剩餘天數；右弱化 `方案`＋期間兩行
- `.m-btn-row`：主「續訂／升級」或「購買會籍」；次「方案說明」→ toggle `#m-plans-drawer`
- drawer 內容：創始 → `<a href="${FELLOW_PATH}">`；其餘方案文案 `T.planSoon`（即將開放／洽現場），**不新造付款 API**

- [ ] **Step 4: `renderMember` 組裝順序**

```
head (welcome + edit link + chip)
notice
status
points (仍舊函式，下一 task 換)
#m-events quiet list
updates quiet
founding line
logout
```

- [ ] **Step 5: Commit**

```bash
git add public/member.html
git commit -m "$(cat <<'EOF'
feat(member): 下一場通知卡與目前狀態 HUD

會籍期間弱化於進度列，雙鈕同排，編號跟在狀態標籤後。

EOF
)"
```

---

### Task 5: 精簡點數錢包＋紀錄展開

**Files:**
- Modify: `public/member.html`（重寫 `renderPoints`）

- [ ] **Step 1: 重寫 `renderPoints`**

結構：

```html
<section class="m-panel m-panel--wallet">
  <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px">
    <h3 style="font-family:var(--serif);font-size:1.05rem;margin:0">${T.walletTitle}</h3>
    <button type="button" class="m-link" id="m-points-ledger-toggle">${T.ordersRefund}</button>
  </div>
  <div class="m-stat-grid">
    <div class="m-stat m-stat--hi"><div class="m-note">${T.ptsAvailable}</div><b>${balance}</b><div class="m-note">${T.ptsUnitLabel}</div></div>
    <!-- 僅當 expiringPointsSummary 非 null 時渲染第二格 -->
    <div class="m-stat">...</div>
  </div>
  <div class="m-btn-row">
    <button class="btn btn--solid" data-open-buy>購買點數</button>
    <button class="btn btn--ghost" data-open-redeem>兌換服務</button>
  </div>
  <div class="m-drawer" id="m-buy-drawer" hidden>...</div>
  <div class="m-drawer" id="m-redeem-drawer" hidden>...</div>
  <div class="m-drawer" id="m-ledger-drawer" hidden>訂單／退款列表</div>
</section>
```

預設不渲染舊的長 `walletNote`、組成列表、外露訂單。

- [ ] **Step 2: 退款輸入**

用 `window.prompt` 暫可留，但成功／失敗改 `showToast`；若時間允許，用 `#m-refund-drawer` 內 `<input type="number">`＋確認鈕。

- [ ] **Step 3: Commit**

```bash
git add public/member.html
git commit -m "$(cat <<'EOF'
feat(member): 精簡點數錢包為可用與快過期

購買／兌換／紀錄改展開，預設資訊降噪。

EOF
)"
```

---

### Task 6: 個人資料面板＋操作改 toast＋I18N

**Files:**
- Modify: `public/member.html`（I18N 三語鍵、edit drawer）

- [ ] **Step 1: 補齊 I18N 鍵（zh／en／ja 同步）**

至少包含：`activeShort`、`pendingShort`、`inactiveShort`、`nextEvent`、`viewEvent`、`statusActive`、`statusPending`、`statusExpired`、`statusNone`、`memPeriodShort`、`renewUpgrade`、`buyMembership`、`planDetails`、`planSoon`、`ptsAvailable`、`ptsExpiring`、`ptsUnitLabel`、`editProfile`、`needPlan`、`saveName`、`nameReadonly` 等；刪除或停用金融味舊字串。

- [ ] **Step 2: 編輯資料**

「編輯資料」開啟 drawer：顯示 email 唯讀、name 輸入。  
**本輪無 PATCH API：** 儲存鈕顯示 `T.nameReadonly` toast「名稱暫由 Google 帳號提供」，或隱藏儲存只做檢視——依 spec 唯讀回退。

- [ ] **Step 3: `regEvent`／`redeemService`／`buyPack` 錯誤與成功改 `showToast`**

- [ ] **Step 4: Commit**

```bash
git add public/member.html
git commit -m "$(cat <<'EOF'
feat(member): 三語文案、資料檢視與 toast 回饋

補齊狀態／錢包用語並移除主要路徑的 alert。

EOF
)"
```

---

### Task 7: 同步 en／ja＋layout 測試＋全測

**Files:**
- Modify: `public/en/member.html`、`public/ja/member.html`（與 zh 位元組一致複本）
- Modify: `scripts/test-layout.mjs`

- [ ] **Step 1: 複本**

```bash
cp public/member.html public/en/member.html
cp public/member.html public/ja/member.html
```

- [ ] **Step 2: 擴充 `scripts/test-layout.mjs`**

```js
test('member page has redesign markers', () => {
  const member = fs.readFileSync(path.join(PUB, 'member.html'), 'utf8');
  assert.match(member, /m-access-chip|m-chip/);
  assert.match(member, /m-qr-overlay/);
  assert.match(member, /m-notice/);
  assert.match(member, /m-panel--wallet|ptsAvailable|walletTitle/);
  assert.match(member, /m-toast/);
  assert.doesNotMatch(member, /申購|本金|持倉|贖回/);
});
```

- [ ] **Step 3: 跑測試**

Run: `npm test`  
Expected: 既有測試＋`test-member-ui`＋layout 新斷言 PASS

- [ ] **Step 4: 手動驗收（對 spec 清單）**

1. 右上 chip → overlay QR；關閉停止請求  
2. 有／無下一場通知卡  
3. 狀態卡無點數；期間弱化；雙鈕同排；cert_no 位置  
4. 錢包僅可用／快過期  
5. 降權區活動／動態  
6. `/en/member`、`/ja/member` 文案切語系

- [ ] **Step 5: Commit**

```bash
git add public/member.html public/en/member.html public/ja/member.html scripts/test-layout.mjs
git commit -m "$(cat <<'EOF'
feat(member): 同步三語會員頁並加上版面回歸斷言

完成會員頁 UX 重構驗收前檢查。

EOF
)"
```

---

## Spec coverage checklist

| Spec 項 | Task |
|---------|------|
| 右上 Active／QR overlay | 3 |
| 下一場通知卡 | 4 |
| 目前狀態 HUD、期間弱化、雙鈕、編號 | 4 |
| 點數錢包精簡＋白話 | 5 |
| 同頁降權活動／動態／創始 | 4–5 |
| Toast、非 Active 引導 | 2–3、6 |
| 購續會籍 UI（無新後端） | 4 |
| 個人資料唯讀回退 | 6 |
| i18n zh/en/ja | 6–7 |
| 快過期 30 天／下一場規則 | 1 |
| 不改後端門禁點數規則 | 全程遵守 |

## Self-review notes

- 無 TBD／「類似 Task N」占位。
- Profile PATCH 刻意不做（spec 允許唯讀回退）。
- `membershipStatusTitle` 的 `T.statusActive` 在測試為函式；member.html I18N 須同形（`(plan) => ...`）。
