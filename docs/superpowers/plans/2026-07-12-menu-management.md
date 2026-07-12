# 菜單管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 後台可對菜單 CRUD 並持久化至 `site_content.menu`；前台 `/menu` 與 IG 產生器共用同一資料源（僅前台顯示 `published:true`）。

**Architecture:** 純函式庫正規化／驗證 JSON document；後台分頁整包讀寫既有 `POST /api/admin/content`；公開頁打 `/api/public` 過濾發布項；IG 改讀 admin state 的 menu。Seed 來自 `menu-data.js`，預設全部 `published:false`。

**Tech Stack:** Express + PostgreSQL `site_content`、vanilla admin.html、靜態 `/menu`、Node `node:test`。

**Spec:** `docs/superpowers/specs/2026-07-12-menu-management-design.md`

---

## File map

| 檔案 | 職責 |
|---|---|
| `public/menu-lib.js` | parse／normalize／validate／CRUD helpers／seed 轉換（IIFE → `window.MenuLib`） |
| `scripts/test-menu-lib.mjs` | node:test |
| `public/menu-data.js` | 僅 seed 原料（註明用途） |
| `public/admin.html` | 「菜單」分頁 UI + 存檔 |
| `public/menu/index.html` | 前台價目頁 |
| `public/ig-studio.js` | 讀 `content.menu` |
| `build_nav.py` + 跑產生器 | 導覽加「菜單」 |
| `public/sitemap.xml` | 加 `/menu` |
| `server.js`（可選） | migrate 時若無 menu 鍵則 seed |

## Global constraints

- 不新建 DB table；只用 `key=menu`。
- Seed 預設 `published: false`。
- `cat==='ALCOHOL'` 或 note 含「含酒精」→ `alcohol: true`。
- CIS 前台：墨／紙／唯一黃、明體標題；酒類附警語。
- 每個 Task 結束 commit；不 push 除非使用者要求。
- 工作目錄：專用 worktree（建議 `.tth-worktrees/menu-management` 自最新 main）。

---

### Task 1: MenuLib + 測試

**Files:**
- Create: `public/menu-lib.js`
- Create: `scripts/test-menu-lib.mjs`

- [ ] **Step 1: 寫失敗測試**

```js
// scripts/test-menu-lib.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const code = fs.readFileSync(new URL('../public/menu-lib.js', import.meta.url), 'utf8');
const window = {};
vm.runInNewContext(code, { window, console });
const M = window.MenuLib;

test('CATS includes SNACK', () => {
  assert.ok(M.CATS.includes('SNACK'));
  assert.ok(M.CATS.includes('COFFEE'));
});

test('normalizeItem forces alcohol for ALCOHOL cat', () => {
  const it = M.normalizeItem({ cat: 'ALCOHOL', zh: '啤酒', price: 200, emo: 150, alcohol: false });
  assert.equal(it.alcohol, true);
  assert.equal(it.published, false); // default
  assert.ok(it.id);
});

test('normalizeItem note 含酒精 → alcohol', () => {
  const it = M.normalizeItem({ cat: 'COFFEE', zh: '愛爾蘭', note: '含酒精', price: 1, emo: 1 });
  assert.equal(it.alcohol, true);
});

test('parseMenuDoc empty → empty items', () => {
  const doc = M.parseMenuDoc('');
  assert.equal(doc.version, 1);
  assert.deepEqual(doc.items, []);
});

test('parseMenuDoc invalid JSON throws or returns empty', () => {
  const doc = M.parseMenuDoc('{not json');
  assert.deepEqual(doc.items, []);
});

test('validateDoc rejects empty zh', () => {
  const r = M.validateDoc({
    version: 1, items: [{ id: 'x', cat: 'FOOD', zh: '', en: '', price: 1, emo: 1, alcohol: false, published: false, sort: 0 }],
  });
  assert.equal(r.ok, false);
});

test('validateDoc accepts valid', () => {
  const item = M.normalizeItem({ cat: 'FOOD', zh: '薯條', en: 'FRIES', price: 180, emo: 150 });
  const r = M.validateDoc({ version: 1, items: [item] });
  assert.equal(r.ok, true);
});

test('upsertItem insert and update', () => {
  let doc = { version: 1, items: [] };
  doc = M.upsertItem(doc, { cat: 'FOOD', zh: '水餃', price: 200, emo: 180 });
  assert.equal(doc.items.length, 1);
  const id = doc.items[0].id;
  doc = M.upsertItem(doc, { id, cat: 'FOOD', zh: '實力水餃', price: 200, emo: 180 });
  assert.equal(doc.items.length, 1);
  assert.equal(doc.items[0].zh, '實力水餃');
});

test('removeItem', () => {
  let doc = { version: 1, items: [M.normalizeItem({ cat: 'FOOD', zh: 'A', price: 1, emo: 1 })] };
  const id = doc.items[0].id;
  doc = M.removeItem(doc, id);
  assert.equal(doc.items.length, 0);
});

test('publishedOnly', () => {
  const a = M.normalizeItem({ cat: 'FOOD', zh: 'A', price: 1, emo: 1, published: true });
  const b = M.normalizeItem({ cat: 'FOOD', zh: 'B', price: 1, emo: 1, published: false });
  assert.equal(M.publishedOnly({ items: [a, b] }).length, 1);
});

test('fromSeedRows maps legacy rows', () => {
  const rows = [{ cat: 'COFFEE', zh: '美式', en: 'AMERICANO', price: 170, emo: 150 }];
  const doc = M.fromSeedRows(rows);
  assert.equal(doc.items[0].published, false);
  assert.equal(doc.items[0].zh, '美式');
});
```

- [ ] **Step 2: 跑測確認失敗**

Run: `node --test scripts/test-menu-lib.mjs`  
Expected: FAIL（無檔或無 exports）

- [ ] **Step 3: 實作 `public/menu-lib.js`**

```js
'use strict';
(function (global) {
  const CATS = ['COFFEE', 'BEVERAGE', 'ALCOHOL', 'FOOD', 'SNACK'];
  const uid = () => 'm_' + Math.random().toString(36).slice(2, 10);

  function coerceAlcohol(item) {
    if (item.cat === 'ALCOHOL') return true;
    if (item.note && String(item.note).includes('酒精')) return true;
    return !!item.alcohol;
  }

  function normalizeItem(raw) {
    const cat = CATS.includes(raw.cat) ? raw.cat : 'FOOD';
    const price = Number(raw.price); const emo = Number(raw.emo);
    return {
      id: raw.id || uid(),
      cat,
      zh: String(raw.zh || '').trim(),
      en: String(raw.en || '').trim(),
      price: Number.isFinite(price) ? price : 0,
      emo: Number.isFinite(emo) ? emo : 0,
      note: String(raw.note || '').trim(),
      alcohol: coerceAlcohol({ ...raw, cat }),
      published: raw.published === true,
      sort: Number.isFinite(Number(raw.sort)) ? Number(raw.sort) : 0,
    };
  }

  function parseMenuDoc(value) {
    if (!value || !String(value).trim()) return { version: 1, updated_at: null, items: [] };
    try {
      const j = JSON.parse(value);
      const items = Array.isArray(j.items) ? j.items.map(normalizeItem) : [];
      return { version: Number(j.version) || 1, updated_at: j.updated_at || null, items };
    } catch {
      return { version: 1, updated_at: null, items: [] };
    }
  }

  function validateDoc(doc) {
    if (!doc || !Array.isArray(doc.items)) return { ok: false, error: '格式錯誤' };
    if (JSON.stringify(doc).length > 500000) return { ok: false, error: '菜單資料過大' };
    for (const it of doc.items) {
      if (!it.zh) return { ok: false, error: '品名（中）必填' };
      if (!CATS.includes(it.cat)) return { ok: false, error: '分類無效' };
      if (!(it.price >= 0) || !(it.emo >= 0)) return { ok: false, error: '價格無效' };
    }
    return { ok: true };
  }

  function touch(doc) {
    return { ...doc, version: doc.version || 1, updated_at: new Date().toISOString(), items: doc.items.slice() };
  }

  function upsertItem(doc, raw) {
    const item = normalizeItem(raw);
    const next = touch(doc);
    const i = next.items.findIndex(x => x.id === item.id);
    if (i >= 0) next.items[i] = item; else next.items.push(item);
    return next;
  }

  function removeItem(doc, id) {
    const next = touch(doc);
    next.items = next.items.filter(x => x.id !== id);
    return next;
  }

  function publishedOnly(doc) {
    return (doc.items || []).filter(x => x.published);
  }

  function fromSeedRows(rows) {
    const items = (rows || []).map((r, i) => normalizeItem({
      ...r,
      published: false,
      sort: (i + 1) * 10,
      alcohol: r.alcohol === true || r.cat === 'ALCOHOL' || (r.note && String(r.note).includes('酒精')),
    }));
    return touch({ version: 1, items });
  }

  function stringifyDoc(doc) {
    return JSON.stringify(doc);
  }

  function sortItems(items) {
    return items.slice().sort((a, b) => {
      const ca = CATS.indexOf(a.cat) - CATS.indexOf(b.cat);
      if (ca !== 0) return ca;
      return (a.sort - b.sort) || a.zh.localeCompare(b.zh, 'zh-Hant');
    });
  }

  global.MenuLib = {
    CATS, uid, normalizeItem, parseMenuDoc, validateDoc,
    upsertItem, removeItem, publishedOnly, fromSeedRows, stringifyDoc, sortItems, touch,
  };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: 測試全過**

`node --test scripts/test-menu-lib.mjs` → PASS

- [ ] **Step 5: Commit**

```bash
git add public/menu-lib.js scripts/test-menu-lib.mjs
git commit -m "$(cat <<'EOF'
feat(menu): 新增 MenuLib（正規化／驗證／CRUD helpers）

EOF
)"
```

---

### Task 2: 更新 seed `menu-data.js`

**Files:**
- Modify: `public/menu-data.js`

- [ ] **Step 1: 檔頭改為 seed 說明**

```js
/* 菜單 SEED 原料（僅供首次灌入 site_content.menu）。
   正式資料以資料庫為準；勿把此檔當現行對外菜單。
   灌入時全部 published:false。 */
```

- [ ] **Step 2: 修正 `COCA LATTE` → `COCOA LATTE`；為每列加 `alcohol` 布林**（與 Task 1 coerce 規則一致）。不虛構 SNACK 列。

- [ ] **Step 3: `node --check public/menu-data.js`**

- [ ] **Step 4: Commit**

```bash
git add public/menu-data.js
git commit -m "$(cat <<'EOF'
chore(menu): seed 檔標註用途並修正 COCOA／alcohol

EOF
)"
```

---

### Task 3: 後台「菜單」分頁 CRUD

**Files:**
- Modify: `public/admin.html`
- Depends: load `/menu-lib.js` and `/menu-data.js`（可與 IG 腳本一併在登入後載入，或於 admin 靜態載入 menu-lib + menu-data）

- [ ] **Step 1: 載入腳本**

在 `admin.html` 於既有 script 區加入（若尚未延遲載入策略，可先同步載入）：
```html
<script src="/menu-lib.js"></script>
<script src="/menu-data.js"></script>
```

- [ ] **Step 2: 解析／確保 doc**

```js
function menuDocFromState(d) {
  const raw = (d.content && d.content.menu) || '';
  let doc = MenuLib.parseMenuDoc(raw);
  if (!doc.items.length && window.MENU_DATA) {
    doc = MenuLib.fromSeedRows(window.MENU_DATA);
  }
  return doc;
}
```

首次若 DB 空：畫面顯示 seed 資料並提示「尚未存入資料庫，按儲存以灌入」。

- [ ] **Step 3: `tabMenu(d)` UI**

結構：
- 提示：未發布不上前台
- 搜尋 input
- 表格：分類／中文／英文／原價／會員／酒精／發布／操作（編輯／刪除）
- 表單區：新增或編輯（cat select、zh、en、price、emo、note、alcohol checkbox、published checkbox、sort）
- 按鈕：儲存表單、取消編輯、**儲存至伺服器**（整包）

列表用 `MenuLib.sortItems(doc.items)`。

- [ ] **Step 4: TABS 註冊**

```js
{ id:'menu', label:'菜單', render: tabMenu },
```
放在 `ig` 與 `content` 附近。

- [ ] **Step 5: bind 邏輯**

```js
// 模組級 let MENU_DOC = null; 在 render 時初始化
on('menu-save-server','click', () => {
  const v = MenuLib.validateDoc(MENU_DOC);
  if (!v.ok) return toast(v.error);
  doThen(() => api('/admin/content', {
    method: 'POST',
    body: { key: 'menu', value: MenuLib.stringifyDoc(MENU_DOC) },
  }), '菜單已儲存');
});
// upsert／delete 只改 MENU_DOC 並 re-render 分頁 DOM（或整頁 refresh 前先寫入暫存）
```

實作細節：因 `render()` 會重建 DOM，建議把 `MENU_DOC` 放在 `admin.html` 外層閉包變數；`tabMenu` 讀它；編輯操作更新後呼叫局部 `paintMenu()` 或 `render(DATA)`（若 render 會重抓 state，存檔後用 refresh）。

推薦流程：
1. 記憶體編輯 MENU_DOC  
2. 「儲存至伺服器」才 POST  
3. 成功 `refresh()`

刪除：`confirm` 後 `MENU_DOC = MenuLib.removeItem(MENU_DOC, id)`。

- [ ] **Step 6: 手動驗收**

登入後台 → 菜單 → 新增一筆 → 儲存至伺服器 → 重整仍在 → 刪除成功。

- [ ] **Step 7: Commit**

```bash
git add public/admin.html
git commit -m "$(cat <<'EOF'
feat(admin): 菜單分頁 CRUD（site_content.menu）

EOF
)"
```

---

### Task 4: 前台 `/menu` 頁

**Files:**
- Create: `public/menu/index.html`

- [ ] **Step 1: 建立頁面骨架**

沿用站內 CIS：`/style.css`、`/nav.css`、`/nav.js`、site-nav header（可先手寫一版 nav，Task 5 再跑 `build_nav.py`）、footer 模式參考 `cis/index.html` 簡化。

- [ ] **Step 2: 載入並渲染**

```html
<script src="/menu-lib.js"></script>
<script>
fetch('/api/public').then(r => r.json()).then(data => {
  const doc = MenuLib.parseMenuDoc((data.content && data.content.menu) || '');
  const items = MenuLib.sortItems(MenuLib.publishedOnly(doc));
  const root = document.getElementById('menu-root');
  if (!items.length) {
    root.innerHTML = '<p class="menu-empty">菜單準備中</p>';
    return;
  }
  // 依 cat 分組輸出；alcohol 列加標記；頁尾或 ALCOHOL 區塊加警語
}).catch(() => {
  document.getElementById('menu-root').textContent = '菜單載入失敗';
});
</script>
```

警語文案：
```html
<p class="menu-alcohol-note">未滿十八歲禁止飲酒。禁止酒駕。</p>
```
當任一 `alcohol` 品項可見時顯示。

- [ ] **Step 3: 視覺**

分類小標 uppercase letter-spacing；品名明體；價格 Cormorant；點線或 space-between 價列。唯一黃僅作極小點綴（菱形／底線一擊）。

- [ ] **Step 4: 本地驗證**

`curl -s http://localhost:8091/menu/ | head`  
有 DB 且無發布項 → 「菜單準備中」。後台發布一項後重整可見。

- [ ] **Step 5: Commit**

```bash
git add public/menu/index.html
git commit -m "$(cat <<'EOF'
feat(menu): 前台／menu 價目頁（只顯示已發布）

EOF
)"
```

---

### Task 5: 導覽 + sitemap

**Files:**
- Modify: `build_nav.py`
- Create: `public/menu/index.html` 若需可被 FILES 收錄（僅 zh）
- Run: `python3 build_nav.py`
- Modify: `public/sitemap.xml`

- [ ] **Step 1: 擴充 `build_nav.py`**

在 `L` 各語加 `menu` 標籤：
- zh: `menu='菜單'`
- en: `menu='Menu'`
- ja: `menu='メニュー'`

在 `build()` 的 CIS 連結前或後插入：
```python
menu_href = (base + '/menu/') if base else '/menu/'
# 首版：en/ja 也指向同一 /menu/（內容 zh）；或 en/ja 用 menu_href = '/menu/'
menu_ac = ' aria-current="page"' if ptype=='menu' else ''
# <a href="{menu_href}"{menu_ac}>{d['menu']}</a>
```

`FILES` 加：
```python
'menu/index.html': ('zh','menu'),
```

`lang_target`：若 `ptype=='menu'` 各語暫回 `/menu/`（同頁）。

- [ ] **Step 2: 跑產生器**

```bash
python3 build_nav.py
```
Expected: 含 `menu/index.html` 與既有頁更新。

- [ ] **Step 3: sitemap**

在 `sitemap.xml` 加：
```xml
  <url>
    <loc>https://www.emoji.tw/menu</loc>
    <lastmod>2026-07-12</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
```

- [ ] **Step 4: Commit**

```bash
git add build_nav.py public/sitemap.xml public/menu/index.html public/*/index.html public/index.html public/en public/ja
# 只 stage 實際被 nav 改到的檔
git commit -m "$(cat <<'EOF'
feat(nav): 全站導覽與 sitemap 加入菜單

EOF
)"
```

---

### Task 6: IG 產生器改讀 DB menu

**Files:**
- Modify: `public/ig-studio.js`
- Modify: `public/admin.html`（確保 IG 掛載前 MENU 來源正確）

- [ ] **Step 1: 提供解析函式**

在 `admin.html` 的 `bind`／IG mount 前：
```js
window.MENU_DATA = MenuLib.sortItems(
  MenuLib.parseMenuDoc((d.content && d.content.menu) || '').items
);
if (!window.MENU_DATA.length && Array.isArray(window.__MENU_SEED)) {
  window.MENU_DATA = MenuLib.fromSeedRows(window.__MENU_SEED).items;
}
```

將 `menu-data.js` 改掛 `window.__MENU_SEED = [...]`（或保留 `MENU_DATA` 作 seed，admin 覆寫 `MENU_DATA` 為 DB 資料）。

推薦：
```js
// menu-data.js
window.__MENU_SEED = [ ... ];
```
admin／IG：
```js
const fromDb = MenuLib.parseMenuDoc(d.content?.menu || '').items;
window.MENU_DATA = fromDb.length ? MenuLib.sortItems(fromDb) : MenuLib.fromSeedRows(window.__MENU_SEED || []).items;
```

- [ ] **Step 2: IG 下拉標示未發布**

```js
`<option value="${i}">${H(m.cat)}｜${H(m.zh)} $${m.price}${m.published ? '' : '（未發布）'}</option>`
```

- [ ] **Step 3: 酒精用 `m.alcohol`**

與 `IGStudioLib.itemNeedsAlcoholBand(m)` 對接（若 IG v2 lib 已存在）。

- [ ] **Step 4: Commit**

```bash
git add public/menu-data.js public/admin.html public/ig-studio.js
git commit -m "$(cat <<'EOF'
feat(ig-studio): 菜單下拉改讀 site_content.menu

EOF
)"
```

---

### Task 7:（可選）server migrate seed

**Files:**
- Modify: `server.js`

僅當希望「空庫自動有 seed」時做；否則 Task 3 前端提示存檔即可。

- [ ] **Step 1:** 在 `migrate()` 末尾：

```js
const menuRow = (await q(`SELECT value FROM site_content WHERE key='menu'`)).rows[0];
if (!menuRow) {
  // 勿在 server 依賴瀏覽器 MENU_DATA；改內嵌最小 seed 或 fs.readFileSync public/menu-data 不安全。
  // 建議：跳過 server seed，只靠後台首次儲存。
}
```

**本計畫預設跳過 server seed**（避免 Node 解析瀏覽器 IIFE）。若實作，改為在 `scripts/seed-menu.mjs` 用 MenuLib + pg client 一次灌入。

- [ ] **Step 2:** 若跳過：本 Task 標成 cancelled，不 commit。

---

### Task 8: 端對端驗收

- [ ] **Step 1:** `node --test scripts/test-menu-lib.mjs` → PASS  
- [ ] **Step 2:** 後台 CRUD 持久化  
- [ ] **Step 3:** 未發布不上 `/menu`；發布後出現  
- [ ] **Step 4:** 酒類前台警語 + IG 可選該項  
- [ ] **Step 5:** 空發布 →「菜單準備中」  
- [ ] **Step 6:** 修補 commit（若有）

---

## Spec coverage

| Spec | Task |
|---|---|
| MenuLib 模型／驗證 | 1 |
| Seed published:false | 1, 2, 3 |
| 後台 CRUD | 3 |
| 前台 /menu | 4 |
| Nav／sitemap | 5 |
| IG 共用資料 | 6 |
| 驗收 | 8 |

## Placeholder scan

無 TBD；Task 7 明確可跳過。
