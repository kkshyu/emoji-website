# 菜單管理（後台 CRUD + 前台／IG 共用）設計

日期：2026-07-12  
狀態：已核准（方法：`site_content` JSON）  
範圍：後台 CRUD、前台 `/menu`、IG 產生器改讀同一資料源

## 目標

管理員可在後台對菜單品項做完整 **Create／Read／Update／Delete**，資料持久化於資料庫；前台公開菜單頁與 IG 貼文產生器共用同一資料源。未發布品項不上前台，但仍可供後台與 IG 內部預覽使用。

## 非目標

- 不新建獨立 `menu_items` 表（首版用 `site_content` JSON）。
- 不做多語菜單文案 CMS（前台頁首版以 zh 為主；en/ja 導覽可後補）。
- 不自動同步 Instagram／不產印菜單 PDF。
- 不在此決策正式菜價法遵核定流程（UI 可標示「發布＝對外可見」）。

## 方法

**採用 `site_content` 鍵 `menu` 存整包 JSON**，沿用既有：

- 寫入：`POST /api/admin/content`（`key=menu`）
- 後台讀：`GET /api/state` → `content.menu`
- 公開讀：`GET /api/public` → `content.menu`（前端自行過濾 `published`）

否決：獨立表 CRUD API、靜態檔寫回 deploy。

## 資料模型

```json
{
  "version": 1,
  "updated_at": "2026-07-12T09:00:00.000Z",
  "items": [
    {
      "id": "m_americano",
      "cat": "COFFEE",
      "zh": "美式咖啡",
      "en": "AMERICANO",
      "price": 170,
      "emo": 150,
      "note": "",
      "alcohol": false,
      "published": true,
      "sort": 10
    }
  ]
}
```

### 欄位

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | string | 穩定識別；新建時後端或前端產生 `m_` + 短碼 |
| `cat` | enum | `COFFEE` \| `BEVERAGE` \| `ALCOHOL` \| `FOOD` \| `SNACK` |
| `zh` / `en` | string | 中／英品名；`zh` 必填 |
| `price` / `emo` | number | 原價／會員價；≥ 0 |
| `note` | string | 備註／口味 |
| `alcohol` | boolean | 含酒精；`cat===ALCOHOL` 時強制 `true` |
| `published` | boolean | `true` 才出現在前台 `/menu` |
| `sort` | number | 同分類內排序，小者在前 |

### Seed

若 DB 尚無 `menu` 鍵：後台首次開啟菜單分頁（或 server migrate）以現有 `public/menu-data.js` 灌入，全部預設 `published: false`（避免未核定價格自動上前台）。管理員確認後再逐項或批次發布。

## 後台 CRUD（「菜單」分頁）

位置：`admin.html` 新分頁，建議插在「IG 貼文」旁。

### Create
表單：分類、中英名、雙價、備註、酒精、發布、排序 → 追加至 `items` → 整包存檔。

### Read
依 `cat` 分組列表；可搜尋 zh／en；顯示發布狀態與酒精標記。

### Update
列上編輯或同一表單載入後覆寫該 `id`；存檔寫回整包 JSON。

### Delete
確認對話後自 `items` 移除並存檔。首版不做軟刪。

### 驗證（存檔前）
- `zh` 非空；`price`／`emo` 為有限數字且 ≥ 0
- `cat` 為允許枚舉
- `alcohol`：若 `cat==='ALCOHOL'` 或 note 含「含酒精」→ `true`
- JSON 大小合理（建議拒收 > 500KB）

### 存檔
```
POST /api/admin/content
{ "key": "menu", "value": "<stringified doc>" }
```
成功後 toast、刷新 state。

## 前台 `/menu`

- 新增 `public/menu/index.html`（CIS：墨／紙／唯一黃、明體標題）。
- 自 `/api/public` 取 `content.menu`，只渲染 `published===true`，按 `cat`＋`sort`。
- 酒類品項或分類區塊附簡短警語（未滿十八歲禁止飲酒／禁止酒駕）。
- 無已發布品項：顯示「菜單準備中」。
- 導覽：zh 加入「菜單」；en／ja 首版可連到同頁或暫緩（實作計畫標明）。
- sitemap 加入 `/menu`。

## IG 產生器

- `MENU_DATA` 改為優先讀 `content.menu` 解析後的 `items`（後台 state）；若無則 fallback seed 檔。
- 下拉含未發布品項（內部預覽），但 UI 標示未發布。
- 酒精品項仍走既有警語／阻擋匯出邏輯（`alcohol` 旗標）。

## 檔案異動

| 動作 | 路徑 |
|---|---|
| 可能微調 | `server.js`（migrate seed 可選；`/api/public` 已回 content） |
| 修改 | `public/admin.html`（菜單分頁 CRUD） |
| 修改 | `public/ig-studio.js`（讀 state menu） |
| 修改 | `public/menu-data.js`（標明僅 seed；或改由 admin seed 引用） |
| 新增 | `public/menu/index.html`（＋頁內或共用 CSS） |
| 修改 | nav 產生器／各語 nav、`sitemap.xml` |
| 新增 | `docs/superpowers/specs/2026-07-12-menu-management-design.md`（本檔） |

## 錯誤處理

- 無效 JSON／驗證失敗 → 400 或前端擋存並 toast。
- DB 不可用 → 既有 `requireDb` 行為。
- 前台 API 失敗 → 顯示錯誤／準備中，不崩潰。

## 驗收

1. 後台可新增品項，重整後仍在。  
2. 可編輯價格／名稱／分類並存檔。  
3. 可刪除品項，列表與 IG 下拉同步消失。  
4. `published=false`：前台 `/menu` 不顯示；後台與 IG 仍可見。  
5. `published=true`：前台顯示正確分類與雙價。  
6. 酒類在前台有警語；IG 選酒類仍有產圖警語帶。  
7. 空發布列表時前台為「菜單準備中」。  
8. 未登入可開 `/menu` 與 `/api/public`（無 PII）。

## 風險與後續

- 整包 JSON 覆寫有遺失併發編輯風險：首版單管理員可接受；之後可加 `updated_at` 樂觀鎖。  
- 菜單 owner 核定前建議維持多數 `published:false`。  
- 若 JSON 變大或需報表，再遷移至獨立表（非本版）。
