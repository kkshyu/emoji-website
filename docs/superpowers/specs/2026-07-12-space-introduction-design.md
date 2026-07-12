# 空間介紹頁（四樓＋菜單＋三語 CMS＋換圖＋導覽）設計

日期：2026-07-12  
狀態：已核准（做法：沿用現有 `/space` 骨架加厚）  
範圍：前台空間頁、後台網站內容／上傳圖、導覽與廢除獨立 `/menu`

## 目標

- 依營運計畫書詳細介紹 **1F–4F**，並在空間頁內嵌 **已發布菜單**。
- 正文、樓層圖、hero 圖均可在後台編輯，免改程式重新部署。
- 三語完整：zh／en／ja 各有空間頁與分語系正文欄位。
- 導覽以「空間介紹」為主；廢除獨立 `/menu` 路由。

## 非目標

- 不新建獨立 `space_*` 資料表（沿用 `site_content`）。
- 不做每樓多圖相簿、裁切／CDN 轉檔 CMS。
- 不在此任務部署 Zeabur Object Storage／MinIO（資料模型預留 URL，日後可遷）。
- 不把首頁 `#floors` 摘要改成後台可編；僅調整導流連結。
- 不改菜單 CRUD API 與 `menu` JSON 模型（僅改前台出現位置與文案）。

## 方法

**沿用現有骨架加厚**：`public/space.html`、`public/en/space.html`、`public/ja/space.html`、後台「網站內容」、既有 `POST /api/admin/content` 與 `GET /api/public`。

否決：整包 `space` JSON 文件重做後台；靜態 Markdown 雙真相來源。

---

## 前台頁面結構

路徑：

| 語系 | URL |
|------|-----|
| zh | `/space` |
| en | `/en/space` |
| ja | `/ja/space` |

**區塊順序**

1. **Hero**（靜態 UI 文案三語寫死）＋可選 hero 圖（CMS URL）
2. **1F** `#f1` — 標題靜態；正文 Markdown；主圖
3. **菜單** `#menu` — `content.menu` 已發布品項（`MenuLib`）
4. **2F** `#f2`
5. **3F** `#f3`
6. **4F** `#f4` — 標明支援機能、不計營收

錨點統一：`#f1` `#menu` `#f2` `#f3` `#f4`（現有 `menu-section` 改為 `id="menu"`）。

頁內可有簡易樓層跳轉（非頂層 nav 新項目）。無圖 URL 時不渲染 `<img>`，避免破圖。

首頁 `#floors` 保留作摘要；CTA／「探索空間」改連對應語系 `/space`。

---

## 資料模型（`site_content`）

### 正文（Markdown，分語系）

| 鍵 | 說明 |
|----|------|
| `space_1f_zh` / `space_1f_en` / `space_1f_ja` | 一樓 |
| `space_2f_zh` / `space_2f_en` / `space_2f_ja` | 二樓 |
| `space_3f_zh` / `space_3f_en` / `space_3f_ja` | 三樓 |
| `space_4f_zh` / `space_4f_en` / `space_4f_ja` | 四樓 |

舊鍵 `space_1f`／`space_2f`／`space_3f`：讀取時若對應 `_*_zh` 空白則 fallback；seed 與後續儲存以新鍵為準。

### 圖片（URL 字串，三語共用）

| 鍵 | 說明 |
|----|------|
| `space_hero_image` | 頁面 hero |
| `space_1f_image` … `space_4f_image` | 各樓主圖 |

值為公開路徑或絕對 URL（例：`/uploads/space/1f.webp`）。

### 菜單

鍵 `menu` 不變；後台「菜單」分頁 CRUD 不變；前台改在 `/space#menu`（及 en／ja）顯示。

---

## Seed

- 來源：營運計畫書顧客向樓層說明（機能、動線、氛圍）；**不含**貸款、內部敏感數字。
- 時機：伺服器 migrate／啟動，或後台首次開啟「網站內容」時，對**尚不存在**的鍵灌入三語初稿與（可選）預設圖 URL。
- 已存在的鍵不覆寫。

---

## 後台

### 網站內容分頁

- 每樓層：中／英／日三個 Markdown textarea＋一張主圖（上傳或貼 URL＋預覽）。
- 另：hero 圖一組。
- 4F 區塊標示「支援機能」。
- 「儲存所有網站內容」批次 `POST /api/admin/content`。

### 菜單分頁文案

- 凡提及前台 `/menu` 改為「空間頁 `#menu`」。

### 上傳 API（新）

- `POST /api/admin/upload/space`（需 admin auth）
- `multipart` 欄位：`file`；接受 `image/jpeg`｜`image/png`｜`image/webp`；單檔上限 **5MB**
- 寫入可寫目錄（建議專案根或 data 下之 `uploads/space/`，由 server 靜態掛載；上傳產物列入 `.gitignore`，僅保留目錄占位）
- 回傳 `{ url: "/uploads/space/<safe-name>" }`
- 後台可改填外部 URL，不強制上傳

**部署注意**：容器磁碟可能非持久；正式環境應掛 persistent volume，或日後改 S3。資料模型僅存 URL，遷移不改 schema。

---

## 導覽與路由

### 頂層 nav（header partials ×3）

- 移除獨立「菜單／Menu／メニュー」。
- 移除指向首頁 `#floors` 的「系統／Access／システム」。
- 保留「空間介紹／Space／スペース」→ 對應語系 `/space`。
- 建議順序：關於 → **空間介紹** → 聚落計畫下拉 → CIS → 會員 → 語言 → IG。

### Footer

- 「系統」改連 `/space`（或刪除該列）。
- 若有菜單連結 → `/space#menu`（語系對應）。

### 廢除 `/menu`

- 刪除 `public/menu/`、`public/en/menu/`、`public/ja/menu/`。
- `GET /menu`、`/menu/`、`/en/menu`、`/en/menu/`、`/ja/menu`、`/ja/menu/` → **301** 至對應語系 `/space`（hash `#menu` 盡力帶上；客戶端對 redirect hash 支援不一，至少進入空間頁）。
- 更新 `sitemap.xml`、內部連結、`lib/layout.js`（`TRAILING_SLASH`、`NAV_MENU_CURRENT` 等）。

---

## 前台讀取流程

1. 頁面載入 → `GET /api/public`
2. 依 `html[lang]`／路徑選 `space_{n}f_{lang}` → `marked.parse`
3. 讀 `space_hero_image`、`space_{n}f_image` → 有值才插入圖片
4. `MenuLib.parseMenuDoc` → `publishedOnly` → 渲染於 `#menu`

---

## 錯誤處理

| 情境 | 行為 |
|------|------|
| 某樓正文空 | 顯示語系「準備中」類空狀態 |
| 圖 URL 空 | 不渲染 img |
| `/api/public` 失敗 | 正文／菜單顯示無法載入 |
| 上傳非圖／過大 | 4xx＋明確錯誤訊息；不寫檔 |

---

## 測試（實作計畫細化）

- layout：空間頁 `aria-current`；menu slug 不再出現於 nav。
- 內容鍵：fallback 舊 `space_Nf` → 新 `space_Nf_zh`；四樓與 en／ja 鍵可讀寫。
- 上傳：僅 admin；副檔名／MIME 限制；回傳 URL 可被靜態取用。
- 路由：`/menu` 301；sitemap 無獨立 menu；空間頁含 `#menu`。
- 手動：後台改一文一圖 → 三語前台即時反映（已發布菜單）。

---

## 決策摘要

| 項目 | 決定 |
|------|------|
| 做法 | 沿用 `/space` 骨架加厚 |
| 樓層 | 1F–4F 完整區塊 |
| 菜單 | 僅 `/space#menu`；不保留 `/menu` |
| 文案 | 營運計畫三語 seed |
| 多語 | 每樓分 zh／en／ja 欄位 |
| 圖片 | hero＋每樓 1 張；上傳或 URL；本機 `uploads/space/` |
