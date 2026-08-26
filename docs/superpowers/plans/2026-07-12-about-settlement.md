# 「關於聚落」獨立頁 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增三語靜態頁 `/about`，以 KK 第一人稱長文＋極少錨點陳述「為什麼做」與短版背景；導覽改連新頁並從首頁移除 `#about`。

**Architecture:** 靜態 HTML 三語（對齊 `space.html` 標記與 SEO）；`lib/layout.js` 增加 `about` slug／`NAV_ABOUT_CURRENT`；共用 header／footer partial；專用 `about.css` 沿用全站 CIS token；不進 CMS。

**Tech Stack:** 既有 Express static＋`layoutMiddleware`、`node:test`、Noto／Cormorant 字體、`script.js` reveal。

**Spec:** `docs/superpowers/specs/2026-07-12-about-settlement-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `lib/layout.js` | `about.html`→`about` 正規化；`NAV_ABOUT_CURRENT`；語系路徑含 `about` |
| `scripts/test-layout.mjs` | about 路徑、nav current、導覽／首頁殘留檢查 |
| `views/partials/header-{zh,en,ja}.html` | 「關於聚落」→ `/about` 等＋`{{NAV_ABOUT_CURRENT}}` |
| `views/partials/footer-{zh,en,ja}.html` | 同上 |
| `public/about.css` | 單欄長文版式 |
| `public/about.html` | 中文頁 |
| `public/en/about.html` | English |
| `public/ja/about.html` | 日本語 |
| `public/index.html`、`en/index.html`、`ja/index.html` | 刪除 `#about` section |
| `public/sitemap.xml` | 加入三語 `/about` |
| `public/style.css` | **不動**（遺留 `.about` 規則可留，YAGNI） |

---

### Task 1: layout — about slug ＋ nav current

**Files:**
- Modify: `lib/layout.js`
- Modify: `scripts/test-layout.mjs`

- [ ] **Step 1: Write failing tests**（追加到 `scripts/test-layout.mjs`）

```js
test('localePaths maps about locales', () => {
  assert.equal(localePaths('/about').slug, 'about');
  assert.equal(localePaths('/about').zh, '/about');
  assert.equal(localePaths('/en/about').en, '/en/about');
  assert.equal(localePaths('/ja/about').ja, '/ja/about');
  assert.equal(localePaths('/about.html').slug, 'about');
});

test('composeLayout about page marks about current', () => {
  const raw = `<!doctype html><body>${MARKER_HEADER}<main></main>${MARKER_FOOTER}</body>`;
  const html = composeLayout(raw, '/about');
  assert.match(html, /href="\/about"[^>]*aria-current="page"/);
  assert.doesNotMatch(html, /href="\/#about"/);
});

test('resolvePublicHtml resolves about', () => {
  assert.ok(resolvePublicHtml(PUB, '/about').endsWith('about.html'));
  assert.ok(resolvePublicHtml(PUB, '/en/about').endsWith(`en${path.sep}about.html`));
});
```

（註：Step 1 時 `about.html` 尚不存在 → `resolvePublicHtml` 測試可先只測 zh 路徑在 Task 4 後再加，或本 Task 只測 `localePaths`／`composeLayout`；**本計畫採後者**：Step 1 只加前兩個 test，`resolvePublicHtml` 放到 Task 4 結尾。）

- [ ] **Step 2: Run tests — expect fail**

```bash
cd emoji-website && node --test scripts/test-layout.mjs
```

Expected: `localePaths maps about locales` 與／或 `composeLayout about page…` FAIL（slug 非 about 或無 `aria-current`／仍含 `/#about`）。

- [ ] **Step 3: Implement `lib/layout.js`**

在 `localePaths` 內把正規化改為：

```js
  const normSlug =
    slug === 'space.html' ? 'space'
    : slug === 'member.html' ? 'member'
    : slug === 'about.html' ? 'about'
    : slug;
```

並把 `about` 納入與 space／member 相同的 early-return 分支（同一 `if` 條件加 `|| normSlug === 'about'`）：

```js
  if (normSlug === 'space' || normSlug === 'menu' || normSlug === 'member' || normSlug === 'about') {
```

在 `composeLayout` 的 `vars` 增加：

```js
    NAV_ABOUT_CURRENT: meta.slug === 'about' ? CURRENT : '',
```

- [ ] **Step 4: Run tests**

```bash
node --test scripts/test-layout.mjs
```

Expected: about 相關新測仍可能因 header 仍寫 `/#about` 而在 `composeLayout about…` 的 `doesNotMatch(/href="\/#about"/)` FAIL → 進入 Task 2。若只 FAIL 在 header 殘留，Task 1 的 `localePaths` 必須 PASS。

- [ ] **Step 5: Commit**（若使用者要求提交時）

```bash
git add lib/layout.js scripts/test-layout.mjs
git commit -m "$(cat <<'EOF'
feat(about): map /about locale slug and nav current

EOF
)"
```

---

### Task 2: header／footer 導覽改連 `/about`

**Files:**
- Modify: `views/partials/header-zh.html`
- Modify: `views/partials/header-en.html`
- Modify: `views/partials/header-ja.html`
- Modify: `views/partials/footer-zh.html`
- Modify: `views/partials/footer-en.html`
- Modify: `views/partials/footer-ja.html`
- Modify: `scripts/test-layout.mjs`

- [ ] **Step 1: 追加 failing test**

```js
test('header and footer link to /about not /#about', () => {
  for (const lang of ['zh', 'en', 'ja']) {
    const h = fs.readFileSync(path.join(__dirname, '..', 'views', 'partials', `header-${lang}.html`), 'utf8');
    const f = fs.readFileSync(path.join(__dirname, '..', 'views', 'partials', `footer-${lang}.html`), 'utf8');
    assert.doesNotMatch(h, /\/#about/);
    assert.doesNotMatch(f, /\/#about/);
    assert.match(h, /NAV_ABOUT_CURRENT/);
    if (lang === 'zh') {
      assert.match(h, /href="\/about"/);
      assert.match(f, /href="\/about"/);
    } else {
      assert.match(h, new RegExp(`href="/${lang}/about"`));
      assert.match(f, new RegExp(`href="/${lang}/about"`));
    }
  }
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
node --test scripts/test-layout.mjs
```

- [ ] **Step 3: 改 partials**

`header-zh.html` 關於連結改為：

```html
      <a href="/about"{{NAV_ABOUT_CURRENT}}>關於聚落</a>
```

`header-en.html`：

```html
      <a href="/en/about"{{NAV_ABOUT_CURRENT}}>About</a>
```

`header-ja.html`：

```html
      <a href="/ja/about"{{NAV_ABOUT_CURRENT}}>ハブについて</a>
```

三語 footer「探索」欄同樣把 `/#about`（或 `/en/#about`、`/ja/#about`）改成對應 `/about` 路徑（**不要**加 `NAV_ABOUT_CURRENT` 於 footer，除非 footer 已有其他 CURRENT 模式——目前 footer 無，維持純 href）。

- [ ] **Step 4: Run tests — expect PASS**（含 Task 1 的 composeLayout about）

```bash
node --test scripts/test-layout.mjs
```

- [ ] **Step 5: Commit**（若要求）

```bash
git add views/partials/header-*.html views/partials/footer-*.html scripts/test-layout.mjs
git commit -m "$(cat <<'EOF'
feat(about): point nav and footer to /about pages

EOF
)"
```

---

### Task 3: `about.css`

**Files:**
- Create: `public/about.css`

- [ ] **Step 1: 建立 CSS**（沿用 `--ink`／`--paper`／`--serif` 等；黃只在 CTA 一擊）

```css
/* about.css — 關於聚落長文單欄 */
.about-page {
  padding-bottom: clamp(64px, 10vw, 120px);
}
.about-hero {
  padding: clamp(72px, 12vw, 120px) 0 clamp(40px, 6vw, 64px);
}
.about-hero .eyebrow {
  display: block;
  margin-bottom: 16px;
}
.about-hero h1 {
  font-family: var(--serif);
  font-weight: 700;
  font-size: clamp(1.75rem, 4vw, 2.75rem);
  line-height: 1.35;
  letter-spacing: 0.02em;
  max-width: 18em;
}
.about-hero .lede {
  margin-top: 20px;
  max-width: 36em;
  color: var(--ink-soft);
  font-size: 1.05rem;
}
.about-narrow {
  max-width: 680px;
  margin: 0 auto;
  padding: 0 clamp(20px, 4vw, 28px);
}
.about-block {
  padding-top: clamp(40px, 7vw, 72px);
}
.about-block__label {
  font-family: var(--sans);
  font-size: 0.75rem;
  letter-spacing: 0.14em;
  text-transform: none;
  color: var(--muted);
  margin-bottom: 20px;
}
.about-prose p {
  margin: 0 0 1.25em;
  color: var(--ink-soft);
  font-size: 1.02rem;
  line-height: 1.95;
}
.about-prose p:last-child {
  margin-bottom: 0;
}
.about-prose .pull {
  font-family: var(--serif);
  font-size: clamp(1.15rem, 2.4vw, 1.45rem);
  line-height: 1.7;
  color: var(--ink);
  margin: 1.75em 0;
}
.about-kk {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: center;
  margin-bottom: 24px;
}
.about-kk img {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  object-fit: cover;
  display: block;
}
.about-kk__name {
  font-family: var(--serif);
  font-size: 1.25rem;
  font-weight: 700;
}
.about-kk__role {
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.6;
  margin-top: 4px;
}
.about-roles {
  list-style: none;
  margin: 20px 0 0;
  padding: 0;
  border-top: 1px solid var(--line);
}
.about-roles li {
  display: grid;
  grid-template-columns: 7.5rem 1fr;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
  font-size: 0.95rem;
}
.about-roles li span:first-child {
  color: var(--muted);
}
.about-more {
  margin-top: 20px;
  font-size: 0.95rem;
}
.about-more a {
  color: var(--ink);
  text-underline-offset: 3px;
}
.about-cta {
  margin-top: clamp(48px, 8vw, 80px);
  padding: 28px 24px;
  background: var(--accent);
  color: var(--on-accent);
}
.about-cta p {
  margin: 0 0 16px;
  font-family: var(--serif);
  font-size: 1.15rem;
  line-height: 1.5;
}
.about-cta__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.about-cta .btn {
  background: var(--ink);
  color: var(--on-ink);
  border: none;
}
.about-cta .btn-ghost {
  background: transparent;
  color: var(--ink);
  border: 1px solid var(--ink);
}
@media (max-width: 560px) {
  .about-roles li {
    grid-template-columns: 1fr;
    gap: 4px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .about-page .reveal {
    opacity: 1 !important;
    transform: none !important;
  }
}
```

- [ ] **Step 2: 確認檔案存在**

```bash
test -f public/about.css && wc -l public/about.css
```

Expected: 檔案存在、行數 > 50。

- [ ] **Step 3: Commit**（若要求）

```bash
git add public/about.css
git commit -m "$(cat <<'EOF'
style(about): add long-form about page stylesheet

EOF
)"
```

---

### Task 4: 中文 `public/about.html`

**Files:**
- Create: `public/about.html`
- Modify: `scripts/test-layout.mjs`

- [ ] **Step 1: 寫 failing 結構測試**

```js
test('about zh page structure', () => {
  const html = fs.readFileSync(path.join(PUB, 'about.html'), 'utf8');
  assert.match(html, /SITE_HEADER/);
  assert.match(html, /SITE_FOOTER/);
  assert.match(html, /id="why"/);
  assert.match(html, /id="kk"/);
  assert.match(html, /about\.css/);
  assert.match(html, /href="\/space"/);
  assert.match(html, /href="\/fellow#about"/);
  assert.doesNotMatch(html, /旅館|hotel|住宿|過夜/i);
  assert.doesNotMatch(html, /哈哈|～～/);
});
```

- [ ] **Step 2: Run — expect FAIL**（檔案不存在）

```bash
node --test scripts/test-layout.mjs
```

- [ ] **Step 3: 建立 `public/about.html`**

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<script>document.documentElement.className='js'</script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#1B1A17">
<title>關於聚落 · 言文字｜台灣人才聚落</title>
<meta name="description" content="為什麼做言文字｜台灣人才聚落：打造台灣人才密度最高的聚落，讓平常不會遇到的人在台北車站旁相遇。">
<link rel="canonical" href="https://www.emoji.tw/about">
<link rel="alternate" hreflang="zh-Hant" href="https://www.emoji.tw/about">
<link rel="alternate" hreflang="en" href="https://www.emoji.tw/en/about">
<link rel="alternate" hreflang="ja" href="https://www.emoji.tw/ja/about">
<link rel="alternate" hreflang="x-default" href="https://www.emoji.tw/about">
<meta property="og:locale" content="zh_TW">
<meta property="og:title" content="關於聚落 · 言文字｜台灣人才聚落">
<meta property="og:description" content="打造台灣人才密度最高的聚落，讓平常不會遇到的人，在台北車站旁相遇。">
<meta property="og:url" content="https://www.emoji.tw/about">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Noto+Sans+TC:wght@300;400;500;700&family=Noto+Serif+TC:wght@500;700;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/nav.css">
<link rel="stylesheet" href="/about.css">
<script defer src="/nav.js"></script>
<script defer src="/script.js"></script>
</head>
<body>
<a href="#content" class="skip-link">跳至主要內容</a>

<!--SITE_HEADER-->

<main id="content" class="about-page">

  <section class="about-hero">
    <div class="about-narrow">
      <span class="eyebrow reveal">關於聚落</span>
      <h1 class="reveal">打造台灣人才密度最高的聚落</h1>
      <p class="lede reveal">讓平常不會遇到的人，在台北車站旁相遇。</p>
    </div>
  </section>

  <section class="about-block" id="why">
    <div class="about-narrow">
      <h2 class="about-block__label reveal">為什麼做</h2>
      <div class="about-prose reveal">
        <p>這棟樓，我是先做給自己跟同類的人。創業者、工程師、遠端工作者、數位遊牧者——我們需要一個能工作、能吃飯、能延續對話的據點。如果我自己不想天天待在這裡，它就是失敗的。</p>
        <p>台灣不缺人才。缺的是讓不同圈層彼此看見、互助、合作的場。我自己走過技術、產品、社群、政策，知道「對的人相遇」可以改寫彼此的路。我想做那個場的建造者。</p>
        <p class="pull">理念需要生意養活。生意因理念而不可取代。</p>
        <p>站前的餐飲、共享辦公、社群需求都已存在。我不是來教育市場，是來把這些需求整合進同一棟樓。目標不是快速展店，是把重慶南路一段 11 號做深——深而不廣。</p>
        <p>人才密度是這件事的靈魂。當高消費卻無關的使用排擠掉目標人才時，我寧可短期少賺，也要用定價與門檻把空間留給對的人。丟了密度，就只是又一間店。</p>
      </div>
    </div>
  </section>

  <section class="about-block" id="kk">
    <div class="about-narrow">
      <h2 class="about-block__label reveal">我是誰</h2>
      <div class="about-kk reveal">
        <img src="/fellow/kk.jpg" alt="徐愷 KK" width="88" height="88">
        <div>
          <div class="about-kk__name">徐愷 KK</div>
          <div class="about-kk__role">言文字｜台灣人才聚落發起人</div>
        </div>
      </div>
      <div class="about-prose reveal">
        <p>我是徐愷 KK。工程師出身，台大資工畢業；做過系統架構到新創工程副總，2018 年起創業，同年開始數位遊牧，帶著工作走過二十多個國家。</p>
        <p>我最擅長的是把概念變成活動，活動變成社群，社群變成國際網絡，再收成政府與企業願意一起做的專案。言文字｜台灣人才聚落是下一步：把這些年累積的社群、品牌與合作，收斂成一個能長期營運的實體據點。</p>
      </div>
      <ul class="about-roles reveal">
        <li><span>理事長</span><span>社團法人台灣數位遊牧者協會（TDNA）</span></li>
        <li><span>執行長</span><span>Nomad Taiwan Office 遊牧台灣辦公室</span></li>
        <li><span>負責人</span><span>言文字股份有限公司</span></li>
      </ul>
      <p class="about-more reveal">更完整的經歷與專案，見創始會員頁〈<a href="/fellow#about">關於 KK</a>〉。</p>
    </div>
  </section>

  <section class="about-narrow" id="cta">
    <div class="about-cta reveal">
      <p>先來走走空間，或一起從頭開始。</p>
      <div class="about-cta__actions">
        <a class="btn" href="/space">空間介紹</a>
        <a class="btn btn-ghost" href="/fellow">創始會員計畫</a>
      </div>
    </div>
  </section>

</main>

<!--SITE_FOOTER-->

</body>
</html>
```

- [ ] **Step 4: 跑測並追加 resolve 斷言（僅 zh）**

```bash
node --test scripts/test-layout.mjs
```

Expected: PASS。並追加：

```js
test('resolvePublicHtml resolves about zh', () => {
  assert.ok(resolvePublicHtml(PUB, '/about').endsWith('about.html'));
});
```

（en／ja 的 resolve 斷言分別在 Task 5／6 補上。）

- [ ] **Step 5: 本地煙霧**

```bash
node server.js &
sleep 1
curl -s http://127.0.0.1:3000/about | head -c 400
# 應含「為什麼做」「SITE」已替換後的 site-nav、無 /#about 於導覽
kill %1
```

（埠號以專案實際 `PORT`／`.env` 為準。）

- [ ] **Step 6: Commit**（若要求）

```bash
git add public/about.html scripts/test-layout.mjs
git commit -m "$(cat <<'EOF'
feat(about): add Chinese about page in KK first person

EOF
)"
```

---

### Task 5: English `public/en/about.html`

**Files:**
- Create: `public/en/about.html`
- Modify: `scripts/test-layout.mjs`

- [ ] **Step 1: 測試**

```js
test('about en page structure', () => {
  const html = fs.readFileSync(path.join(PUB, 'en', 'about.html'), 'utf8');
  assert.match(html, /lang="en"/);
  assert.match(html, /id="why"/);
  assert.match(html, /id="kk"/);
  assert.match(html, /href="\/en\/space"/);
  assert.match(html, /href="\/en\/fellow#about"/);
  assert.match(html, /canonical" href="https:\/\/www\.emoji\.tw\/en\/about"/);
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: 建立英文頁**（結構同中文；文案如下）

Hero:
- Eyebrow: About the hub
- H1: Build Taiwan’s densest hub for talent
- Lede: So people who wouldn’t normally meet can meet by Taipei Main Station.

Why (`#why`):
- I built this building for myself and people like me first — founders, engineers, remote workers, digital nomads. We need a place to work, eat, and keep the conversation going. If I wouldn’t want to spend every day here, it has already failed.
- Taiwan doesn’t lack talent. It lacks a place where different circles can see each other, help each other, and build together. I’ve moved through tech, product, community, and policy. I know what the right meeting can change. I want to be the one who builds that place.
- Pull: Ideals need a business that feeds them. A business becomes irreplaceable because of its ideals.
- The demand for food, coworking, and community around the station already exists. I’m not here to educate a market — I’m here to integrate it into one building. The goal isn’t to chain out fast. It’s to go deep at No. 11, Sec. 1, Chongqing S. Rd. — deep, not wide.
- Talent density is the soul of this. When high-paying use that doesn’t belong here crowds out the people we built for, I’d rather earn less for a while and keep the space for the right people. Lose the density, and it’s just another shop.

Who (`#kk`):
- Short bio parallel to ZH; roles TDNA Chairperson, Nomad Taiwan Office CEO, Emoji Co. responsible person.
- Link: `/en/fellow#about`
- CTA: `/en/space`, `/en/fellow`

Head meta：`lang="en"`、canonical／hreflang／og 對齊 `en/space.html` 模式；stylesheet 同中文（`/about.css`）。

- [ ] **Step 4: Run tests PASS；更新 resolvePublicHtml 斷言 en 必須存在**

- [ ] **Step 5: Commit**（若要求）

```bash
git add public/en/about.html scripts/test-layout.mjs
git commit -m "$(cat <<'EOF'
feat(about): add English about page

EOF
)"
```

---

### Task 6: 日本語 `public/ja/about.html`

**Files:**
- Create: `public/ja/about.html`
- Modify: `scripts/test-layout.mjs`

- [ ] **Step 1: 測試**（同 Task 5，路徑 `ja`、`lang="ja"`、`/ja/space`、`/ja/fellow#about`）

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: 建立日文頁**

Hero:
- Eyebrow: ハブについて
- H1: 台湾で人材密度が最も高い拠点をつくる
- Lede: 普段は交わらない人たちが、台北駅のそばで出会うために。

Why: 中文意譯、です・ます；第一人稱「私」；不堆絵文字；禁旅館用語。

KK／CTA：對應 `/ja/fellow#about`、`/ja/space`、`/ja/fellow`。

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit**（若要求）

```bash
git add public/ja/about.html scripts/test-layout.mjs
git commit -m "$(cat <<'EOF'
feat(about): add Japanese about page

EOF
)"
```

---

### Task 7: 首頁移除 `#about` ＋ sitemap

**Files:**
- Modify: `public/index.html`
- Modify: `public/en/index.html`
- Modify: `public/ja/index.html`
- Modify: `public/sitemap.xml`
- Modify: `scripts/test-layout.mjs`

- [ ] **Step 1: 測試**

```js
test('homepages no longer ship #about section', () => {
  for (const rel of ['index.html', path.join('en', 'index.html'), path.join('ja', 'index.html')]) {
    const html = fs.readFileSync(path.join(PUB, rel), 'utf8');
    assert.doesNotMatch(html, /id="about"/);
    assert.doesNotMatch(html, /class="about"/);
  }
});

test('sitemap includes about locales', () => {
  const sm = fs.readFileSync(path.join(PUB, 'sitemap.xml'), 'utf8');
  assert.match(sm, /https:\/\/www\.emoji\.tw\/about/);
  assert.match(sm, /https:\/\/www\.emoji\.tw\/en\/about/);
  assert.match(sm, /https:\/\/www\.emoji\.tw\/ja\/about/);
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: 刪除三語首頁中 `<!-- ===== ABOUT ===== -->` 至該 `</section>` 整段**（保留其前後的 stats／floors）。

- [ ] **Step 4: 在 `sitemap.xml` 於 space 條目旁加入 about 三語**（複製 space 區塊改 path 即可，changefreq／priority 與 space 同級或略低：`0.8`）。

- [ ] **Step 5: 全庫殘留檢查**

```bash
rg -n '/#about|en/#about|ja/#about' views public --glob '!**/docs/**' || true
```

Expected: 無導覽殘留（JSON-LD／內文若提及「關於」敘事可不含錨點）。若 FAQ 或其他連結仍指 `/#about`，改為 `/about`。

- [ ] **Step 6: `node --test scripts/test-*.mjs` 全綠**

- [ ] **Step 7: Commit**（若要求）

```bash
git add public/index.html public/en/index.html public/ja/index.html public/sitemap.xml scripts/test-layout.mjs
git commit -m "$(cat <<'EOF'
feat(about): remove homepage about section and add sitemap entries

EOF
)"
```

---

### Task 8: 手工驗收（CIS 三秒）

**Files:** 無必改檔（僅驗證）

- [ ] **Step 1: 啟動伺服器，開三語頁**

```bash
cd emoji-website && npm start
# 瀏覽 /about /en/about /ja/about
```

- [ ] **Step 2: 勾選**
  - [ ] 導覽「關於聚落」有 `aria-current` 於 about 頁
  - [ ] 語系切換停在對應 `/[lang]/about`
  - [ ] 黃只出現在 CTA 底一擊
  - [ ] 手機寬度余白足夠、角色列表可讀
  - [ ] KK 照片載入；連到 fellow `#about` 可開對應 view
  - [ ] 首頁已無 about 區塊；從首頁無法錨到舊 `#about`
  - [ ] 無驚嘆號推銷、無哈哈／波浪催促

- [ ] **Step 3: 若視覺微調，只改 `about.css`／文案用字，不擴 scope**

---

## Spec coverage checklist

| Spec 要求 | Task |
|-----------|------|
| `/about` 三語靜態頁 | 4–6 |
| 長文＋`#why`／`#kk` 錨點 | 4–6 |
| KK 第一人稱 × CIS 語氣 | 4–6 文案 |
| 導覽／頁尾改連 | 2 |
| `NAV_ABOUT_CURRENT` | 1–2 |
| 首頁刪 `#about` | 7 |
| sitemap | 7 |
| 不進 CMS／不搬 fellow 長文 | 全計畫遵守 |
| CIS 黃一擊、余白、字體 | 3、8 |
| CTA → space／fellow | 4–6 |

## Placeholder scan

無 TBD／「similar to Task N」未展開內容；英文／日文 Task 以完整語意大綱＋結構約束寫死，實作時不得改回卡片牆或 CMS。
