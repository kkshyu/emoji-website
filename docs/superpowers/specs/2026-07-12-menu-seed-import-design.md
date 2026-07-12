# 菜單 Seed 匯入網站（全發布）設計

日期：2026-07-12  
狀態：已核准（做法：migrate 自動 seed；本次強制覆寫為 seed 並全部 `published: true`）  
範圍：將 `public/menu-data.js` 灌入 `site_content.menu`，使 `/space#menu` 對外顯示

## 目標

- 把既有菜單 seed 寫入資料庫 `site_content` 鍵 `menu`。
- 全部品項 `published: true`，空間頁（zh／en／ja）`#menu` 區塊立刻顯示價目。
- 新環境啟動時若尚無 `menu` 鍵，自動灌入（比照空間文案 seed）。

## 非目標

- 不改價目內容、不加 SNACK 品項。
- 不重做後台菜單 CRUD UI／API。
- 不自動同步 Instagram、不產 PDF。
- 不每次重啟都覆寫後台已手動編輯的菜單（見覆寫策略）。

## 方法

**採用伺服器 migrate 時 `seedMenuContent()`**，沿用 `seedSpaceContent` 模式。

否決：僅手動後台存檔；每次重啟無條件覆寫（會洗掉營運編輯）。

## 資料來源與模型

來源：`public/menu-data.js` → `window.__MENU_SEED`（約 28 筆：COFFEE／BEVERAGE／ALCOHOL／FOOD）。

寫入文件格式（與既有菜單管理一致）：

```json
{
  "version": 1,
  "updated_at": "<ISO8601>",
  "items": [
    {
      "id": "m_coffee_americano",
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

### 穩定 `id`

依 `cat`＋`en`（缺 `en` 則用 `zh`）產生固定 slug：`m_<cat小寫>_<slug>`，例如 `m_coffee_americano`。  
禁止每次 `Math.random`（避免 IG／後台對不上、覆寫後 id 飄移）。

### 發布

本次匯入與 auto-seed：**全部 `published: true`**（使用者明確選擇）。

## 覆寫策略

| 情境 | 行為 |
|------|------|
| DB **沒有** `menu` 鍵 | Insert seed，全部已發布 |
| DB **已有** `menu`，且環境變數 `FORCE_MENU_SEED=1` | Upsert 覆寫為 seed＋全發布（本次匯入用） |
| DB **已有** `menu`，無強制旗標 | **不動**（保留後台編輯） |

本次上線／本機匯入：以 `FORCE_MENU_SEED=1` 啟動（或跑一次性腳本設該旗標）完成覆寫後，之後平常啟動不加旗標。

## 實作要點

| 檔案 | 職責 |
|------|------|
| `lib/menu-seed.js`（新增） | 讀取 seed 列、穩定 id、組 doc、`missing`／`buildMenuSeedDoc({ published: true })`；可被 server 與測試共用 |
| `public/menu-lib.js` | 可選：`fromSeedRows(rows, { published, idFn })`；或由 `lib/menu-seed` 自管正規化，避免瀏覽器／Node 雙軌失控 |
| `public/menu-data.js` | 更新註解：seed 可作為「全發布匯入」原料；仍標明為 seed 來源 |
| `server.js` | `migrate` 呼叫 `seedMenuContent()`；尊重 `FORCE_MENU_SEED` |
| `scripts/test-menu-seed.mjs`（新增） | 穩定 id、published 預設、doc 驗證 |

前台無需改路由：既有 `/space` 已讀 `content.menu`＋`MenuLib.publishedOnly`。

## 錯誤處理

- Seed 檔缺失／解析失敗 → migrate 記 log，不中斷整個服務啟動（或 throw 視現有 space seed 風格對齊）。
- 驗證失敗（空 zh、非法 cat）→ 不寫入並 log。
- `FORCE_MENU_SEED=1` 覆寫成功後 log 一行，提醒營運之後勿常開此旗標。

## 驗收

1. 空 DB 啟動後，`site_content.menu` 存在，items ≥ seed 筆數，且皆 `published: true`。
2. `FORCE_MENU_SEED=1` 可覆寫既有未發布／舊 menu。
3. 不加旗標時，既有已編輯 menu 不被覆寫。
4. `GET /api/public` → `content.menu` 可解析；`/space#menu` 顯示分類與雙價。
5. 酒類仍有前台警語；穩定 id 重跑 seed 不變。

## 風險與後續

- 價格尚未法遵核定即對外可見：可接受（本次決策）；之後可於後台取消發布。
- `FORCE_MENU_SEED` 誤開會洗資料：文件與啟動 log 警示；預設關閉。
- 長期若需報表／併發編輯，仍可遷獨立表（非本版）。
