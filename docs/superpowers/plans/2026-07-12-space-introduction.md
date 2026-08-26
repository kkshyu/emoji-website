# 空間介紹頁 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成三語空間介紹頁（1F–4F＋內嵌菜單＋後台可編正文／換圖）、對齊 CIS，並廢除獨立 `/menu`、順過導覽。

**Architecture:** 沿用 `site_content` 鍵值與既有 `/space` 頁；抽出 `lib/space-content.js` 負責鍵名、舊鍵 fallback、seed 文案；新增 admin 上傳寫入 `uploads/space/`；導覽／footer／301 清理 `/menu`。

**Tech Stack:** Node/Express、既有 `pg` + `site_content`、`marked`（CDN）、`MenuLib`、`multer`（新增）、`node:test`。

**Worktree:** `.worktrees/space-introduction`（branch `feature/space-introduction`）  
**Spec:** `docs/superpowers/specs/2026-07-12-space-introduction-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `lib/space-content.js` | 鍵常數、`resolveFloorMarkdown`、`resolveSpaceImage`、`SPACE_SEED`、`missingSpaceSeedKeys` |
| `lib/space-upload.js` | 安全檔名、MIME／大小檢查、寫入目錄（供測試） |
| `scripts/test-space-content.mjs` | 內容解析／seed 測試 |
| `scripts/test-space-upload.mjs` | 上傳驗證測試 |
| `scripts/test-layout.mjs` | 更新：nav 無 menu；space locale |
| `server.js` | seed on migrate；upload route；menu→space 301；static `/uploads` |
| `package.json` | 加 `multer` |
| `.gitignore` | `uploads/space/*` 例外保留 `.gitkeep` |
| `uploads/space/.gitkeep` | 目錄占位 |
| `views/partials/header-{zh,en,ja}.html` | 導覽順過 |
| `views/partials/footer-{zh,en,ja}.html` | 探索欄清理 |
| `public/space.html`、`public/en/space.html`、`public/ja/space.html` | 四樓、圖、`#menu`、CIS CSS |
| `public/admin.html` | 網站內容三語＋圖＋上傳 |
| `public/menu/**`、`public/en/menu/**`、`public/ja/menu/**` | 刪除 |
| `public/sitemap.xml` | 去 menu |
| `public/index.html`、`public/en/index.html`、`public/ja/index.html` | CTA 連 `/space` |
| `lib/layout.js` | 移除 menu trailing／`NAV_MENU_CURRENT`（或保留無害） |

---

### Task 1: `lib/space-content.js` + 測試

**Files:**
- Create: `lib/space-content.js`
- Create: `scripts/test-space-content.mjs`

- [ ] **Step 1: Write failing tests**

```js
// scripts/test-space-content.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  resolveFloorMarkdown,
  resolveSpaceImage,
  FLOORS,
  LANGS,
  spaceBodyKey,
  spaceImageKey,
  SPACE_SEED,
  missingSpaceSeedKeys,
} = require('../lib/space-content.js');

test('spaceBodyKey builds lang keys', () => {
  assert.equal(spaceBodyKey(1, 'zh'), 'space_1f_zh');
  assert.equal(spaceBodyKey(4, 'ja'), 'space_4f_ja');
});

test('resolveFloorMarkdown prefers lang key over legacy', () => {
  const c = { space_1f: '舊', space_1f_zh: '新' };
  assert.equal(resolveFloorMarkdown(c, 1, 'zh'), '新');
});

test('resolveFloorMarkdown falls back to legacy for zh only', () => {
  const c = { space_2f: 'legacy2' };
  assert.equal(resolveFloorMarkdown(c, 2, 'zh'), 'legacy2');
  assert.equal(resolveFloorMarkdown(c, 2, 'en'), '');
});

test('resolveSpaceImage returns trimmed url or empty', () => {
  assert.equal(resolveSpaceImage({ space_1f_image: ' /x.webp ' }, 1), '/x.webp');
  assert.equal(resolveSpaceImage({}, 1), '');
  assert.equal(resolveSpaceImage({ space_hero_image: 'https://cdn/h.jpg' }, 'hero'), 'https://cdn/h.jpg');
});

test('SPACE_SEED covers all floors and langs', () => {
  for (const f of FLOORS) {
    for (const lang of LANGS) {
      assert.ok(SPACE_SEED[spaceBodyKey(f, lang)], `${f} ${lang}`);
      assert.doesNotMatch(SPACE_SEED[spaceBodyKey(f, lang)], /旅館|hotel|住宿|過夜/i);
    }
  }
});

test('missingSpaceSeedKeys lists absent keys only', () => {
  const existing = { space_1f_zh: 'x' };
  const miss = missingSpaceSeedKeys(existing);
  assert.ok(miss.includes('space_1f_en'));
  assert.ok(!miss.includes('space_1f_zh'));
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /Users/kkshyu/Repos/taiwan-talent-hub/emoji-website/.worktrees/space-introduction
node --test scripts/test-space-content.mjs
```

Expected: FAIL (module missing)

- [ ] **Step 3: Implement `lib/space-content.js`**

```js
'use strict';

const FLOORS = [1, 2, 3, 4];
const LANGS = ['zh', 'en', 'ja'];

function spaceBodyKey(floor, lang) {
  return `space_${floor}f_${lang}`;
}

function spaceImageKey(floorOrHero) {
  if (floorOrHero === 'hero') return 'space_hero_image';
  return `space_${floorOrHero}f_image`;
}

function resolveFloorMarkdown(content, floor, lang) {
  const c = content || {};
  const primary = String(c[spaceBodyKey(floor, lang)] || '').trim();
  if (primary) return primary;
  if (lang === 'zh') return String(c[`space_${floor}f`] || '').trim();
  return '';
}

function resolveSpaceImage(content, floorOrHero) {
  const c = content || {};
  return String(c[spaceImageKey(floorOrHero)] || '').trim();
}

/** 顧客向短文；對齊 CIS 語氣；二樓禁用住宿用語。實作時可微調文句，但測試禁止禁用詞。 */
const SPACE_SEED = {
  space_1f_zh: `白天是明亮的日式簡餐與手沖咖啡，設外帶視窗；入夜燈光轉暖，成為深夜食堂與酒吧。

- 約 25 坪；內用約 20–30 席、長吧檯、外帶視窗
- 白日咖啡，入夜為酒
- 不用會員，一杯咖啡就是入場券`,
  space_1f_en: `By day: Japanese set meals and pour-over coffee, with a takeout window. After dark the lights warm — late-night shokudō and bar.

- About 25 ping; 20–30 seats, long counter, takeout window
- Open to everyone — a coffee is your ticket in`,
  space_1f_ja: `昼は明るい日式定食とハンドドリップ。テイクアウト窓口あり。夜は灯りを落とし、深夜食堂とバーへ。

- 約25坪、20〜30席、ロングカウンター
- 会員でなくても、一杯のコーヒーから`,
  space_2f_zh: `會員專屬樓層：人臉辨識進出。膠囊休憩席、淋浴、遊樂室（Switch、桌遊、麻將），也可包場聚會。

- 約 28 坪；休憩與遊樂分區、隔音加強
- 席位掃 QR 自助登記計時；非密閉、不可上鎖
- 僅供會員休憩與活動，非法規意義之住宿`,
  space_2f_en: `Members-only floor with face-entry access. Capsule rest berths, showers, and a play room (Switch, board games, mahjong) — also bookable for gatherings.

- About 28 ping; rest and play zones with stronger sound isolation
- QR check-in per berth; open berths, not lockable
- Member rest and recreation — not lodging`,
  space_2f_ja: `会員専用フロア。顔認証で入退室。カプセル休憩席、シャワー、遊戯室（Switch・ボードゲーム・麻雀）。貸切も可。

- 約28坪。休憩と遊戯を分け、遮音を強化
- 席ごとにQRで登記・計時。密閉不可・施錠不可
- 会員の休憩と交流のための空間であり、宿泊ではない`,
  space_3f_zh: `老屋斜屋頂與木樑下的共享辦公與活動場。桌椅可移，白天專心工作，晚上變成講座與社群活動。

- 約 28 坪；大投影、自助點心吧、充足插座與高速網路
- 可切分為小組討論區；包場另議`,
  space_3f_en: `Coworking and events under the old timber roof. Furniture moves for focus work by day and talks or community nights after hours.

- About 28 ping; large projection, snack bar, power and fast wifi
- Subdividable discussion zones; private hire available`,
  space_3f_ja: `古い斜屋根と木梁の下で、シェアオフィスとイベント。家具は動かせ、昼は集中、夜は講座やコミュニティの場に。

- 約28坪。大型投影、スナックバー、電源と高速回線
- 小組に分けられ、貸切も相談可`,
  space_4f_zh: `頂樓附屬支援：洗衣與戶外吸菸區。不計營收，只為全棟動線服務。

- 約 8 坪（含陽台）
- 洗衣機設於四樓，減少穿越三樓社群區
- 非會員至四樓採臨時通行控管`,
  space_4f_en: `Rooftop support: laundry and an outdoor smoking area. Not a revenue floor — it serves the whole building.

- About 8 ping including balcony
- Laundry upstairs to avoid cutting through the 3F community floor
- Non-members use temporary pass codes when needed`,
  space_4f_ja: `屋上の支援機能：洗濯と屋外喫煙スペース。売上計上なし。棟全体の動線のため。

- 約8坪（バルコニー含む）
- 洗濯機は4Fへ。3Fコミュニティを横切らない配置
- 非会員は一時通行で管理`,
};

function missingSpaceSeedKeys(existingContent) {
  const c = existingContent || {};
  const miss = [];
  for (const f of FLOORS) {
    for (const lang of LANGS) {
      const k = spaceBodyKey(f, lang);
      if (!String(c[k] || '').trim()) miss.push(k);
    }
  }
  return miss;
}

module.exports = {
  FLOORS,
  LANGS,
  spaceBodyKey,
  spaceImageKey,
  resolveFloorMarkdown,
  resolveSpaceImage,
  SPACE_SEED,
  missingSpaceSeedKeys,
};
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
node --test scripts/test-space-content.mjs
```

- [ ] **Step 5: Commit**

```bash
git add lib/space-content.js scripts/test-space-content.mjs
git commit -m "feat(space): 樓層文案鍵解析與三語 seed"
```

---

### Task 2: 上傳驗證 lib + multer 依賴

**Files:**
- Create: `lib/space-upload.js`
- Create: `scripts/test-space-upload.mjs`
- Modify: `package.json`（加 `multer`）
- Create: `uploads/space/.gitkeep`
- Modify: `.gitignore`

- [ ] **Step 1: Write failing tests**

```js
// scripts/test-space-upload.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { assertSpaceImageFile, buildSafeSpaceFilename } = require('../lib/space-upload.js');

test('assertSpaceImageFile accepts jpeg/png/webp under 5MB', () => {
  assert.equal(assertSpaceImageFile({ mimetype: 'image/jpeg', size: 1000 }), null);
  assert.equal(assertSpaceImageFile({ mimetype: 'image/png', size: 1000 }), null);
  assert.equal(assertSpaceImageFile({ mimetype: 'image/webp', size: 1000 }), null);
});

test('assertSpaceImageFile rejects bad type or size', () => {
  assert.match(assertSpaceImageFile({ mimetype: 'application/pdf', size: 100 }), /image/i);
  assert.match(assertSpaceImageFile({ mimetype: 'image/jpeg', size: 6 * 1024 * 1024 }), /5/);
});

test('buildSafeSpaceFilename keeps extension and sanitizes', () => {
  const n = buildSafeSpaceFilename('My Floor!!.PNG');
  assert.match(n, /\.png$/);
  assert.doesNotMatch(n, /[!/]/);
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement + install**

```js
// lib/space-upload.js
'use strict';
const path = require('path');
const crypto = require('crypto');

const MAX_BYTES = 5 * 1024 * 1024;
const OK = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

function assertSpaceImageFile(file) {
  if (!file || !OK.has(file.mimetype)) return 'Only JPEG, PNG, or WebP images are allowed.';
  if (Number(file.size) > MAX_BYTES) return 'Image must be 5MB or smaller.';
  return null;
}

function buildSafeSpaceFilename(originalName, mimetype) {
  const fromMime = EXT[mimetype] || '';
  const ext = fromMime || path.extname(originalName || '').toLowerCase() || '.bin';
  const stamp = Date.now().toString(36);
  const rand = crypto.randomBytes(4).toString('hex');
  return `space-${stamp}-${rand}${ext}`;
}

module.exports = { assertSpaceImageFile, buildSafeSpaceFilename, MAX_BYTES, OK_MIME: OK };
```

```bash
npm install multer@^1.4.5-lts.1
```

`.gitignore` 追加：

```
# 空間頁上傳（僅占位進版控）
uploads/space/*
!uploads/space/.gitkeep
```

建立空檔 `uploads/space/.gitkeep`。

- [ ] **Step 4: Tests PASS**

```bash
node --test scripts/test-space-upload.mjs
```

- [ ] **Step 5: Commit**

```bash
git add lib/space-upload.js scripts/test-space-upload.mjs package.json package-lock.json .gitignore uploads/space/.gitkeep
git commit -m "feat(space): 上傳圖驗證與 uploads 目錄"
```

---

### Task 3: Server — seed、upload API、`/uploads`、menu 301

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Wire seed after DB migrate**

在既有 migrate／seed 區塊（`seedBond` 附近）加入：

```js
const {
  SPACE_SEED, missingSpaceSeedKeys,
} = require('./lib/space-content');

async function seedSpaceContent() {
  const content = await readContent();
  const miss = missingSpaceSeedKeys(content);
  for (const key of miss) {
    const value = SPACE_SEED[key];
    if (!value) continue;
    await q(
      `INSERT INTO site_content (key,value,updated_at) VALUES ($1,$2,now())
       ON CONFLICT (key) DO NOTHING`,
      [key, value]
    );
  }
}
```

在啟動 migrate 成功後呼叫 `await seedSpaceContent()`（僅 DB 可用時）。

- [ ] **Step 2: Upload route + static**

```js
const multer = require('multer');
const fs = require('fs');
const {
  assertSpaceImageFile, buildSafeSpaceFilename,
} = require('./lib/space-upload');

const UPLOAD_SPACE_DIR = path.join(__dirname, 'uploads', 'space');
fs.mkdirSync(UPLOAD_SPACE_DIR, { recursive: true });

const spaceUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_SPACE_DIR),
    filename: (_req, file, cb) => cb(null, buildSafeSpaceFilename(file.originalname, file.mimetype)),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const err = assertSpaceImageFile({ mimetype: file.mimetype, size: 0 });
    cb(err ? new Error(err) : null, !err);
  },
});

app.post('/api/admin/upload/space', auth, adminOnly, (req, res) => {
  spaceUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const sizeErr = assertSpaceImageFile({ mimetype: req.file.mimetype, size: req.file.size });
    if (sizeErr) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({ error: sizeErr });
    }
    return res.json({ url: `/uploads/space/${req.file.filename}` });
  });
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
```

放置位置：其他 `/api/admin/*` 附近；`express.static(PUB)` **之前**掛 `/uploads`。

- [ ] **Step 3: Menu → space 301**

在 static 之前：

```js
function menuToSpace(req, res) {
  const lang = req.path.startsWith('/en/') ? 'en' : req.path.startsWith('/ja/') ? 'ja' : 'zh';
  const base = lang === 'zh' ? '/space' : `/${lang}/space`;
  res.redirect(301, `${base}#menu`);
}
app.get(['/menu', '/menu/', '/en/menu', '/en/menu/', '/ja/menu', '/ja/menu/'], menuToSpace);
```

- [ ] **Step 4: Smoke**

```bash
node -e "require('./lib/space-content'); require('./lib/space-upload'); require('multer'); console.log('ok')"
npm test
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add server.js package.json package-lock.json
git commit -m "feat(space): seed、上傳 API、menu 301"
```

---

### Task 4: 導覽與 footer 順過

**Files:**
- Modify: `views/partials/header-zh.html`、`header-en.html`、`header-ja.html`
- Modify: `views/partials/footer-zh.html`、`footer-en.html`、`footer-ja.html`
- Modify: `lib/layout.js`（`TRAILING_SLASH` 移除 `menu`；可移除 `NAV_MENU_CURRENT`）
- Modify: `scripts/test-layout.mjs`

- [ ] **Step 1: Update layout tests**

在 `scripts/test-layout.mjs`：

- `localePaths('/menu/')` 可改測 `/space` 三語映射（既有 member/space 測試保留；刪除或改寫依賴 menu trailing slash 的 assert）。
- 新增：

```js
test('header partials drop menu and floors system link', () => {
  for (const lang of ['zh', 'en', 'ja']) {
    const h = fs.readFileSync(path.join(__dirname, '..', 'views', 'partials', `header-${lang}.html`), 'utf8');
    assert.doesNotMatch(h, /href="[^"]*\/menu/);
    assert.doesNotMatch(h, /#floors/);
    assert.match(h, /\/space/);
  }
});

test('composeLayout space page marks space current', () => {
  const raw = `<!doctype html><body>${MARKER_HEADER}<main></main>${MARKER_FOOTER}</body>`;
  const html = composeLayout(raw, '/space');
  assert.match(html, /href="\/space"[^>]*aria-current="page"/);
  assert.doesNotMatch(html, /NAV_MENU_CURRENT|\/menu\//);
});
```

- [ ] **Step 2: Run — expect FAIL** on new header asserts

- [ ] **Step 3: Edit headers**

中文目標結構（en／ja 對應翻譯與路徑）：

```html
<a href="/#about">關於聚落</a>
<a href="/space"{{NAV_SPACE_CURRENT}}>空間介紹</a>
<!-- 聚落計畫 dropdown 不變 -->
<a href="/cis/"{{NAV_CIS_CURRENT}}>企業識別</a>
<a href="/member" ...>會員登入</a>
<!-- lang + IG -->
```

刪除：`/#floors`「系統」、獨立「菜單」連結。

Footer「探索」：刪除或把「系統」改為 `/space`；無菜單項則不新增。

`lib/layout.js`：`TRAILING_SLASH = new Set(['cis'])`；可刪 `NAV_MENU_CURRENT` 行，並從 header 移除該 placeholder（若仍留著 fill 無妨）。`localePaths` 中 `menu` 分支可保留以利 301 前偶發路徑，或簡化只留 `space`/`member`。

- [ ] **Step 4: `npm test` PASS**

- [ ] **Step 5: Commit**

```bash
git add views/partials lib/layout.js scripts/test-layout.mjs
git commit -m "feat(nav): 空間為主，移除菜單與系統錨點"
```

---

### Task 5: 刪除 `/menu` 靜態頁 + sitemap／首頁 CTA

**Files:**
- Delete: `public/menu/`、`public/en/menu/`、`public/ja/menu/`
- Modify: `public/sitemap.xml`
- Modify: `public/index.html`、`public/en/index.html`、`public/ja/index.html`（hero／floors CTA → `/space`）

- [ ] **Step 1: Remove menu directories**

```bash
rm -rf public/menu public/en/menu public/ja/menu
```

- [ ] **Step 2: Sitemap** — 刪除所有 `.../menu` `<url>` 區塊；保留 `/space`、`/en/space`、`/ja/space`。

- [ ] **Step 3: Homepage CTAs**

將如 `href="#floors"` 的「探索三層空間」類按鈕改為：

- zh: `href="/space"`
- en: `href="/en/space"`
- ja: `href="/ja/space"`

`#floors` section 本體保留（spec：摘要保留）。

- [ ] **Step 4: Commit**

```bash
git add -A public/menu public/en/menu public/ja/menu public/sitemap.xml public/index.html public/en/index.html public/ja/index.html
git commit -m "chore: 廢除 /menu 靜態頁並更新 sitemap／CTA"
```

---

### Task 6: 前台空間頁（三語）— 結構、圖、菜單、CIS

**Files:**
- Modify: `public/space.html`、`public/en/space.html`、`public/ja/space.html`

- [ ] **Step 1: 統一區塊與錨點**

順序：Hero（可插 `#hero-image`）→ `#f1` → `#menu` → `#f2` → `#f3` → `#f4`。

每樓：

```html
<section class="floor-section" id="f2">
  <div class="wrap">
    <div class="floor-header">...</div>
    <figure class="floor-media" id="media-2f" hidden></figure>
    <div class="md-content" id="render-2f">...</div>
  </div>
</section>
```

菜單：`id="menu"`（不要 `menu-section`）。

頁內跳轉（可選，放 hero 下）：

```html
<nav class="space-jump" aria-label="樓層">
  <a href="#f1">1F</a><a href="#menu">Menu</a><a href="#f2">2F</a><a href="#f3">3F</a><a href="#f4">4F</a>
</nav>
```

- [ ] **Step 2: CIS CSS 修正**

- 只用 `var(--ink)` `var(--paper)` `var(--accent)` `var(--line)` 等全站變數。
- 樓層號：Cormorant（`var(--latin)`）；**黃字勿搭配搶眼 text-shadow 搶第二擊**——改為墨色大號數字，或單次黃底墨字徽章。
- 避免多層陰影、卡片牆、紫光。
- 圖片：`floor-media img { width:100%; height:auto; display:block; }`，余白用 padding／border `var(--line)`。

- [ ] **Step 3: 讀取腳本**

```js
var lang = document.documentElement.lang.indexOf('ja') === 0 ? 'ja'
  : document.documentElement.lang.indexOf('en') === 0 ? 'en' : 'zh';
var emptyMsg = { zh: '準備中...', en: 'Coming soon…', ja: '準備中…' }[lang];

function setImg(slotId, url, alt) {
  var el = document.getElementById(slotId);
  if (!el) return;
  if (!url) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.innerHTML = '<img src="' + esc(url) + '" alt="' + esc(alt) + '" loading="lazy">';
}

fetch('/api/public').then(...).then(function (d) {
  var c = d.content || {};
  function body(floor) {
    var k = 'space_' + floor + 'f_' + lang;
    var t = (c[k] || '').trim();
    if (!t && lang === 'zh') t = (c['space_' + floor + 'f'] || '').trim();
    return t;
  }
  [1,2,3,4].forEach(function (f) {
    var md = body(f);
    document.getElementById('render-' + f + 'f').innerHTML =
      md ? marked.parse(md) : '<p class="menu-empty">' + emptyMsg + '</p>';
    setImg('media-' + f + 'f', (c['space_' + f + 'f_image'] || '').trim(), f + 'F');
  });
  setImg('media-hero', (c.space_hero_image || '').trim(), '');
  // menu via MenuLib → #render-menu inside #menu
});
```

靜態標題示例：

| | zh | en | ja |
|--|----|----|-----|
| 1F | Emoji · Café & Bar | Emoji · Café & Bar | Emoji · Café & Bar |
| 2F | Member Plaza 會員休憩 | Member Plaza | メンバープラザ |
| 3F | Talent Lounge 共享辦公 | Talent Lounge | タレントラウンジ |
| 4F | 支援樓層 | Support floor | サポートフロア |

二樓文案／標題避免 hotel／住宿用詞。

- [ ] **Step 4: 手動 CIS 三秒檢核**（手機寬＋桌面）：焦點清楚、留白、黃至多一擊、無禁用詞。

- [ ] **Step 5: Commit**

```bash
git add public/space.html public/en/space.html public/ja/space.html
git commit -m "feat(space): 四樓、換圖、菜單錨點與 CIS 版式"
```

---

### Task 7: 後台「網站內容」三語＋換圖

**Files:**
- Modify: `public/admin.html`

- [ ] **Step 1: Expand `tabContent`**

結構（示意）：

```js
function floorFields(c, floor, label) {
  return `
  <fieldset class="a-space-floor">
    <legend>${label}</legend>
    <label>中文<textarea id="ct-space-${floor}f-zh" rows="5">${esc(c['space_'+floor+'f_zh']||c['space_'+floor+'f']||'')}</textarea></label>
    <label>English<textarea id="ct-space-${floor}f-en" rows="5">${esc(c['space_'+floor+'f_en']||'')}</textarea></label>
    <label>日本語<textarea id="ct-space-${floor}f-ja" rows="5">${esc(c['space_'+floor+'f_ja']||'')}</textarea></label>
    <label>主圖 URL<input id="ct-space-${floor}f-image" value="${esc(c['space_'+floor+'f_image']||'')}"></label>
    <input type="file" accept="image/jpeg,image/png,image/webp" data-space-upload="${floor}f">
    <img class="a-space-preview" id="prev-space-${floor}f" alt="" ${c['space_'+floor+'f_image']?`src="${esc(c['space_'+floor+'f_image'])}"`:''}>
  </fieldset>`;
}
```

另加 hero 圖欄位。4F legend 加「支援機能」。hint 寫明 Markdown＋CIS 禁用住宿用語。

- [ ] **Step 2: Save handler**

`ct-save` 對每個鍵 `POST /api/admin/content`：`space_{n}f_{zh|en|ja}`、`space_{n}f_image`、`space_hero_image`、`home_notice`。

- [ ] **Step 3: Upload wiring**

```js
document.querySelectorAll('[data-space-upload]').forEach((input) => {
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch('/api/admin/upload/space', { method: 'POST', body: fd, headers: { Authorization: 'Bearer ' + token } });
    // 依專案既有 api() 慣例帶 auth
    const j = await r.json();
    if (!r.ok) return alert(j.error || 'upload failed');
    const key = input.getAttribute('data-space-upload'); // 'hero' | '1f' | ...
    const urlInput = document.getElementById(key === 'hero' ? 'ct-space-hero-image' : `ct-space-${key}-image`);
    urlInput.value = j.url;
    const prev = document.getElementById(key === 'hero' ? 'prev-space-hero' : `prev-space-${key}`);
    if (prev) { prev.src = j.url; prev.hidden = false; }
  });
});
```

（實作時對齊 `admin.html` 現有 `api()`／token 寫法，勿發明第二套 auth。）

- [ ] **Step 4: 菜單分頁文案** — `/menu` →「空間頁 `#menu`」。

- [ ] **Step 5: Commit**

```bash
git add public/admin.html
git commit -m "feat(admin): 空間三語正文與換圖上傳"
```

---

### Task 8: 驗收

- [ ] **Step 1: 全測**

```bash
npm test
```

Expected: 全部 PASS（含新 space 測試）。

- [ ] **Step 2: 手動清單**

1. 開 `/space`：四樓＋菜單區；無圖不破圖。
2. `/en/space`、`/ja/space` 語系正文。
3. `/menu` → 301 到空間頁。
4. 導覽無「菜單」「系統」；空間介紹 `aria-current`。
5. 後台改一句中文、上傳一張圖 → 前台刷新可見。
6. CIS 三秒檢核（桌面＋手機）。

- [ ] **Step 3: Final commit if needed**（文案／CSS 微調）

```bash
git status
# 若有修正：
git add -A && git commit -m "fix(space): 驗收微調"
```

---

## Spec coverage checklist

| Spec 項 | Task |
|---------|------|
| 1F–4F + `#menu` 順序 | 6 |
| 三語 body keys + legacy fallback | 1, 6, 7 |
| 圖片 keys + 上傳／URL | 2, 3, 6, 7 |
| Seed 營運計畫／CIS 語氣 | 1, 3 |
| 廢 `/menu` + 301 | 3, 5 |
| Nav／footer 順過 | 4 |
| CIS 視覺／禁用詞 | 1, 6, 8 |
| 首頁 CTA → space | 5 |
| Admin 可編 | 7 |

## Self-review notes

- 無 TBD；上傳上限 5MB 與 spec 一致。
- `multer` 為新依賴，Task 2 安裝。
- Redirect 帶 `#menu`：Express `res.redirect` 可帶 hash；若客戶端丟棄 hash，至少進 `/space`（spec 已註明）。
