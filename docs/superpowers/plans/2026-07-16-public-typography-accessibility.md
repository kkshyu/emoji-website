# 官網字級可讀性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將正式官網所有有意義文字的實際字級下限提高到 16 CSS px，並以無依賴測試及瀏覽器驗收防止退步。

**Architecture:** 先用 Node 標準函式庫新增一個會失敗的來源碼門檻測試，再機械式調整既有 CSS、HTML inline style 與自有 JS 字串；相對字級保留比例但用 `max(1rem, …)` 加下限。最後以現有 Playwright 實測三語 30 路由、兩種 viewport、200% 文字放大與 WCAG 1.4.12 文字間距覆寫；不新增套件、不重構模板。

**Tech Stack:** 靜態 HTML/CSS/JavaScript、Node.js `node:test`／`fs`／`path`、既有 Express 啟動方式、現有本機 Playwright（只作驗收，不加入依賴）。

---

## 工作區與檔案配置

- Worktree：`/Users/kkshyu/Repos/taiwan-talent-hub/taiwan-talent-hub-website/.worktrees/public-typography-accessibility`
- Branch：`codex/public-typography-accessibility`
- Baseline：`npm test` 已有 175/175 通過。
- Create：`scripts/test-public-typography.mjs` — 無依賴的字級來源碼防退步測試。
- Modify：`public/nav.css`、`public/style.css`、`public/about.css`、`public/system.css`、`public/space-dir.css` — 共用官網尺度。
- Modify：三語 `public/{,en/,ja/}index.html`、`access.html`、`member.html` — inline／動態字級與 320px 重排。
- Modify：`public/fellow/styles.css`、`public/fellow/founding.css`、`public/fellow/app.js`、三語 fellow HTML。
- Modify：`public/partner/partner.css`、`public/startup/startup.css`、`public/cis/cis.css` 與三語各計畫 HTML。
- Do not modify：`public/admin.html`、`public/access-mock.html`、`public/ig-studio*.js`、`public/social-ads-lib.js`、`public/vendor/**`。

### Task 1：先建立會抓到現況問題的字級門檻測試

**Files:**
- Create: `scripts/test-public-typography.mjs`

- [ ] **Step 1：新增完整測試**

```js
// scripts/test-public-typography.mjs
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const EXTENSIONS = new Set(['.css', '.html', '.js']);
const EXCLUDED = new Set([
  'public/access-mock.html',
  'public/admin.html',
  'public/ig-studio-lib.js',
  'public/ig-studio.js',
  'public/social-ads-lib.js',
  'public/vendor/html-to-image.js',
  'public/vendor/qrcode.min.js',
]);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function withoutAllowedDecoration(relative, source) {
  if (relative !== 'public/fellow/founding.css') return source;
  return source.replace(/\.fnd-roster i\s*\{[^}]*\}/gs, '');
}

function withoutBlockComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
}

function belowFloor(rawValue) {
  const value = rawValue.replace(/\s*!important\s*$/i, '').trim();
  if (/^max\(/i.test(value) && /(?:1rem|16px|12pt|100%)/i.test(value)) return false;

  const clamp = value.match(/^clamp\(\s*([^,]+),/i);
  if (clamp) return belowFloor(clamp[1]);

  const fixed = value.match(/^(-?\d*\.?\d+)\s*(rem|em|px|pt|%)$/i);
  if (fixed) {
    const amount = Number(fixed[1]);
    const floor = { rem: 1, em: 1, px: 16, pt: 12, '%': 100 }[fixed[2].toLowerCase()];
    return amount < floor;
  }

  if (/^0(?:\.0+)?$/.test(value)) return true;
  if (/^(?:xx-small|x-small|small|smaller)$/i.test(value)) return true;
  if (/^(?:calc|min)\(/i.test(value)) return true;
  if (/^-?\d*\.?\d+(?:vw|vh|vmin|vmax)$/i.test(value)) return true;
  return false;
}

test('正式官網不得宣告低於 16px 的有意義文字', () => {
  const violations = [];
  for (const file of walk(PUBLIC)) {
    if (!EXTENSIONS.has(path.extname(file))) continue;
    const relative = path.relative(ROOT, file).split(path.sep).join('/');
    if (EXCLUDED.has(relative)) continue;

    const source = withoutBlockComments(withoutAllowedDecoration(relative, readFileSync(file, 'utf8')));
    for (const match of source.matchAll(/font-size\s*:\s*([^;}"']+)/gi)) {
      if (!belowFloor(match[1])) continue;
      const line = source.slice(0, match.index).split('\n').length;
      violations.push(`${relative}:${line} font-size:${match[1].trim()}`);
    }
  }

  assert.deepEqual(violations, [], `低於 16px 的字級：\n${violations.join('\n')}`);
});
```

- [ ] **Step 2：執行 RED，確認測試因真實小字失敗**

Run：

```bash
node --test scripts/test-public-typography.mjs
```

Expected：`FAIL`；錯誤至少列出 `public/nav.css` 的 `.6rem`、`public/style.css` 的 `.34em` 與 `public/fellow/founding.css` 的 `.3em`。`.fnd-roster i` 的純裝飾席位號碼不得出現在清單。

- [ ] **Step 3：保留 RED，不先放寬 allowlist**

只允許設計規格列出的 `.fnd-roster i` 裝飾。不得把一般眉標、頁尾、按鈕、表單或會員狀態加進例外。

### Task 2：用最小機械改動把所有有意義字級提升到 16px

**Files:**
- Modify: `public/nav.css`
- Modify: `public/style.css`
- Modify: `public/about.css`
- Modify: `public/system.css`
- Modify: `public/space-dir.css`
- Modify: `public/index.html`
- Modify: `public/en/index.html`
- Modify: `public/ja/index.html`
- Modify: `public/access.html`
- Modify: `public/en/access.html`
- Modify: `public/ja/access.html`
- Modify: `public/member.html`
- Modify: `public/en/member.html`
- Modify: `public/ja/member.html`
- Modify: `public/fellow/styles.css`
- Modify: `public/fellow/founding.css`
- Modify: `public/fellow/app.js`
- Modify: `public/fellow/index.html`
- Modify: `public/en/fellow/index.html`
- Modify: `public/ja/fellow/index.html`
- Modify: `public/partner/partner.css`
- Modify: `public/partner/index.html`
- Modify: `public/en/partner/index.html`
- Modify: `public/ja/partner/index.html`
- Modify: `public/startup/startup.css`
- Modify: `public/startup/index.html`
- Modify: `public/en/startup/index.html`
- Modify: `public/ja/startup/index.html`
- Modify: `public/cis/cis.css`
- Modify: `public/cis/index.html`
- Modify: `public/en/cis/index.html`
- Modify: `public/ja/cis/index.html`
- Test: `scripts/test-public-typography.mjs`

- [ ] **Step 1：套用唯一允許的替換規則**

逐檔用 `apply_patch` 依下列規則處理；不要改 selector、文案、色彩、字重或間距：

```css
/* 固定 rem：所有小於 1rem 的值 */
font-size:.6rem;   /* before */
font-size:1rem;    /* after */

/* 固定 px：所有小於 16px 的值 */
font-size:13px;    /* before */
font-size:1rem;    /* after */

/* 相對 em：保留大型父層的比例，補 16px 下限 */
font-size:.34em;              /* before */
font-size:max(1rem,.34em);    /* after */

/* 裝飾例外：只保留這兩個既有值 */
.fnd-roster i{font-size:.52rem}
@media(max-width:640px){.fnd-roster i{font-size:.42rem}}
```

具體涵蓋：`.6rem`～`.98rem`、`10px`／`13px`、`.3em`／`.34em`／`.4em`／`.5em` 等所有低於門檻的宣告。`clamp()` 的最小值若已大於等於 `1rem`，保持原樣。

- [ ] **Step 2：特別確認四個共用根因**

```css
/* public/nav.css */
.site-nav .brand span{font-size:1rem}
.site-nav__links a:not(.btn),.site-nav__dd-top{font-size:1rem}
.site-nav__menu a,.site-nav__lang .site-nav__dd-top,.site-nav .btn{font-size:1rem}
footer.site-foot .foot__brand span,
footer.site-foot .foot__brand p,
footer.site-foot .foot__col h3,
footer.site-foot .foot__col a,
footer.site-foot .foot__col p,
footer.site-foot .foot__bot{font-size:1rem}

/* public/style.css */
.stat .n small{font-size:max(1rem,.34em)}

/* public/fellow/founding.css */
.fnd-invite__title .latin-sub{font-size:max(1rem,.3em)}

/* 三語 member.html 的表單與操作文字 */
.m-note,.m-pill,.m-token,.m-eyebrow,.m-meta{font-size:1rem}
```

- [ ] **Step 3：執行 GREEN**

Run：

```bash
node --test scripts/test-public-typography.mjs
```

Expected：`PASS`，1 test、0 fail。

- [ ] **Step 4：執行完整單元測試**

Run：

```bash
npm test
```

Expected：原有 175 tests 加上字級測試，至少 176/176 通過、0 fail。

- [ ] **Step 5：提交 RED→GREEN 完整變更**

```bash
git add scripts/test-public-typography.mjs public
git commit -m "fix: enforce 16px public typography floor"
```

### Task 3：修正 320px 重排中已知的三個最小布局問題

**Files:**
- Modify: `public/index.html`
- Modify: `public/en/index.html`
- Modify: `public/ja/index.html`
- Modify: `public/access.html`
- Modify: `public/en/access.html`
- Modify: `public/ja/access.html`
- Modify: `public/cis/cis.css`

- [ ] **Step 1：啟動本地站並重現 RED**

在獨立終端執行：

```bash
PORT=8096 PUBLIC_ORIGIN=http://127.0.0.1:8096 npm start
```

再執行：

```bash
node -e 'const {chromium}=require("playwright");(async()=>{const b=await chromium.launch({headless:true});let bad=[];for(const route of ["/","/access","/cis"]){const p=await b.newPage({viewport:{width:320,height:900}});await p.goto("http://127.0.0.1:8096"+route,{waitUntil:"domcontentloaded"});const d=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);if(d>0)bad.push(route+":"+d);await p.close()}await b.close();console.log(bad.join("\n"));process.exitCode=bad.length?1:0})().catch(e=>{console.error(e);process.exit(1)})'
```

Expected：`FAIL`；至少 `/`、`/access`、`/cis` 其中一頁顯示正數 overflow。此失敗證明後續修正有對應的瀏覽器重現。

- [ ] **Step 2：移除地圖最小高度造成的頁面橫向溢出**

三語首頁將地圖容器的 inline style 從：

```html
style="border:1px solid var(--line);border-radius:6px;overflow:hidden;background:var(--paper);aspect-ratio:4/3;min-height:240px"
```

改為：

```html
style="border:1px solid var(--line);border-radius:6px;overflow:hidden;background:var(--paper);aspect-ratio:4/3"
```

三語 access 頁將：

```css
.access-map{border:1px solid var(--line);border-radius:6px;overflow:hidden;background:var(--paper-alt);aspect-ratio:4/3;min-height:300px}
```

改為：

```css
.access-map{border:1px solid var(--line);border-radius:6px;overflow:hidden;background:var(--paper-alt);aspect-ratio:4/3}
```

- [ ] **Step 3：限制 CIS「錯誤拉伸」示意圖只在卡片內溢出**

```css
/* public/cis/cis.css */
.cis-dont{
  border:1px solid var(--line);background:var(--card);padding:18px 14px 16px;text-align:center;
  overflow:hidden;
}
```

保留 `.cis-toc__inner{overflow-x:auto}`；目次本身是可操作的單軸捲動元件，不要強迫縮字。

- [ ] **Step 4：重跑 GREEN 與完整測試**

先重跑 Step 1 的 Playwright 指令。

Expected：exit 0、無 overflow 輸出。

Run：

```bash
node --test scripts/test-public-typography.mjs
npm test
```

Expected：全部通過。

- [ ] **Step 5：提交重排修正**

```bash
git add public/index.html public/en/index.html public/ja/index.html public/access.html public/en/access.html public/ja/access.html public/cis/cis.css
git commit -m "fix: keep enlarged public content within 320px"
```

### Task 4：正式站等級的渲染驗收

**Files:**
- Modify: 無；驗收輸出寫入 `/tmp`，不入版控。

- [ ] **Step 1：在本地啟動 worktree 版本**

Run：

```bash
PORT=8096 PUBLIC_ORIGIN=http://127.0.0.1:8096 npm start
```

Expected：`[server] listening on 8096`；未設定 DB 時 API 回 503 不影響靜態頁驗收。

- [ ] **Step 2：用現有 Playwright 掃描 30 路由 × 兩種 viewport**

掃描路由固定為：

```js
const routes = [
  '/', '/about', '/access', '/space', '/system', '/fellow', '/partner', '/startup', '/cis', '/member',
  '/en/', '/en/about', '/en/access', '/en/space', '/en/system', '/en/fellow', '/en/partner', '/en/startup', '/en/cis', '/en/member',
  '/ja/', '/ja/about', '/ja/access', '/ja/space', '/ja/system', '/ja/fellow', '/ja/partner', '/ja/startup', '/ja/cis', '/ja/member',
];
const viewports = [{ width: 320, height: 900 }, { width: 1440, height: 1000 }];
```

Run：

```bash
node -e 'const {chromium}=require("playwright");const routes=["/","/about","/access","/space","/system","/fellow","/partner","/startup","/cis","/member","/en/","/en/about","/en/access","/en/space","/en/system","/en/fellow","/en/partner","/en/startup","/en/cis","/en/member","/ja/","/ja/about","/ja/access","/ja/space","/ja/system","/ja/fellow","/ja/partner","/ja/startup","/ja/cis","/ja/member"];const vps=[{width:320,height:900},{width:1440,height:1000}];(async()=>{const b=await chromium.launch({headless:true});const bad=[];for(const vp of vps)for(const route of routes){const p=await b.newPage({viewport:vp});const response=await p.goto("http://127.0.0.1:8096"+route,{waitUntil:"domcontentloaded",timeout:30000});await p.evaluate(()=>document.fonts&&document.fonts.ready);if(!response||response.status()!==200)bad.push(`${route} ${vp.width}px HTTP ${response&&response.status()}`);const rows=await p.evaluate(()=>{const out=[];for(const el of document.querySelectorAll("body *")){if(el.closest("[aria-hidden=true]"))continue;const cs=getComputedStyle(el),r=el.getBoundingClientRect();if(cs.display==="none"||cs.visibility==="hidden"||+cs.opacity===0||!r.width||!r.height)continue;const direct=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||el.matches("input,textarea,select,button");if(direct&&parseFloat(cs.fontSize)<15.999)out.push({size:cs.fontSize,tag:el.tagName.toLowerCase(),id:el.id,cls:typeof el.className==="string"?el.className.trim().replace(/\s+/g,".").slice(0,80):"",text:(el.innerText||el.placeholder||el.getAttribute("aria-label")||"").replace(/\s+/g," ").trim().slice(0,60)});for(const pseudo of ["::before","::after"]){const ps=getComputedStyle(el,pseudo),content=ps.content;if(content&&content!=="none"&&content!=="normal"&&parseFloat(ps.fontSize)<15.999)out.push({size:ps.fontSize,tag:el.tagName.toLowerCase()+pseudo,id:el.id,cls:typeof el.className==="string"?el.className.trim().replace(/\s+/g,".").slice(0,80):"",text:content.slice(0,60)})}}return out});for(const row of rows)bad.push(`${route} ${vp.width}px ${JSON.stringify(row)}`);await p.close()}await b.close();if(bad.length){console.error(bad.join("\n"));process.exit(1)}console.log("60 renders, min >= 16px")})().catch(e=>{console.error(e);process.exit(1)})'
```

每頁會等待 `document.fonts.ready`，掃描直接文字、placeholder、按鈕文字與 `::before`／`::after`，並跳過 `[aria-hidden="true"]`。

Expected：60 次頁面載入皆為 200，`min >= 16`、0 offenders。

- [ ] **Step 3：驗證 200% 文字放大與 WCAG 1.4.12 覆寫**

Run（以 Step 2 的同一組 `routes` 執行兩種模式）：

```bash
node -e 'const {chromium}=require("playwright");const routes=["/","/about","/access","/space","/system","/fellow","/partner","/startup","/cis","/member","/en/","/en/about","/en/access","/en/space","/en/system","/en/fellow","/en/partner","/en/startup","/en/cis","/en/member","/ja/","/ja/about","/ja/access","/ja/space","/ja/system","/ja/fellow","/ja/partner","/ja/startup","/ja/cis","/ja/member"];const modes=["zoom","spacing"];(async()=>{const b=await chromium.launch({headless:true});const bad=[];for(const mode of modes)for(const route of routes){const p=await b.newPage({viewport:{width:320,height:900}});await p.goto("http://127.0.0.1:8096"+route,{waitUntil:"domcontentloaded",timeout:30000});await p.evaluate(()=>document.fonts&&document.fonts.ready);if(mode==="zoom")await p.evaluate(()=>{document.documentElement.style.fontSize="200%"});else await p.addStyleTag({content:"*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}"});const result=await p.evaluate(()=>{const clipped=[];for(const el of document.querySelectorAll("body *")){if(el.closest("[aria-hidden=true]")||el.closest(".cis-toc__inner")||el.tagName==="IFRAME")continue;const cs=getComputedStyle(el),r=el.getBoundingClientRect(),direct=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());if(!direct||cs.display==="none"||cs.visibility==="hidden"||!r.width||!r.height)continue;const x=["hidden","clip"].includes(cs.overflowX)&&el.scrollWidth>el.clientWidth+1;const y=["hidden","clip"].includes(cs.overflowY)&&el.scrollHeight>el.clientHeight+1;if(x||y)clipped.push(`${el.tagName.toLowerCase()}#${el.id}.${typeof el.className==="string"?el.className.trim().replace(/\s+/g,"."):""}`)}return {overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,clipped}});if(result.overflow>0||result.clipped.length)bad.push(`${mode} ${route} overflow=${result.overflow} clipped=${result.clipped.join(",")}`);await p.close()}await b.close();if(bad.length){console.error(bad.join("\n"));process.exit(1)}console.log("60 zoom/spacing renders, no clipping")})().catch(e=>{console.error(e);process.exit(1)})'
```

兩種模式分別等同於注入：

```js
document.documentElement.style.fontSize = '200%';
```

以及：

```css
*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}
p{margin-bottom:2em!important}
```

以這個條件判斷文字裁切：含直接文字的可見元素若 `overflow-x/y` 為 `hidden` 或 `clip`，且 `scrollWidth > clientWidth + 1` 或 `scrollHeight > clientHeight + 1`，即列為失敗。`iframe` 地圖及 `.cis-toc__inner` 單軸捲動不列為文字裁切。

Expected：0 個文字裁切、重疊或遺失功能；320px 的文件寬度等於 viewport 寬度。

- [ ] **Step 4：建立五張前後可比的手機截圖並人工檢查**

```js
const screenshots = ['/', '/access', '/fellow', '/startup', '/cis'];
```

以 390×844 截至：

```text
/tmp/tth-typography-home.png
/tmp/tth-typography-access.png
/tmp/tth-typography-fellow.png
/tmp/tth-typography-startup.png
/tmp/tth-typography-cis.png
```

檢查品牌副標、眉標、數字單位、按鈕、頁尾與 CIS 圖說均清楚；允許換行與區塊增高，不接受裁切、縮放或省略。

- [ ] **Step 5：最後驗證工作樹與測試**

Run：

```bash
git diff --check
npm test
git status --short --branch
```

Expected：`git diff --check` 無輸出；至少 176 tests、0 fail；工作樹除已提交內容外乾淨。

Step 2–4 必須全部為 0 fail；任何失敗都不得完成 Task 4 或提交完成回報，應依 `superpowers:systematic-debugging` 回到實際輸出的 selector 追查根因。
