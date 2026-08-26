# 消費方式頁（`/system`）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增三語 `/system` 消費方式頁（現金／會籍／點數／包場），導覽掛上「消費方式／SYSTEM／システム」，並把首頁 `#floors` 改寫成雙入口橋接。

**Architecture:** 靜態 HTML 比照 `/about`／`/space`：`public/system.html`＋`en/`＋`ja/`，經 `<!--SITE_HEADER-->`／`<!--SITE_FOOTER-->` 與 `lib/layout.js` 組裝。價目靜態寫死（核定價）。首頁橋接保留 `id="floors"` 僅作錨點相容，內容改為兩卡 CTA。

**Tech Stack:** 既有 Express layout middleware、`node:test`（`scripts/test-layout.mjs`）、`style.css`／`nav.css`、可選 `system.css`。

**Spec:** `docs/superpowers/specs/2026-07-12-system-page-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `lib/layout.js` | `localePaths` 辨識 `system`；注入 `NAV_SYSTEM_CURRENT` |
| `scripts/test-layout.mjs` | system 路由、nav／footer、首頁橋接、sitemap、法遵詞 |
| `views/partials/header-{zh,en,ja}.html` | 導覽：關於 → **消費方式** → 空間 → 計畫… |
| `views/partials/footer-{zh,en,ja}.html` | 探索欄加 `/system` |
| `public/system.css` | system 頁版面（總覽格、價目表、區段節奏） |
| `public/system.html` | 中文消費方式頁 |
| `public/en/system.html` | English SYSTEM |
| `public/ja/system.html` | 日本語 システム |
| `public/index.html`、`en/index.html`、`ja/index.html` | `#floors` 改雙入口；JSON-LD Offer.url → `/system` |
| `public/sitemap.xml` | 加入三語 `/system` |
| `build_nav.py` | 同步標籤與 href（避免舊腳本覆寫）；`floors`→`system` 連 `/system` |

---

### Task 1: `layout.js` 支援 `/system` + 測試

**Files:**
- Modify: `lib/layout.js`
- Modify: `scripts/test-layout.mjs`

- [ ] **Step 1: 在 `test-layout.mjs` 追加失敗測試**

在既有 `localePaths maps member menu and space locales` 測試後新增：

```js
test('localePaths maps system locales', () => {
  assert.equal(localePaths('/system').slug, 'system');
  assert.equal(localePaths('/system').zh, '/system');
  assert.equal(localePaths('/en/system').en, '/en/system');
  assert.equal(localePaths('/ja/system').ja, '/ja/system');
  assert.equal(localePaths('/system.html').slug, 'system');
});

test('composeLayout system page marks system current', () => {
  const raw = `<!doctype html><body>${MARKER_HEADER}<main></main>${MARKER_FOOTER}</body>`;
  // 先改 partial 前此測會失敗於缺 NAV；Task 2 後才綠。此步只測 layout 變數：
  // 暫時用含 {{NAV_SYSTEM_CURRENT}} 的假字串驗證 fill——改測 localePaths 即可。
  assert.equal(localePaths('/system').slug, 'system');
});
```

並把現有測試改掉（目前要求 header **沒有** floors／system）：

```js
test('header partials include system link after about, before space', () => {
  const expect = {
    zh: { label: '消費方式', href: '/system' },
    en: { label: 'SYSTEM', href: '/en/system' },
    ja: { label: 'システム', href: '/ja/system' },
  };
  for (const lang of ['zh', 'en', 'ja']) {
    const h = fs.readFileSync(path.join(__dirname, '..', 'views', 'partials', `header-${lang}.html`), 'utf8');
    assert.doesNotMatch(h, /href="[^"]*\/menu/);
    assert.doesNotMatch(h, /#floors/);
    assert.match(h, /NAV_SYSTEM_CURRENT/);
    assert.match(h, new RegExp(`href="${expect[lang].href}"[^>]*>\\s*${expect[lang].label}`));
    assert.match(h, /\/space/);
    // 順序：about 出現在 system 之前，system 在 space 之前
    const iAbout = h.indexOf(lang === 'zh' ? '/about"' : `/${lang}/about"`);
    const iSys = h.indexOf(`href="${expect[lang].href}"`);
    const iSpace = h.indexOf(lang === 'zh' ? 'href="/space"' : `href="/${lang}/space"`);
    assert.ok(iAbout < iSys && iSys < iSpace, `${lang} nav order`);
  }
});
```

刪除或取代舊的：

```js
test('header partials drop menu and floors system link', () => { ... });
```

- [ ] **Step 2: 跑測試 — 預期 FAIL**

```bash
cd /Users/kkshyu/Repos/taiwan-talent-hub/emoji-website
node --test scripts/test-layout.mjs
```

Expected: FAIL（`NAV_SYSTEM_CURRENT`／localePaths 尚未支援，或 header 尚無連結）

- [ ] **Step 3: 修改 `lib/layout.js`**

在 `localePaths` 的 `normSlug` 正規化處，把 `system.html` 正規成 `system`（與 space／member 同列）：

```js
  const normSlug =
    slug === 'space.html' ? 'space'
    : slug === 'member.html' ? 'member'
    : slug === 'system.html' ? 'system'
    : slug === 'about.html' ? 'about'
    : slug;

  if (normSlug === 'space' || normSlug === 'menu' || normSlug === 'member' || normSlug === 'system' || normSlug === 'about') {
    return {
      lang,
      slug: normSlug,
      zh: pathFor('zh', normSlug),
      en: pathFor('en', normSlug),
      ja: pathFor('ja', normSlug),
    };
  }
```

在 `composeLayout` 的 `vars` 加：

```js
    NAV_SYSTEM_CURRENT: meta.slug === 'system' ? CURRENT : '',
```

- [ ] **Step 4: Commit layout 變更**（header 測試仍可能紅，等 Task 2）

```bash
git add lib/layout.js scripts/test-layout.mjs
git commit -m "$(cat <<'EOF'
feat(layout): 支援 /system 語系路徑與 NAV_SYSTEM_CURRENT

EOF
)"
```

---

### Task 2: Header／Footer 掛上消費方式

**Files:**
- Modify: `views/partials/header-zh.html`
- Modify: `views/partials/header-en.html`
- Modify: `views/partials/header-ja.html`
- Modify: `views/partials/footer-zh.html`
- Modify: `views/partials/footer-en.html`
- Modify: `views/partials/footer-ja.html`

- [ ] **Step 1: 更新三語 header**

在「關於」與「空間介紹」之間插入（zh 範例）：

```html
      <a href="/about"{{NAV_ABOUT_CURRENT}}>關於聚落</a>
      <a href="/system"{{NAV_SYSTEM_CURRENT}}>消費方式</a>
      <a href="/space"{{NAV_SPACE_CURRENT}}>空間介紹</a>
```

en：

```html
      <a href="/en/about"{{NAV_ABOUT_CURRENT}}>About</a>
      <a href="/en/system"{{NAV_SYSTEM_CURRENT}}>SYSTEM</a>
      <a href="/en/space"{{NAV_SPACE_CURRENT}}>Space</a>
```

ja：

```html
      <a href="/ja/about"{{NAV_ABOUT_CURRENT}}>ハブについて</a>
      <a href="/ja/system"{{NAV_SYSTEM_CURRENT}}>システム</a>
      <a href="/ja/space"{{NAV_SPACE_CURRENT}}>スペース</a>
```

（保留各語系既有 about／space 文案；僅插入 system 列。）

- [ ] **Step 2: 更新三語 footer「探索」**

zh：在空間介紹前或後加：

```html
        <a href="/system">消費方式</a>
```

en：`<a href="/en/system">SYSTEM</a>`  
ja：`<a href="/ja/system">システム</a>`

建議順序與 nav 一致：關於 → 消費方式 → 空間 → CIS → FAQ → 會員。

- [ ] **Step 3: 跑測試**

```bash
node --test scripts/test-layout.mjs
```

Expected: header／footer／localePaths 相關 PASS（system 頁結構測試若尚未寫檔可先 skip 或預期 FAIL 到 Task 3）

- [ ] **Step 4: Commit**

```bash
git add views/partials/header-*.html views/partials/footer-*.html
git commit -m "$(cat <<'EOF'
feat(nav): 導覽與 footer 加入消費方式／SYSTEM／システム

EOF
)"
```

---

### Task 3: `system.css` + 中文 `/system` 頁

**Files:**
- Create: `public/system.css`
- Create: `public/system.html`
- Modify: `scripts/test-layout.mjs`

- [ ] **Step 1: 追加頁面結構測試**

```js
test('system zh page structure', () => {
  const html = fs.readFileSync(path.join(PUB, 'system.html'), 'utf8');
  assert.match(html, /SITE_HEADER/);
  assert.match(html, /SITE_FOOTER/);
  assert.match(html, /system\.css/);
  assert.match(html, /id="overview"/);
  assert.match(html, /id="membership"/);
  assert.match(html, /id="points"/);
  assert.match(html, /id="booking"/);
  assert.match(html, /id="cafe"/);
  assert.match(html, /href="\/fellow"/);
  assert.match(html, /href="\/partner"/);
  assert.match(html, /href="\/space"/);
  assert.match(html, /NT\$\s*4,000|NT\$4,000/);
  assert.doesNotMatch(html, /旅館|hotel|住宿|過夜/i);
});

test('resolvePublicHtml resolves system zh', () => {
  assert.ok(resolvePublicHtml(PUB, '/system').endsWith('system.html'));
});

test('composeLayout system marks current', () => {
  const raw = `<!doctype html><body>${MARKER_HEADER}<main></main>${MARKER_FOOTER}</body>`;
  const html = composeLayout(raw, '/system');
  assert.match(html, /href="\/system"[^>]*aria-current="page"/);
});
```

- [ ] **Step 2: 跑測 — 預期 FAIL（缺檔）**

```bash
node --test scripts/test-layout.mjs
```

- [ ] **Step 3: 新增 `public/system.css`**

沿用全站變數，避免卡片牆與紫光。最小必要：

```css
/* system.css — 消費方式頁 */
.system-page { color: var(--ink); }
.system-hero { padding: clamp(72px, 12vw, 120px) 0 48px; }
.system-hero .lede { max-width: 36em; color: var(--muted); font-size: 1.05rem; line-height: 1.7; }
.system-section { padding: 56px 0; border-top: 1px solid color-mix(in srgb, var(--ink) 12%, transparent); }
.system-section .sec-head { margin-bottom: 28px; }
.system-modes {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 18px;
}
.system-mode h3 { font-family: var(--serif); font-size: 1.15rem; margin: 0 0 8px; }
.system-mode p { margin: 0; color: var(--muted); font-size: .92rem; line-height: 1.6; }
.system-table { width: 100%; border-collapse: collapse; font-size: .95rem; }
.system-table th,
.system-table td {
  text-align: left;
  padding: 12px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--ink) 12%, transparent);
  vertical-align: top;
}
.system-table th { font-weight: 500; color: var(--muted); font-size: .78rem; letter-spacing: .12em; text-transform: uppercase; }
.system-price { font-family: var(--latin); font-weight: 600; white-space: nowrap; }
.system-note { margin-top: 16px; color: var(--muted); font-size: .9rem; line-height: 1.65; }
.system-actions { margin-top: 22px; display: flex; flex-wrap: wrap; gap: 12px; }
@media (max-width: 900px) {
  .system-modes { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 560px) {
  .system-modes { grid-template-columns: 1fr; }
  .system-table { display: block; overflow-x: auto; }
}
```

- [ ] **Step 4: 新增 `public/system.html`（完整結構）**

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<script>document.documentElement.className='js'</script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#1B1A17">
<title>消費方式 · 言文字｜台灣人才聚落</title>
<meta name="description" content="言文字｜台灣人才聚落消費方式：一樓現金單點、會籍方案、點數兌換與包場規則。">
<link rel="canonical" href="https://www.emoji.tw/system">
<link rel="alternate" hreflang="zh-Hant" href="https://www.emoji.tw/system">
<link rel="alternate" hreflang="en" href="https://www.emoji.tw/en/system">
<link rel="alternate" hreflang="ja" href="https://www.emoji.tw/ja/system">
<link rel="alternate" hreflang="x-default" href="https://www.emoji.tw/system">
<meta property="og:locale" content="zh_TW">
<meta property="og:title" content="消費方式 · 言文字｜台灣人才聚落">
<meta property="og:description" content="現金進門、會籍進網絡、點數換設施、包場辦活動。">
<meta property="og:url" content="https://www.emoji.tw/system">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Noto+Sans+TC:wght@300;400;500;700&family=Noto+Serif+TC:wght@500;700;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/nav.css">
<link rel="stylesheet" href="/system.css">
<script defer src="/nav.js"></script>
<script defer src="/script.js"></script>
</head>
<body>
<a href="#content" class="skip-link">跳至主要內容</a>
<!--SITE_HEADER-->
<main id="content" class="system-page">

  <section class="system-hero">
    <div class="wrap">
      <span class="eyebrow">消費方式</span>
      <h1>怎麼進，怎麼付</h1>
      <p class="lede">現金進門、會籍進網絡、點數換設施、包場辦活動——同一棟樓，四種用法。</p>
    </div>
  </section>

  <section class="system-section" id="overview">
    <div class="wrap">
      <div class="sec-head">
        <span class="eyebrow">Overview</span>
        <h2>四種方式</h2>
      </div>
      <div class="system-modes">
        <div class="system-mode">
          <h3>現金</h3>
          <p>一樓 Café &amp; Bar 單點，不需會員。</p>
        </div>
        <div class="system-mode">
          <h3>會籍</h3>
          <p>進入人才網絡與三樓使用權。</p>
        </div>
        <div class="system-mode">
          <h3>點數</h3>
          <p>兌換二樓設施；每點 NT$10。</p>
        </div>
        <div class="system-mode">
          <h3>包場</h3>
          <p>遊樂室／三樓現金包場，可折抵餐飲。</p>
        </div>
      </div>
    </div>
  </section>

  <section class="system-section" id="membership">
    <div class="wrap">
      <div class="sec-head">
        <span class="eyebrow">Membership</span>
        <h2>會籍方案</h2>
        <p>會籍買的是網絡入口；三樓共享辦公與活動空間含在會籍內。二樓設施另以點數兌換。</p>
      </div>
      <table class="system-table">
        <thead>
          <tr><th>方案</th><th>價格</th><th>重點</th></tr>
        </thead>
        <tbody>
          <tr><td>單日 4 小時</td><td class="system-price">NT$200</td><td>超過方案時數每小時 NT$100</td></tr>
          <tr><td>單日 12 小時</td><td class="system-price">NT$500</td><td>超過方案時數每小時 NT$100</td></tr>
          <tr><td>月會員</td><td class="system-price">NT$4,000</td><td>贈點 100（一年效期）；三樓自由使用與社群資格</td></tr>
          <tr><td>季會員</td><td class="system-price">NT$10,000</td><td>贈點 300</td></tr>
          <tr><td>年會員</td><td class="system-price">NT$35,000</td><td>贈點 1,000</td></tr>
          <tr><td>創始會員</td><td class="system-price">NT$35,000</td><td>18 個月會籍＋贈點 2,000；限量 100 名</td></tr>
        </tbody>
      </table>
      <div class="system-actions">
        <a class="btn btn--solid" href="/fellow">創始會員計畫 →</a>
        <a class="btn" href="/member">會員登入</a>
      </div>
    </div>
  </section>

  <section class="system-section" id="points">
    <div class="wrap">
      <div class="sec-head">
        <span class="eyebrow">Points</span>
        <h2>點數兌換</h2>
        <p>每點 NT$10。購買本金無使用期限、可退未使用部分；加贈／會籍贈點預設一年、不退現；效期近者優先扣除。</p>
      </div>
      <table class="system-table">
        <thead>
          <tr><th>項目</th><th>點數</th><th>條件</th></tr>
        </thead>
        <tbody>
          <tr><td>淋浴</td><td class="system-price">7 點／次</td><td>會員</td></tr>
          <tr><td>膠囊休憩</td><td class="system-price">10 點／小時</td><td>須 Active</td></tr>
          <tr><td>娛樂室</td><td class="system-price">10 點／小時</td><td>須 Active</td></tr>
        </tbody>
      </table>
      <p class="system-note">二樓為會員限定的休憩與會員服務空間；包場維持現金，不走點數。</p>
    </div>
  </section>

  <section class="system-section" id="booking">
    <div class="wrap">
      <div class="sec-head">
        <span class="eyebrow">Private hire</span>
        <h2>包場</h2>
        <p>現金計價；可全額折抵一樓當場餐飲（含酒水、不折現不找零）。</p>
      </div>
      <table class="system-table">
        <thead>
          <tr><th>空間</th><th>價格</th><th>規則</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>遊樂室</td>
            <td class="system-price">NT$10,000／時段</td>
            <td>2 小時，贈前後各 30 分鐘場佈場復；超時每小時 NT$3,000（不可折抵）</td>
          </tr>
          <tr>
            <td>三樓共享空間</td>
            <td class="system-price">NT$20,000／時段</td>
            <td>同上場佈規則；超時每小時 NT$5,000（不可折抵）</td>
          </tr>
        </tbody>
      </table>
      <p class="system-note">社群活動另有優惠合作。</p>
      <div class="system-actions">
        <a class="btn btn--solid" href="/partner">社群夥伴計畫 →</a>
      </div>
    </div>
  </section>

  <section class="system-section" id="cafe">
    <div class="wrap">
      <div class="sec-head">
        <span class="eyebrow">Café &amp; Bar</span>
        <h2>一樓現金</h2>
        <p>單點約 NT$80–350，不需會員。一杯咖啡就是入場券。</p>
      </div>
      <div class="system-actions">
        <a class="btn btn--solid" href="/space">空間介紹與菜單 →</a>
      </div>
    </div>
  </section>

</main>
<!--SITE_FOOTER-->
</body>
</html>
```

- [ ] **Step 5: 跑測至 PASS，並手動開頁**

```bash
node --test scripts/test-layout.mjs
# 若本機有 server：curl -s http://127.0.0.1:$PORT/system | head
```

Expected: system zh 測試 PASS；頁面含組裝後 nav。

- [ ] **Step 6: Commit**

```bash
git add public/system.css public/system.html scripts/test-layout.mjs
git commit -m "$(cat <<'EOF'
feat(system): 新增中文消費方式頁

EOF
)"
```

---

### Task 4: 英文／日文 `/system`

**Files:**
- Create: `public/en/system.html`
- Create: `public/ja/system.html`
- Modify: `scripts/test-layout.mjs`

- [ ] **Step 1: 追加 en／ja 結構測試**（鏡像 Task 3，路徑與連結加語系前綴；ja 禁用詞另加 `ホテル`）

```js
test('system en page structure', () => {
  const html = fs.readFileSync(path.join(PUB, 'en', 'system.html'), 'utf8');
  assert.match(html, /lang="en"/);
  assert.match(html, /id="membership"/);
  assert.match(html, /href="\/en\/fellow"/);
  assert.match(html, /href="\/en\/partner"/);
  assert.match(html, /href="\/en\/space"/);
  assert.match(html, /canonical" href="https:\/\/www\.emoji\.tw\/en\/system"/);
  assert.doesNotMatch(html, /旅館|hotel|住宿|過夜/i);
});

test('system ja page structure', () => {
  const html = fs.readFileSync(path.join(PUB, 'ja', 'system.html'), 'utf8');
  assert.match(html, /lang="ja"/);
  assert.match(html, /href="\/ja\/fellow"/);
  assert.match(html, /href="\/ja\/partner"/);
  assert.match(html, /href="\/ja\/space"/);
  assert.doesNotMatch(html, /旅館|hotel|宿泊|ホテル|過夜/i);
});
```

- [ ] **Step 2: 複製 zh 骨架為 en／ja，替換語系與文案**

關鍵對照（其餘段落完整翻譯，語氣對齊全站）：

| 區塊 | EN | JA |
|------|----|----|
| 標題 | SYSTEM / How you enter & pay | システム／入り方と支払い |
| Hero lede | Cash at the door, membership for the network, points for facilities, cash for private hire. | 現金で入り、会籍でネットワークへ、ポイントで設備を、貸切は現金。 |
| Nav 語意 | SYSTEM | システム |
| 會籍表 | Day 4h / 12h / Monthly / Quarterly / Annual / Founding | デイ4時間／12時間／月／四半期／年／創始 |
| 點數 | Shower 7 pts；capsule／play room 10 pts／hr (Active) | シャワー7／カプセル・プレイルーム各10／時（Active） |
| 包場 CTA | Community Partner Program → `/en/partner` | コミュニティパートナー → `/ja/partner` |

頁頭 `canonical`／`hreflang`／`og:url` 必須對應該語系。`<!--SITE_HEADER-->`／`<!--SITE_FOOTER-->` 保留。

- [ ] **Step 3: 跑測 PASS + Commit**

```bash
node --test scripts/test-layout.mjs
git add public/en/system.html public/ja/system.html scripts/test-layout.mjs
git commit -m "$(cat <<'EOF'
feat(system): 新增英日消費方式頁

EOF
)"
```

---

### Task 5: 首頁 `#floors` 改雙入口橋接＋JSON-LD

**Files:**
- Modify: `public/index.html`
- Modify: `public/en/index.html`
- Modify: `public/ja/index.html`
- Modify: `scripts/test-layout.mjs`
- Modify: `public/style.css`（若需橋接樣式）

- [ ] **Step 1: 測試**

```js
test('homepage floors section is dual bridge not price cards', () => {
  for (const rel of ['index.html', path.join('en', 'index.html'), path.join('ja', 'index.html')]) {
    const html = fs.readFileSync(path.join(PUB, rel), 'utf8');
    assert.match(html, /id="floors"/);
    assert.doesNotMatch(html, /class="floors__grid"/);
    assert.doesNotMatch(html, /floor__how/);
    assert.match(html, /\/system/);
    assert.match(html, /\/space/);
  }
});

test('homepage Offer urls point to /system', () => {
  const zh = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
  assert.match(zh, /emoji\.tw\/system"/);
  assert.doesNotMatch(zh, /emoji\.tw\/#floors"/);
  const en = fs.readFileSync(path.join(PUB, 'en', 'index.html'), 'utf8');
  assert.match(en, /emoji\.tw\/en\/system"/);
  const ja = fs.readFileSync(path.join(PUB, 'ja', 'index.html'), 'utf8');
  assert.match(ja, /emoji\.tw\/ja\/system"/);
});
```

- [ ] **Step 2: 改寫 zh `#floors` 區塊**（替換整段 `<section id="floors">…</section>`）

```html
<section id="floors">
  <div class="wrap">
    <div class="sec-head reveal">
      <span class="eyebrow">空間與消費</span>
      <h2>一棟飛輪，兩條入口</h2>
      <p>先看空間怎麼長，或直接弄清楚怎麼用、怎麼付。</p>
    </div>
    <div class="bridge-grid">
      <a class="bridge-card reveal" href="/space">
        <span class="bridge-card__kicker">空間介紹</span>
        <strong>四層樓長什麼樣</strong>
        <span class="bridge-card__go">前往 →</span>
      </a>
      <a class="bridge-card reveal" href="/system">
        <span class="bridge-card__kicker">消費方式</span>
        <strong>會籍・點數・包場</strong>
        <span class="bridge-card__go">前往 →</span>
      </a>
    </div>
  </div>
</section>
```

en／ja 同步文案與 `/en/space` `/en/system`、`/ja/space` `/ja/system`。

- [ ] **Step 3: 在 `style.css` 加橋接樣式**（可放在 `.floors__grid` 附近）

```css
  .bridge-grid{display:grid;grid-template-columns:1fr 1fr;gap:22px}
  .bridge-card{
    display:flex;flex-direction:column;gap:10px;
    padding:28px 24px;text-decoration:none;color:inherit;
    border-top:1px solid color-mix(in srgb, var(--ink) 18%, transparent);
  }
  .bridge-card:hover{opacity:.85}
  .bridge-card__kicker{font-size:.74rem;letter-spacing:.2em;text-transform:uppercase;color:var(--muted)}
  .bridge-card strong{font-family:var(--serif);font-size:1.45rem;font-weight:700}
  .bridge-card__go{margin-top:auto;font-size:.9rem;color:var(--muted)}
  @media(max-width:700px){.bridge-grid{grid-template-columns:1fr}}
```

- [ ] **Step 4: JSON-LD** — 三語 index 內所有 `"url": "https://www.emoji.tw/...#floors"` 改為對應 `/system`（含 `/en/system`、`/ja/system`）。

- [ ] **Step 5: FAQ 答案** — 可保留價目文字；若有「見樓層」類表述，改為連 `/system`（可選：FAQ 開頭加「詳見<a href="/system">消費方式</a>」）。

- [ ] **Step 6: 跑測 PASS + Commit**

```bash
node --test scripts/test-layout.mjs
git add public/index.html public/en/index.html public/ja/index.html public/style.css scripts/test-layout.mjs
git commit -m "$(cat <<'EOF'
feat(home): #floors 改雙入口並導向 /system

EOF
)"
```

---

### Task 6: Sitemap + `build_nav.py` 同步

**Files:**
- Modify: `public/sitemap.xml`
- Modify: `build_nav.py`
- Modify: `scripts/test-layout.mjs`

- [ ] **Step 1: 測試**

```js
test('sitemap includes system locales', () => {
  const sm = fs.readFileSync(path.join(PUB, 'sitemap.xml'), 'utf8');
  assert.match(sm, /https:\/\/www\.emoji\.tw\/system/);
  assert.match(sm, /https:\/\/www\.emoji\.tw\/en\/system/);
  assert.match(sm, /https:\/\/www\.emoji\.tw\/ja\/system/);
});
```

- [ ] **Step 2: 在 `sitemap.xml` 於 space 區塊後插入三語 system URL**（`lastmod` 2026-07-12，`changefreq` weekly，priority zh 0.8／其他 0.6）。

- [ ] **Step 3: 更新 `build_nav.py`（避免日後誤跑覆寫）**

```python
 'zh': dict(..., floors='消費方式', space='空間介紹', ...),
 'en': dict(..., floors='SYSTEM', space='Space', ...),
 'ja': dict(..., floors='システム', space='スペース', ...),
```

導覽片段改為：

```python
      <a href="{home}#about">{d['about']}</a>  # 若 about 已獨立頁，改 /about
```

正確應與 partials 對齊：

```python
      <a href="{base}/about" if needed>{d['about']}</a>
      <a href="{base}/system">{d['floors']}</a>
      <a href="{base}/space">{d['space']}</a>
```

（`base` 為 `''`／`/en`／`/ja`；zh about／system／space 無前綴斜線處理與現況 partial 一致。）  
若 `build_nav.py` 已半廢棄，至少改 `floors` 標籤與 `#floors`→`/system`，並在檔案頂註解：「導覽真相來源為 `views/partials/header-*.html`」。

- [ ] **Step 4: 跑全測 + Commit**

```bash
node --test scripts/test-layout.mjs
git add public/sitemap.xml build_nav.py scripts/test-layout.mjs
git commit -m "$(cat <<'EOF'
chore: sitemap 與 build_nav 對齊 /system

EOF
)"
```

---

### Task 7: 手動驗收

- [ ] **Step 1: 本機開站**

```bash
# 依專案慣例啟動（例）
npm start
# 或 node server.js
```

- [ ] **Step 2: 檢查清單**

| 檢查 | 預期 |
|------|------|
| `/system` `/en/system` `/ja/system` | 200，header 高亮消費方式／SYSTEM／システム |
| 語系切換 | 停留在對應 `/system` |
| 包場 CTA | 進 `/partner`（語系正確） |
| 創始 CTA | 進 `/fellow` |
| 一樓 CTA | 進 `/space` |
| 首頁 `#floors` | 兩卡，無三層價目卡 |
| 二樓文案 | 無住宿／hotel 等禁用詞 |
| 手機寬 | 總覽改單欄／雙欄，表可橫向捲 |

- [ ] **Step 3: 若有修正，另 commit；否則完成**

---

## Spec coverage（self-review）

| Spec 要求 | Task |
|-----------|------|
| 三語 `/system` 頁 | 3–4 |
| Hero＋四種方式總覽＋會籍／點數／包場／一樓 | 3–4 |
| 包場連 `/partner`、創始連 `/fellow`、菜單連 `/space` | 3–4 |
| Nav 文案 消費方式／SYSTEM／システム | 2 |
| Nav 順序 關於→消費方式→空間 | 2 |
| Footer 探索 | 2 |
| 首頁雙入口橋接 | 5 |
| JSON-LD／舊 `#floors` URL | 5 |
| Sitemap | 6 |
| 不做結帳／CMS | 全計畫未引入 |
| 法遵禁用詞 | 測試 + 文案 |

**Placeholder scan:** 無 TBD；價目數字寫死於 HTML。  
**Type／命名:** `NAV_SYSTEM_CURRENT`、slug `system`、路徑 `/system` 全計畫一致。
