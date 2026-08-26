# 計畫文案對齊營運計畫書 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 fellow／partner／startup 三計畫頁與首頁對應區塊（zh／en／ja）的對外承諾嚴格對齊《營運計畫書_母檔》§6.1／§6.3／§6.5，拿掉超賣與自造產品線。

**Architecture:** 純靜態 HTML／導覽 partial 文案替換；不改 CSS 骨架、不改購買後端、不改協議全文。中文先定稿，再對譯 en／ja。驗收以全庫 `rg` 禁詞掃描＋瀏覽器目視為主。

**Tech Stack:** 靜態 HTML、`views/partials/header-*.html`、`views/partials/footer-*.html`、`build_nav.py` 標籤字典（若仍被使用則同步）、Node `server.js` 組裝 header。

**Spec:** `docs/superpowers/specs/2026-07-12-program-copy-align-design.md`

---

## File map

| 檔案 | 職責 |
|------|------|
| `public/fellow/index.html` + `en/` + `ja/` | 創始會員補漏 |
| `public/partner/index.html` + `en/` + `ja/` | 拿掉 Salon／Circle；改 §6.3 活動表 |
| `public/startup/index.html` + `en/` + `ja/` | 降級為探索說明 |
| `public/index.html` + `en/` + `ja/` | `#founding`／`#partners`／`#startup`＋FAQ／JSON-LD |
| `views/partials/header-{zh,en,ja}.html` | 導覽下拉標籤（startup 改名） |
| `views/partials/footer-{zh,en,ja}.html` | 頁尾計畫連結標籤 |
| `build_nav.py` | `prog` 字典與 partial 一致（避免下次 rebuild 覆寫） |

**聯絡信箱統一為：** `us@emoji.tw`（首頁已用；計畫頁內 `kkshyu.tw@gmail.com` 一律改掉）。

**禁詞（驗收必須 0 命中，計畫相關頁）：**  
`Event Salon`、`Event Circle`、`三、六、九月`、`每年三梯次`、`新創陪跑計畫`（改為「新創支援（探索）」後，舊名不得殘留於 title／nav／hero）、`陪你跑完`、`Apply → Talk → Select → Run` 產品流程區塊。

---

### Task 1: fellow 中文補漏

**Files:**
- Modify: `public/fellow/index.html`
- Test: `rg` 驗收指令（本 task 結尾）

- [ ] **Step 1: 條款卡補兩行**

在 `fnd-terms` 內，將贈點列改為含效期，並新增退費列：

```html
<div class="terms-row"><span class="k">贈點</span><span class="v">2,000 點（一年效期）</span></div>
<div class="terms-row"><span class="k">名額</span><span class="v">限量 100 名</span></div>
<div class="terms-row"><span class="k">售止</span><span class="v">2026-10-31</span></div>
<div class="terms-row"><span class="k">退費</span><span class="v">不可退費，僅可轉讓</span></div>
```

- [ ] **Step 2: 會員權益頁對齊 §6.1**

在 `#view-membership`：

1. `mc-t` 改為：`年會員權益延長為 18 個月＋贈點 2,000（一年效期），與一般年費同牌價`
2. 將「二樓膠囊與遊樂室休憩，以點數兌換（10 點／小時）」改為兩行（或一行寫清）：
   - `二樓淋浴 7 點／次；膠囊與娛樂室各 10 點／小時（須 Active；二樓服務於法遵 Gate 通過後啟用）`
3. 刪除任何「以額度折抵」表述（本檔若已無則略過）

- [ ] **Step 3: 誠實須知統一**

在 `#view-risk`（或同等誠實須知區塊）確認並統一為：

- 不可退費，僅可轉讓  
- 會員規章由律師核定（目標 2026/09/15 前）  
- 二樓休憩：法遵 Gate 通過前為條件式服務  

- [ ] **Step 4: 驗證 fellow zh**

```bash
rg -n "一年效期|不可退費，僅可轉讓|淋浴 7 點|法遵 Gate|2026/09/15|09/15" public/fellow/index.html
rg -n "以額度折抵" public/fellow/index.html || true
```

Expected: 前一組有命中；「以額度折抵」無命中。

- [ ] **Step 5: Commit**

```bash
git add public/fellow/index.html
git commit -m "$(cat <<'EOF'
fix(fellow): align founding copy with ops plan §6.1

EOF
)"
```

---

### Task 2: partner 中文重寫（§6.3）

**Files:**
- Modify: `public/partner/index.html`

- [ ] **Step 1: meta／title／JSON-LD**

```html
<title>社群合作｜言文字｜台灣人才聚落</title>
<meta name="description" content="言文字｜台灣人才聚落・社群合作。以三樓活動空間承接 Talent Night、媒合晚餐、講座工作坊、家教與包場等；TDNA Event Partner 場地費支持以書面協議為準。個案討論，以合約為準。">
```

JSON-LD `Service.name`／`description`／breadcrumb 同步拿掉 Event Salon／Circle；改述 §6.3 活動形態。

- [ ] **Step 2: Hero**

```html
<div class="eyebrow">社群合作 · Community Collaboration</div>
<h1>把活動與社群<span class="cn">接到聚落裡</span></h1>
<p class="hero-lead">三樓活動空間、人才社群與 TDNA 國際連結，開放與講師、主辦人、社群與企業個案合作——不是價目表，先看你想辦什麼。</p>
<p class="hero-letter">合作一律個案討論、書面協議。場地使用不得排擠核心社群時段；直銷、投資詐騙、宗教及政治動員活動不予承接。</p>
```

CTA mailto 改 `us@emoji.tw`，subject／body **不得**再列 Event Salon／Partner／Circle。

- [ ] **Step 3: 替換「三種合作方式」為 §6.3 活動表**

刪除 Event Salon／Partner／Circle 三面板。改為六項（可沿用 `ptn-ways-grid` 或 `ptn-wall` 結構）：

| 標題 | 內文要點 |
|------|----------|
| Talent Night | 每週固定；自我介紹、交流、地主媒合 |
| 媒合晚餐 | 每月 2–4 場；6–8 人跨領域 |
| TDNA 系列 | 依協會年曆；本址為 TDNA 台北據點 |
| 講座／工作坊 | 每月 2–4 場；講者優先從會員挖掘 |
| 家教／教學 | 老師免費使用空間、學生付計時費 |
| 外部包場 | 隨需；不得排擠核心社群時段 |

另加一小段 **TDNA Event Partner**：場地費支持原規劃 25–100%，實際比例以書面合作協議、核准程序與憑證為準。

- [ ] **Step 4: 六種情境磚牆**

改寫為與上表一致的情境（家教、講座、社群例會、Demo／發表、企業包場、TDNA／國際），刪 Salon／Circle 用語。

- [ ] **Step 5: 誠實須知＋聯絡**

誠實須知保留個案／合約／明帳互惠，並寫入禁止事項。所有 `mailto:` 與顯示 Email → `us@emoji.tw`。

- [ ] **Step 6: 驗證 partner zh**

```bash
rg -n "Event Salon|Event Circle|kkshyu\.tw@gmail" public/partner/index.html || true
rg -n "Talent Night|媒合晚餐|老師免費|25–100%|書面|us@emoji\.tw" public/partner/index.html
```

Expected: 禁詞無命中；後一組有命中。

- [ ] **Step 7: Commit**

```bash
git add public/partner/index.html
git commit -m "$(cat <<'EOF'
fix(partner): rewrite collaboration copy to ops plan §6.3

EOF
)"
```

---

### Task 3: startup 中文降級為探索（§6.5）

**Files:**
- Modify: `public/startup/index.html`

- [ ] **Step 1: meta／title／JSON-LD**

```html
<title>新創支援（探索）｜言文字｜台灣人才聚落</title>
<meta name="description" content="言文字｜台灣人才聚落・新創支援（探索）。可能形態含登記地址、固定席位與會議室額度、TDNA／CaseCake 媒合；開幕 3 個月後依會員結構評估，不列入財務基準。">
```

- [ ] **Step 2: Hero**

```html
<div class="eyebrow">新創支援（探索） · Startup Support (Exploratory)</div>
<h1>讓台灣新創與世界新創<span class="nb">有機會相遇</span></h1>
<p class="hero-lead">這是探索中的雙向方向：台灣團隊往外、國際團隊落地——尚未定案為固定產品或梯次。</p>
<p class="hero-letter">計畫書將本項列為探索：開幕 3 個月後再依會員結構評估；法務（含登記地址）先經會計師確認。歡迎先登記意向，我們不承諾梯次、名額或成果。</p>
```

CTA：`mailto:us@emoji.tw`，subject 用「新創支援意向」，body **刪除**「希望加入的梯次（三月／六月／九月）」。

- [ ] **Step 3: 刪除召募時間軸與四階段流程**

刪除 `#schedule` 內 MAR／JUN／SEP 三站與 Apply→Talk→Select→Run 整段。改為「可能形態」三階：

1. 登記地址（低成本、高黏著；法務待確認）  
2. 新創方案（登記＋固定席位＋會議室額度）  
3. 媒合資源（TDNA 網絡、CaseCake 接案平台連動）

- [ ] **Step 4: 改寫支援／對象／為什麼是我們**

- 「三大支援」改為「探索方向說明」（培訓／產品／媒合若保留，必須標「可能提供、非保證方案」）  
- 適合對象可留 TW⇄World，但不可暗示已開跑陪跑班  
- 「為什麼是我們」可留簽證／TDNA／Fest／站前據點為**生態系背景**

- [ ] **Step 5: 誠實須知**

必含：

- 探索項目，開幕 3 個月後評估  
- **不列入財務基準與貸款還款來源**  
- 不保證成果；實際內容以日後公告／書面為準  

- [ ] **Step 6: 驗證 startup zh**

```bash
rg -n "三、六、九月|陪跑計畫|Event Salon|kkshyu\.tw@gmail|APPLY|SELECT" public/startup/index.html || true
rg -n "探索|3 個月|財務基準|CaseCake|us@emoji\.tw" public/startup/index.html
```

Expected: 禁詞無命中；後一組有命中。

- [ ] **Step 7: Commit**

```bash
git add public/startup/index.html
git commit -m "$(cat <<'EOF'
fix(startup): reframe as exploratory support per §6.5

EOF
)"
```

---

### Task 4: 首頁中文同步

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: `#founding`**

補一句可見事實：贈點一年效期；不可退費，僅可轉讓（可併入第三卡「名額與起算」或新增短句）。

- [ ] **Step 2: `#partners`**

六格改為：Talent Night／媒合晚餐／講座工作坊／家教教學／外部包場／TDNA 與國際。刪 Salon／Circle。mailto 維持 `us@emoji.tw`。

- [ ] **Step 3: `#startup`**

```html
<span class="eyebrow">Startup Support · 新創支援（探索）</span>
<h2>新創支援仍在探索</h2>
<p>可能形態：登記地址 → 席位與會議室額度 → TDNA／CaseCake 媒合。開幕 3 個月後評估；不列入財務基準。</p>
```

三卡改為：可能形態／決策門檻／雙向方向（非三梯次）。

- [ ] **Step 4: FAQ／JSON-LD**

搜尋並改正任何「陪跑」「三、六、九月」「Event Salon」；創始相關已含一年效期者可不動。

- [ ] **Step 5: 驗證 homepage zh**

```bash
rg -n "三、六、九月|陪跑計畫|Event Salon|Event Circle" public/index.html || true
rg -n "新創支援（探索）|不可退費|Talent Night|財務基準" public/index.html
```

- [ ] **Step 6: Commit**

```bash
git add public/index.html
git commit -m "$(cat <<'EOF'
fix(home): sync program sections with ops-plan copy

EOF
)"
```

---

### Task 5: 導覽／頁尾標籤

**Files:**
- Modify: `views/partials/header-zh.html`、`header-en.html`、`header-ja.html`
- Modify: `views/partials/footer-zh.html`、`footer-en.html`、`footer-ja.html`（若有計畫連結）
- Modify: `build_nav.py` 的 `prog` 字典

- [ ] **Step 1: 更新標籤**

| key | zh | en | ja |
|-----|----|----|-----|
| fellow | 創始會員計畫 | Founding Member | 創始会員プログラム |
| partner | 社群合作 | Community Collaboration | コミュニティ連携 |
| startup | 新創支援（探索） | Startup Support (Exploratory) | スタートアップ支援（探索） |

`header-zh.html` 範例：

```html
<a href="/startup"{{NAV_STARTUP_CURRENT}}>新創支援（探索）</a>
<a href="/partner"{{NAV_PARTNER_CURRENT}}>社群合作</a>
```

- [ ] **Step 2: 同步 `build_nav.py`**

```python
prog={'fellow':'創始會員計畫','partner':'社群合作','startup':'新創支援（探索）'}
# en / ja 同上表
```

- [ ] **Step 3: 驗證**

```bash
rg -n "新創陪跑|Startup Program" views/partials build_nav.py || true
rg -n "新創支援（探索）|Startup Support \(Exploratory\)" views/partials build_nav.py
```

- [ ] **Step 4: Commit**

```bash
git add views/partials/header-*.html views/partials/footer-*.html build_nav.py
git commit -m "$(cat <<'EOF'
fix(nav): rename program labels to match ops-plan framing

EOF
)"
```

---

### Task 6: en／ja 對譯（fellow → partner → startup → home）

**Files:**
- Modify: `public/en/fellow/index.html`、`public/ja/fellow/index.html`
- Modify: `public/en/partner/index.html`、`public/ja/partner/index.html`
- Modify: `public/en/startup/index.html`、`public/ja/startup/index.html`
- Modify: `public/en/index.html`、`public/ja/index.html`

- [ ] **Step 1: fellow en／ja**

對齊 Task 1 事實：gift points 1-year validity；non-refundable, transferable only；shower 7 pts；capsule/playroom 10 pts/hr；Gate conditional；bylaws target 2026-09-15。

- [ ] **Step 2: partner en／ja**

結構與 zh 相同；禁詞英日譯也刪（Event Salon／Circle）。Email → `us@emoji.tw`。

- [ ] **Step 3: startup en／ja**

Title：`Startup Support (Exploratory)`／`スタートアップ支援（探索）`。刪 MAR／JUN／SEP 與四階段。必含：exploratory；review 3 months after opening；not in financial baseline。

- [ ] **Step 4: home en／ja**

`#founding`／`#partners`／`#startup`＋FAQ／schema 與 zh 事實一致。

- [ ] **Step 5: 全語系禁詞掃描**

```bash
rg -n "Event Salon|Event Circle|三、六、九月|新創陪跑計畫|陪你跑完|kkshyu\.tw@gmail" \
  public/fellow public/partner public/startup \
  public/en/fellow public/en/partner public/en/startup \
  public/ja/fellow public/ja/partner public/ja/startup \
  public/index.html public/en/index.html public/ja/index.html \
  views/partials || true
```

Expected: 無命中（若 fellow About 聯絡仍用個人信箱：本輪計畫頁 CTA／合作信箱以 `us@emoji.tw` 為準；fellow「聯絡 KK」個人表可保留 `kkshyu.tw@gmail.com`，但勿出現在 partner／startup／首頁合作 CTA）。

- [ ] **Step 6: Commit**

```bash
git add public/en public/ja public/index.html
git commit -m "$(cat <<'EOF'
fix(i18n): translate ops-plan-aligned program copy

EOF
)"
```

---

### Task 7: 全站驗收

**Files:** 無新增（只驗證）

- [ ] **Step 1: 禁詞＋必備詞掃描**

```bash
# 禁詞
rg -n "Event Salon|Event Circle|三、六、九月|新創陪跑" public views/partials build_nav.py || true

# fellow 必備
rg -n "一年效期|不可退費|1-year|non-refundable|一年有効|返金不可" \
  public/fellow/index.html public/en/fellow/index.html public/ja/fellow/index.html

# startup 必備
rg -n "財務基準|financial baseline|財務基準|探索" \
  public/startup/index.html public/en/startup/index.html public/ja/startup/index.html
```

- [ ] **Step 2: 手動瀏覽（起站）**

```bash
cd /Users/kkshyu/Repos/taiwan-talent-hub/emoji-website && node server.js
```

開啟：`/`、`/fellow`、`/partner`、`/startup` 及 `/en/*`、`/ja/*`。確認導覽標籤、hero、誠實須知；fellow 購買鈕與進度條仍在。

- [ ] **Step 3: 對照 spec 驗收清單勾完**

開啟 `docs/superpowers/specs/2026-07-12-program-copy-align-design.md` 底部驗收，全部打勾或記錄例外。

- [ ] **Step 4: 最終 commit（若尚有修正）**

僅在有未提交修正時 commit；訊息用 `fix(copy): final program-copy acceptance tweaks`。

---

## Spec coverage (self-review)

| Spec 要求 | Task |
|-----------|------|
| fellow 補漏（效期／不可退費／點價／Gate／規章） | 1, 6 |
| partner 去 Salon／Circle、改 §6.3 | 2, 6 |
| startup 探索降級、去梯次 | 3, 6 |
| 首頁三區塊＋FAQ／schema | 4, 6 |
| 導覽改名 | 5 |
| 信箱統一 us@emoji.tw | 2–4, 6 |
| 三語 | 6 |
| 不改協議／CSS／付款 API | 全 plan 未列入修改 |
| 驗收掃描 | 7 |
