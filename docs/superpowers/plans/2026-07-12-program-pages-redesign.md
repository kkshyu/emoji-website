# 計畫頁版型重設計 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 fellow／partner／startup 三個計畫頁各自採用配合計畫宗旨的不同版型骨架，全部遵守 CIS，三語同步，且不破壞 fellow 既有購買/進度條 JS。

**Architecture:** 三頁續用共享 `styles.css`（CIS token／nav／footer／`.btn`／`.risk-panel` 不動），各頁新增一支專屬版型 CSS 定義獨有骨架；改寫各頁 `index.html` 的 `<main>` 內容區為新骨架。zh 版先定案，再把相同結構套到 en/ja（沿用現有翻譯）。純 CSS Grid/Flex，不新增 JS 相依。

**Tech Stack:** 靜態 HTML＋CSS，Node/Express（`server.js`）本地起站，無頭 Chrome 渲染驗證。無測試框架。

## Global Constraints

逐字取自 spec，每個任務都隱含適用：

- 色：墨 `#1B1A17`／紙 `#FFFFFF`·`#FBFAF6`·`#F4F1EA`／hairline `#E4E0D6`／深墨面 `#16150F`。
- 唯一黃 `#FFDE34`：**每畫面至多一擊**、只當底色、墨字壓其上、不當文字色、不加第二強調色。
- 字體：Noto Serif TC（明體/標題）＋Cormorant Garamond（拉丁/數字）＋Noto Sans TC（內文）。
- 余白：8 節奏間距（8/16/24/32/48/64/96/128）、單一焦點、偏心不置中、手機版保留留白。
- 語氣：短句、無驚嘆號與推銷腔。圖標 Lucide 線性 ~1.5px，禁 emoji/填色。
- 品牌名一律 CIS 定案：zh「言文字｜台灣人才聚落」／en「Emoji - Taiwan Talent Hub」／ja「言文字｜台湾タレントハブ」；分隔符全形直線 `｜`。**修正本分支殘留的舊分隔符「——」**。
- 新版型 class 加頁面前綴：fellow=`fnd-`／partner=`ptn-`／startup=`stp-`，避免與共享類別衝突。
- 不動 `server.js`、路由、購買後端、i18n、首頁、會員頁、後台；不重構共享 `styles.css`。
- 處理靜態 HTML／無頭 Chrome 一律**停用沙盒**（memory 硬性規定）。
- 每個任務結束一次 commit（feature 分支 `redesign-program-pages`，不 push）。

---

### Task 0: 環境與基準

**Files:**
- Modify: 無（僅安裝相依與建立基準截圖）

- [ ] **Step 1: 安裝相依**

Run（停用沙盒）：`cd <worktree> && npm install`
Expected: express/pg/stripe 裝好，`node_modules/` 出現。

- [ ] **Step 2: 起站**

Run（背景、停用沙盒）：`node --env-file=../.env server.js`（無 .env 也可 `node server.js`，購買/DB 功能降級不影響版型）
Expected: 監聽某 port（讀 server.js 確認，通常 3000）。

- [ ] **Step 3: 存三頁改版前基準截圖**

用無頭 Chrome 渲染 `/fellow`、`/partner`、`/startup`，各存一張 `_before-<page>.png`（放 worktree 外的 scratchpad，不入版控）。
Expected: 三張截圖確認站起得來、頁面現況可見，供改版後對比。

- [ ] **Step 4: Commit（無程式碼變更則略過，僅記錄基準已建立）**

不需 commit；基準截圖不入版控。

---

### Task 1: startup zh —「橋樑・賽程」

**Files:**
- Create: `public/startup/startup.css`
- Modify: `public/startup/index.html`（`<head>` 加 `<link rel="stylesheet" href="/startup/startup.css">`、`<main>` 內容改新骨架、`<title>`/meta/JSON-LD/footer 品牌名改 `｜`）

**Interfaces:**
- Consumes: 共享 `styles.css`（`.site-nav`／`.foot`／`.btn`／`.btn-seal`／`.btn-ghost`／`.risk-panel`／`.wrap` 沿用）、`nav.js`、`#logo-tw` symbol。
- Produces: `stp-` 前綴版型類別（供 en/ja 於 Task 4 沿用相同 class）。

- [ ] **Step 1: 寫 `startup.css` 骨架**

以 CIS token 定義下列 `stp-` 類別（純 CSS，深色/黃只一擊）：
- `.stp-hero`：雙向橋 hero。中央 `台灣新創 ⇄ 世界新創`，用 Flex 三欄（左標籤／中箭頭 motif／右標籤）；箭頭以 CSS（border/лин* pseudo）畫雙向，墨色。
- `.stp-track`：三梯次時間軸。橫向 Flex，三站點 `MAR/JUN/SEP`，站點間以 `::before` 畫連線（hairline `#E4E0D6`）；「下一梯」站點加 `.is-next` → 黃底墨字（**本頁唯一黃擊**）。手機版轉直式。
- `.stp-flow`：四階段跑道 `Apply→Talk→Select→Run`，橫向箭頭串接，手機轉直。
- `.stp-lanes`：三大支援三跑道並行（Grid 3 欄，手機 1 欄）。
- `.stp-bridge`：適合對象兩端對望（Grid 2 欄＋中央交會標記；`TW→World`／`World→TW`）。
- `.stp-why`：六項為什麼是我們（Grid，不必卡片化，可用編號清單）。
Expected: 檔案存檔，無語法錯誤。

- [ ] **Step 2: 改寫 `startup/index.html` 的 `<main>`**

依序：`.stp-hero` → `.stp-track`＋`.stp-flow` → `.stp-lanes` → `.stp-bridge` → `.stp-why` → 誠實須知（沿用共享 `.risk-panel`）→ 聯絡 CTA（`.btn-seal`）。文案沿用現有 startup 內容（梯次、四階段、三支援、兩端、六項、誠實須知、聯絡表）。`<head>` 加 `startup.css` link。品牌名 `——`→`｜`（title/og/twitter/JSON-LD/footer 共 8 處）。
Expected: HTML 結構完成。

- [ ] **Step 3: 無頭 Chrome 渲染驗證（停用沙盒）**

渲染 `/startup` 存 `_after-startup.png`。檢查：
- 三梯次呈時間軸、四階段呈水平跑道（非樓層卡）。
- 黃色只出現一次（下一梯站點 或 CTA，二選一）。
- 明體標題、余白足夠、手機寬度（375px）不破版。
Expected: 骨架與 spec 相符，CIS 三秒檢核過。

- [ ] **Step 4: Commit**

```bash
git add public/startup/startup.css public/startup/index.html
git commit -m "feat(startup): 新創陪跑頁改橋樑/賽道版型（zh）"
```

---

### Task 2: partner zh —「織網・關係」

**Files:**
- Create: `public/partner/partner.css`
- Modify: `public/partner/index.html`

**Interfaces:**
- Consumes: 共享 `styles.css`、`nav.js`、`#logo-tw`。
- Produces: `ptn-` 前綴版型類別（供 en/ja 於 Task 5 沿用）。

- [ ] **Step 1: 寫 `partner.css` 骨架**

- `.ptn-hero`：開放式陳述句 hero，背景加極淡織線 motif（CSS `repeating-linear-gradient` 極低對比 hairline，非強調）。
- `.ptn-ways`：三種合作為主脊。**三大不等寬面板**（Grid `grid-template-columns: 1.1fr 1fr 0.9fr` 之類），各面板標題 `Event Salon／Partner／Circle`＋說明，非小卡尺寸。手機轉直排。
- `.ptn-scenarios`：六情境不規則磚牆。CSS columns（`column-count`）或 Grid 不等 row-span，卡片大小刻意不齊。
- `.ptn-why`：位置—社群—國際—空間，橫向串連（連線 hairline）。
- 唯一黃擊：`.ptn-cta` 的「聊聊合作」按鈕（沿用 `.btn-seal`，其黃在共享樣式內即為黃底墨字）。確認全頁其他處無第二黃。
Expected: 檔案存檔。

- [ ] **Step 2: 改寫 `partner/index.html` 的 `<main>`**

順序：`.ptn-hero` → `.ptn-ways`（三路主脊）→ `.ptn-scenarios`（六情境磚牆）→ `.ptn-why` → 空間與可能性（可沿用共享 `.floors` 或改編）→ 誠實須知（`.risk-panel`）→ 聯絡 CTA。文案沿用現有 partner 內容。`<head>` 加 `partner.css` link。品牌名 `——`→`｜`。
Expected: HTML 完成。

- [ ] **Step 3: 無頭 Chrome 渲染驗證（停用沙盒）**

渲染 `/partner` 存 `_after-partner.png`。檢查：三路為不等寬主脊（非均一小卡）、六情境為不規則磚牆、黃只一次、明體＋余白、375px 不破。
Expected: 與 spec 相符，CIS 過。

- [ ] **Step 4: Commit**

```bash
git add public/partner/partner.css public/partner/index.html
git commit -m "feat(partner): 社群夥伴頁改織網/關係版型（zh）"
```

---

### Task 3: fellow zh —「邀請函・限量名冊」（保留購買/進度條 JS）

**Files:**
- Create: `public/fellow/founding.css`
- Modify: `public/fellow/index.html`（僅版型與品牌名；**不改 `app.js`、不動 `data-go`／`data-buy`／`#hero-fund-*` id／`.view` 結構的 JS 掛鉤**）

**Interfaces:**
- Consumes: 共享 `styles.css`、`fellow/styles.css` 既有類別、`app.js`（`data-buy`／`data-go`／`#hero-fund-bar`／`#hero-fund-pct`／`#hero-fund-raised`／`.toast`）。
- Produces: `fnd-` 前綴版型類別（供 en/ja 於 Task 6 沿用）。

- [ ] **Step 1: 讀 `app.js` 確認 JS 掛鉤**

Run: 讀 `public/fellow/app.js`，列出所有依賴的 selector/id/data-attr（`data-go`／`data-buy`／`data-bar`／`#hero-fund-pct`／`#hero-fund-bar`／`#hero-fund-raised`／`.view` id 如 `view-home`/`view-why-now`…／`#toast`）。
Expected: 一份「不可更名」清單；改版型時全部保留。

- [ ] **Step 2: 寫 `founding.css` 骨架**

- `.fnd-hero`：邀請函式。明體大標偏心直落＋KK 親筆信為脊；條款卡帶印章/裁切線質感。名額進度條區塊（沿用既有 `#hero-fund-*` id）放大為**稀缺主視覺**＝本頁唯一黃擊（進度填色或計數 `NN/100` 用黃底墨字）。
- `.fnd-roster`：創始牆座號長條 001–100，橫向捲動或密排小格（CSS Grid `repeat(auto-fill)`），純裝飾 motif、低對比。
- `.fnd-index`：hub 五主題改「目次」直式編號清單（01–05），保留各 `data-go` 值不變，只換外觀（非均一卡）。
Expected: 檔案存檔。

- [ ] **Step 3: 改寫 `fellow/index.html` 版型**

`<head>` 加 `founding.css` link。`#view-home` 的 hero 與 hub 套 `.fnd-hero`／`.fnd-index`／`.fnd-roster`；**保留** `data-buy`／`data-go`／`#hero-fund-bar`/`#hero-fund-pct`/`#hero-fund-raised`/`[data-bar]`／`.toast`／各 `.view` section 的 id。其餘分頁（why-now/about/project/membership/risk）可保留現有內頁排版（本案聚焦 hub 首屏差異化）；品牌名 `——`→`｜`（含 JSON-LD/og/footer）。
Expected: 版型換新、JS 掛鉤全在。

- [ ] **Step 4: 無頭 Chrome 渲染＋互動驗證（停用沙盒）**

渲染 `/fellow` 存 `_after-fellow.png`。檢查：
- hero 呈邀請函/名冊語言、名額進度為主視覺、黃只一次。
- **點「了解專案」等 `data-go` 按鈕會切換 view**、**點「成為創始會員」`data-buy` 觸發購買流程（或降級 toast）**、進度條 `#hero-fund-bar` 有被 app.js 設定。
- 375px 不破。
Expected: 版型新且 JS 功能未壞。

- [ ] **Step 5: Commit**

```bash
git add public/fellow/founding.css public/fellow/index.html
git commit -m "feat(fellow): 創始會員頁改邀請函/名冊版型（zh，保留購買/進度條 JS）"
```

---

### Task 4: startup en/ja 同步

**Files:**
- Modify: `public/en/startup/index.html`、`public/ja/startup/index.html`

**Interfaces:**
- Consumes: `public/startup/startup.css`（同一支 CSS，路徑 `/startup/startup.css`）與 Task 1 的 `stp-` class 結構。

- [ ] **Step 1: 套用相同骨架到 en**

把 `public/en/startup/index.html` 的 `<main>` 改成與 zh 相同的 `stp-` 結構，文案用該檔現有英文翻譯；`<head>` 加 `/startup/startup.css` link；品牌名用 `Emoji - Taiwan Talent Hub`。
Expected: en 版結構同 zh。

- [ ] **Step 2: 套用相同骨架到 ja**

同上，`public/ja/startup/index.html`，文案用現有日文翻譯；品牌名 `言文字｜台湾タレントハブ`。
Expected: ja 版結構同 zh。

- [ ] **Step 3: 渲染驗證（停用沙盒）**

渲染 `/en/startup`、`/ja/startup`，檢查骨架與 zh 一致、黃只一次、不破版。
Expected: 三語一致。

- [ ] **Step 4: Commit**

```bash
git add public/en/startup/index.html public/ja/startup/index.html
git commit -m "feat(startup): en/ja 同步橋樑/賽道版型"
```

---

### Task 5: partner en/ja 同步

**Files:**
- Modify: `public/en/partner/index.html`、`public/ja/partner/index.html`

**Interfaces:**
- Consumes: `public/partner/partner.css` 與 Task 2 的 `ptn-` class 結構。

- [ ] **Step 1: 套 en**（`/partner/partner.css` link、`ptn-` 結構、英文文案、品牌名 en）
- [ ] **Step 2: 套 ja**（同上、日文文案、品牌名 ja）
- [ ] **Step 3: 渲染驗證** `/en/partner`、`/ja/partner`（停用沙盒），骨架一致、黃一次、不破版。
- [ ] **Step 4: Commit**

```bash
git add public/en/partner/index.html public/ja/partner/index.html
git commit -m "feat(partner): en/ja 同步織網/關係版型"
```

---

### Task 6: fellow en/ja 同步

**Files:**
- Modify: `public/en/fellow/index.html`、`public/ja/fellow/index.html`

**Interfaces:**
- Consumes: `public/fellow/founding.css` 與 Task 3 的 `fnd-` class；en/ja fellow 若同樣載入 `app.js`，同樣保留其 JS 掛鉤。

- [ ] **Step 1: 讀 en/ja fellow 現況**，確認是否也用 `app.js`／`data-go`／`data-buy`，列出需保留的掛鉤。
- [ ] **Step 2: 套 en**（`founding.css` link、`fnd-` hero/index/roster、保留 JS 掛鉤、英文文案、品牌名 en）
- [ ] **Step 3: 套 ja**（同上、日文文案、品牌名 ja）
- [ ] **Step 4: 渲染＋互動驗證** `/en/fellow`、`/ja/fellow`（停用沙盒）：版型一致、`data-go`/`data-buy` 可運作、黃一次、不破版。
- [ ] **Step 5: Commit**

```bash
git add public/en/fellow/index.html public/ja/fellow/index.html
git commit -m "feat(fellow): en/ja 同步邀請函/名冊版型（保留購買 JS）"
```

---

### Task 7: 全站終檢與品牌名掃描

**Files:**
- Modify: 視掃描結果修正殘留

- [ ] **Step 1: 舊分隔符掃描**

Run: `grep -rn '言文字——' public/{fellow,partner,startup,en,ja} 2>/dev/null`
Expected: 無輸出（全部已改 `｜`）；有殘留則修掉。

- [ ] **Step 2: 九頁 CIS 三秒終檢（停用沙盒）**

無頭 Chrome 逐一渲染 9 頁（zh/en/ja × fellow/partner/startup），逐頁確認：焦點單一、黃只一次、標誌留白足、手機版（375px）保余白、三頁骨架彼此明顯不同。
Expected: 全過；記錄任何例外並修正。

- [ ] **Step 3: fellow 三語購買/導覽最終互動檢查**

`/fellow`、`/en/fellow`、`/ja/fellow` 各點一次 `data-go` 與 `data-buy`，確認未壞。
Expected: 功能正常。

- [ ] **Step 4: 最終 commit（若 Step 1/2 有修正）**

```bash
git add -A
git commit -m "chore: 計畫頁重設計終檢與品牌名殘留修正"
```

- [ ] **Step 5: 完成回報**

彙整 9 頁改版前後對比，交付使用者決定是否合回 main／處理與 main WIP 的關係（依 finishing-a-development-branch）。

---

## Self-Review

**Spec 覆蓋**：fellow/partner/startup 三頁骨架 → Task 1/2/3；三語 → Task 4/5/6；CIS 約束 → Global Constraints＋各任務 Step 3 驗證；品牌名修正 → 各任務＋Task 7 Step 1；fellow JS 保留 → Task 3 Step 1/4、Task 6；驗證 → 各 Step 3/4＋Task 7。無遺漏。

**Placeholder 掃描**：無 TBD/TODO；CSS 類別職責與 HTML 區塊順序皆具體。設計類任務不逐行貼完整 HTML/CSS（避免在計畫裡把實作寫兩遍），改以「類別＋職責＋排版機制＋驗收條件」界定，執行時產出實際碼。

**型別/命名一致**：class 前綴 `stp-`/`ptn-`/`fnd-` 於定義任務（1/2/3）與同步任務（4/5/6）一致；fellow JS 掛鉤 id（`#hero-fund-bar`/`#hero-fund-pct`/`#hero-fund-raised`／`data-go`／`data-buy`／`data-bar`）跨 Task 3/6 一致且明列「不可更名」。
