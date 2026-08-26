# 菜單 Seed 匯入網站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 `menu-data.js` seed 寫入 `site_content.menu`（全部 `published: true`），migrate 缺鍵自動灌入；`FORCE_MENU_SEED=1` 可強制覆寫。

**Architecture:** 新增 Node 模組 `lib/menu-seed.js` 解析 seed、產生穩定 id、組 JSON doc；`server.js` migrate 呼叫 `seedMenuContent()`。瀏覽器端 `menu-lib.js` 不強制改動（admin 仍可用 random id 新建）；seed 匯入路徑只走 server lib。

**Tech Stack:** Node/Express、`pg` `site_content`、`node:test`、既有 `public/menu-data.js`。

**Spec:** `docs/superpowers/specs/2026-07-12-menu-seed-import-design.md`

---

## File map

| 檔案 | 職責 |
|------|------|
| `lib/menu-seed.js` | 讀 seed、穩定 id、`buildMenuSeedDoc`、`shouldWriteMenuSeed` |
| `scripts/test-menu-seed.mjs` | 單元測試 |
| `server.js` | `seedMenuContent` + migrate 呼叫 |
| `public/menu-data.js` | 更新檔頭註解 |

## Global constraints

- 預設全部 `published: true`（本次決策）。
- 穩定 id：`m_<cat小寫>_<en-slug>`（缺 en 用 zh）。
- 無 `FORCE_MENU_SEED` 時：僅鍵不存在才 insert。
- `FORCE_MENU_SEED=1`：upsert 覆寫並 log 警告。
- Seed 解析／驗證失敗：log，不中斷 migrate（與「服務可啟動」一致）。
- 每個 Task 結束 commit；不 push 除非使用者要求。

---

### Task 1: `lib/menu-seed.js` + 測試

**Files:**
- Create: `lib/menu-seed.js`
- Create: `scripts/test-menu-seed.mjs`

- [ ] **Step 1: 寫失敗測試**

```js
// scripts/test-menu-seed.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  stableMenuId,
  buildMenuSeedDoc,
  shouldWriteMenuSeed,
  loadMenuSeedRows,
  MENU_CONTENT_KEY,
} from '../lib/menu-seed.js';

test('MENU_CONTENT_KEY is menu', () => {
  assert.equal(MENU_CONTENT_KEY, 'menu');
});

test('stableMenuId is deterministic from cat+en', () => {
  const a = stableMenuId({ cat: 'COFFEE', en: 'AMERICANO', zh: '美式咖啡' });
  const b = stableMenuId({ cat: 'COFFEE', en: 'AMERICANO', zh: '美式咖啡' });
  assert.equal(a, 'm_coffee_americano');
  assert.equal(a, b);
});

test('stableMenuId falls back to zh when en empty', () => {
  const id = stableMenuId({ cat: 'FOOD', en: '', zh: '測試餐' });
  assert.match(id, /^m_food_/);
});

test('buildMenuSeedDoc publishes all by default', () => {
  const doc = buildMenuSeedDoc([
    { cat: 'FOOD', zh: '薯條', en: 'FRENCH FRIES', price: 180, emo: 150, alcohol: false },
    { cat: 'ALCOHOL', zh: '啤酒', en: 'BEER', price: 200, emo: 150, alcohol: false },
  ]);
  assert.equal(doc.version, 1);
  assert.equal(doc.items.length, 2);
  assert.ok(doc.items.every((i) => i.published === true));
  assert.equal(doc.items[1].alcohol, true); // ALCOHOL cat
  assert.equal(doc.items[0].id, 'm_food_french_fries');
  assert.equal(doc.items[0].sort, 10);
  assert.equal(doc.items[1].sort, 20);
});

test('shouldWriteMenuSeed: missing key → write', () => {
  assert.equal(shouldWriteMenuSeed({}, false), true);
  assert.equal(shouldWriteMenuSeed({ menu: '' }, false), true);
});

test('shouldWriteMenuSeed: existing without force → skip', () => {
  assert.equal(shouldWriteMenuSeed({ menu: '{"version":1,"items":[]}' }, false), false);
});

test('shouldWriteMenuSeed: force → write', () => {
  assert.equal(shouldWriteMenuSeed({ menu: '{"version":1,"items":[]}' }, true), true);
});

test('loadMenuSeedRows reads menu-data.js', () => {
  const rows = loadMenuSeedRows();
  assert.ok(rows.length >= 20);
  assert.ok(rows.some((r) => r.zh === '美式咖啡'));
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd emoji-website && node --test scripts/test-menu-seed.mjs`  
Expected: FAIL（找不到模組）

- [ ] **Step 3: 實作 `lib/menu-seed.js`**

```js
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const MENU_CONTENT_KEY = 'menu';
const CATS = ['COFFEE', 'BEVERAGE', 'ALCOHOL', 'FOOD', 'SNACK'];

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/["']/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'item';
}

function stableMenuId(row) {
  const cat = CATS.includes(row.cat) ? row.cat : 'FOOD';
  const base = String(row.en || '').trim() || String(row.zh || '').trim() || 'item';
  return `m_${cat.toLowerCase()}_${slugify(base)}`;
}

function coerceAlcohol(row, cat) {
  if (cat === 'ALCOHOL') return true;
  if (row.note && String(row.note).includes('含酒精')) return true;
  return !!row.alcohol;
}

function normalizeSeedItem(row, index) {
  const cat = CATS.includes(row.cat) ? row.cat : 'FOOD';
  const price = Number(row.price);
  const emo = Number(row.emo);
  return {
    id: row.id || stableMenuId({ ...row, cat }),
    cat,
    zh: String(row.zh || '').trim(),
    en: String(row.en || '').trim(),
    price: Number.isFinite(price) ? price : 0,
    emo: Number.isFinite(emo) ? emo : 0,
    note: String(row.note || '').trim(),
    alcohol: coerceAlcohol(row, cat),
    published: true,
    sort: Number.isFinite(Number(row.sort)) ? Number(row.sort) : (index + 1) * 10,
  };
}

function buildMenuSeedDoc(rows, now = new Date()) {
  const items = (rows || []).map((r, i) => normalizeSeedItem(r, i));
  return {
    version: 1,
    updated_at: now.toISOString(),
    items,
  };
}

function validateMenuSeedDoc(doc) {
  if (!doc || !Array.isArray(doc.items) || doc.items.length === 0) {
    return { ok: false, error: '菜單 seed 為空' };
  }
  for (const it of doc.items) {
    if (!it.zh) return { ok: false, error: '品名（中）必填' };
    if (!CATS.includes(it.cat)) return { ok: false, error: '分類無效: ' + it.cat };
    if (!(it.price >= 0) || !(it.emo >= 0)) return { ok: false, error: '價格無效: ' + it.zh };
  }
  return { ok: true };
}

function shouldWriteMenuSeed(existingContent, force) {
  const raw = existingContent && existingContent[MENU_CONTENT_KEY];
  const missing = raw == null || !String(raw).trim();
  if (force) return true;
  return missing;
}

function loadMenuSeedRows(filePath) {
  const p = filePath || path.join(__dirname, '..', 'public', 'menu-data.js');
  const code = fs.readFileSync(p, 'utf8');
  const sandbox = { window: {}, console };
  vm.runInNewContext(code, sandbox, { filename: p });
  const rows = sandbox.window.__MENU_SEED || sandbox.window.MENU_DATA;
  if (!Array.isArray(rows)) throw new Error('menu-data.js 未匯出 __MENU_SEED');
  return rows;
}

function stringifyMenuDoc(doc) {
  return JSON.stringify(doc);
}

module.exports = {
  MENU_CONTENT_KEY,
  CATS,
  slugify,
  stableMenuId,
  buildMenuSeedDoc,
  validateMenuSeedDoc,
  shouldWriteMenuSeed,
  loadMenuSeedRows,
  stringifyMenuDoc,
};
```

若測試用 ESM `import`，改為在測試檔用 `createRequire`：

```js
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../lib/menu-seed.js');
```

（對齊 repo 內其他 `lib/*.js` 為 CJS、`scripts/test-*.mjs` 為 ESM 的慣例。）

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test scripts/test-menu-seed.mjs`  
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add lib/menu-seed.js scripts/test-menu-seed.mjs
git commit -m "feat(menu): seed 模組與穩定 id／全發布文件組裝"
```

---

### Task 2: `server.js` migrate 整合

**Files:**
- Modify: `server.js`（require + `seedMenuContent` + migrate 呼叫）

- [ ] **Step 1: 在檔案頂部與其他 lib 一併 require**

```js
const {
  MENU_CONTENT_KEY,
  loadMenuSeedRows,
  buildMenuSeedDoc,
  validateMenuSeedDoc,
  shouldWriteMenuSeed,
  stringifyMenuDoc,
} = require('./lib/menu-seed');
```

- [ ] **Step 2: 在 `seedSpaceContent` 旁新增**

```js
async function seedMenuContent() {
  const force = process.env.FORCE_MENU_SEED === '1' || process.env.FORCE_MENU_SEED === 'true';
  const content = await readContent();
  if (!shouldWriteMenuSeed(content, force)) return;
  let rows;
  try {
    rows = loadMenuSeedRows();
  } catch (e) {
    console.warn('[menu-seed] 讀取 seed 失敗，略過：', e && e.message);
    return;
  }
  const doc = buildMenuSeedDoc(rows);
  const v = validateMenuSeedDoc(doc);
  if (!v.ok) {
    console.warn('[menu-seed] 驗證失敗，略過：', v.error);
    return;
  }
  const value = stringifyMenuDoc(doc);
  if (force) {
    await q(
      `INSERT INTO site_content (key,value,updated_at) VALUES ($1,$2,now())
       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
      [MENU_CONTENT_KEY, value]
    );
    console.warn('[menu-seed] FORCE_MENU_SEED=1：已覆寫 site_content.menu（全部已發布）。請勿長期開啟此旗標。');
  } else {
    await q(
      `INSERT INTO site_content (key,value,updated_at) VALUES ($1,$2,now())
       ON CONFLICT (key) DO NOTHING`,
      [MENU_CONTENT_KEY, value]
    );
    console.log('[menu-seed] 已灌入 site_content.menu（全部已發布）。');
  }
}
```

- [ ] **Step 3: 在 `migrate` 內 `await seedSpaceContent()` 之後呼叫**

```js
await seedSpaceContent();
await seedMenuContent();
```

- [ ] **Step 4: 靜態檢查**

Run: `node --check server.js && node --test scripts/test-menu-seed.mjs`  
Expected: 無語法錯、測試 PASS

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "feat(menu): migrate 自動 seed menu，支援 FORCE_MENU_SEED 覆寫"
```

---

### Task 3: 更新 `menu-data.js` 註解 + 本機／驗收灌入

**Files:**
- Modify: `public/menu-data.js`（僅註解）

- [ ] **Step 1: 更新檔頭**

```js
/* SEED — 供 server migrate 寫入 site_content.menu（預設全部 published:true）。
   亦供後台／IG 在 DB 尚無 menu 時作 fallback 原料。
   原價 price / 會員價 emo；SNACK 尚無可靠資料，暫不建立品項。
   強制覆寫：啟動時設 FORCE_MENU_SEED=1（勿長期開啟）。 */
```

- [ ] **Step 2: 本機以 FORCE 灌入（需 DATABASE_URL）**

```bash
FORCE_MENU_SEED=1 PORT=8099 node server.js
# 另開 terminal：
curl -s http://localhost:8099/api/public | node -e "
const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{
  const j=JSON.parse(Buffer.concat(d).toString());
  const raw=j.content&&j.content.menu;
  const doc=typeof raw==='string'?JSON.parse(raw):raw;
  console.log('items', doc.items.length, 'published', doc.items.filter(i=>i.published).length);
  console.log('sample', doc.items[0].id, doc.items[0].zh);
});
"
```

Expected: `items` ≈ 28、全部 published；id 如 `m_coffee_americano`。

- [ ] **Step 3: 再開一次「不加 FORCE」確認不覆寫**

（可先在後台改一個價，重啟不加旗標，確認價格仍在。）

- [ ] **Step 4: Commit**

```bash
git add public/menu-data.js
git commit -m "docs(menu): 更新 menu-data seed 註解（全發布／FORCE 旗標）"
```

---

## Spec coverage checklist

| Spec 要求 | Task |
|-----------|------|
| migrate 自動 seed | Task 2 |
| 全部 published:true | Task 1 `buildMenuSeedDoc` |
| 穩定 id | Task 1 `stableMenuId` |
| 缺鍵才寫／FORCE 覆寫 | Task 1 `shouldWriteMenuSeed` + Task 2 |
| 驗證失敗 log 不中斷 | Task 2 |
| 更新 menu-data 註解 | Task 3 |
| `/space#menu` 顯示 | Task 3 驗收（既有前台） |
