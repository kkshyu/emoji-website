# 會員 Active 與二三樓門禁（QR／JWT）設計

日期：2026-07-12  
狀態：已核准（方法 A：權益表推導 ＋ QR 地端驗簽）
實作計畫：`docs/superpowers/plans/2026-07-12-member-active-access.md`  
分支／工作區：`admin-no-member-badge`（`.tth-worktrees/admin-no-member-badge`）

## 目標

建立一致的會員與進出模型：

1. **只要登入就是會員**（`users` 一筆即會員）。
2. 會員有 **active／非 active**：僅在持有有效二三樓權益期間為 active。
3. **進出二三樓**經會員頁 QR → 門禁地端驗簽 → 開門；常態僅 **active** 可續發 QR。持有**待啟用**權益者可發「首次啟用」QR，掃碼成功後寫入啟用並成為 active。
4. 購買與啟用會自動反映在 active 狀態；門禁掃碼成功或購後 7 天自動啟用，會啟用「待啟用」權益。

## 非目標

- 真人臉辨識或特定門禁廠商 SDK 對接（本階段以 mock 驗簽／回報）。
- 實體門鎖硬體驅動與現場配線。
- 一樓 Café／Bar 消費、遊樂室包場。（二樓淋浴／膠囊／娛樂室扣點改由 `2026-07-12-member-points-design.md` 承接。）
- 後台側欄「會員」數量 badge（維持不顯示）。
- 改動創始會員認購金額／條款本身（僅把它納入權益／active 規則）。

## 方法

**A — 權益表為準、active 即時推導 ＋ QR／JWT 地端驗簽（已選）**

- 新增 `entitlements` 為二三樓通行權益的唯一來源（SoT）。
- `is_active` **不存死旗標**；讀取時依「現在是否落在任一有效權益」推導。
- 會員頁發短效簽名 token（QR）；門禁機以共用金鑰地端驗簽後開門；成功後回報伺服器（啟用／稽核）。
- 門禁回報與自動啟用排程先以 mock／內部 API 驗證，真機後只換呼叫端。

否決：B（僅在 `users` 快取 `is_active`／`active_until`，易漂移）；C（一次做齊 A＋快取，本階段過量）。

## 領域規則

### 會員

- Google OAuth 登入成功 → 建立或載入 `users` → **即為會員**。
- 「會員」≠「active」。未購方案或權益已過期的會員仍可登入會員頁、報名活動等（既有能力不變），但**不能**取得有效進出 QR。

### Active

- `active === true` 當且僅當存在至少一筆 **已啟用且未到期** 的 entitlement。
- 後台／會員頁顯示推導結果與有效權益摘要。

### 權益起算（關鍵）

| 方案 | 購買後 | 起算 | 長度 | 一週未啟用 |
|------|--------|------|------|------------|
| 創始會籍（founding） | 對應 commitment 已付款／已啟用 | **固定起迄**（commitment `start_date`～`maturity_date`） | 固定期間 | 不適用（無「待啟用進場」；會籍本身已有固定窗） |
| 單日 4h／12h | 建立待啟用 entitlement | **首次門禁掃碼成功** | 4 或 12 小時 | 購後 7 天自動啟用並起算 |
| 月／季／年 | 建立待啟用 entitlement | **首次門禁掃碼成功** | 對應月／季／年 | 購後 7 天自動啟用並起算 |

- **僅創始會籍為固定期間**；其餘一律「購買 → 待啟用 → 首次進入（或 7 天自動）起算」。
- 多筆權益重疊時取**時間聯集**；任一有效即 active。
- 自動啟用：`activated_at = purchase_at + 7 days`（若當下仍未啟用）；方案長度自該時刻起算。實作可用排程掃描，或在發 QR／回報／讀狀態時懶惰補寫（須冪等）。

### 進出與 QR

1. 使用者打開會員頁出示 QR。
2. 門禁讀取 QR，以與伺服器**共用的金鑰**做地端有效性驗證（JWT／HMAC 同等機制：驗簽＋`exp`＋必要聲明）。
3. 驗證成功 → 開門。
4. 開門後（有網時）回報伺服器：稽核紀錄；若該 entitlement 仍待啟用 → 寫入 `activated_at` 並起算方案長度。

誰能拿到可開門的 QR：

- 目前 active（已啟用且未到期）；或
- 持有至少一筆**尚未啟用**的非創始權益（首次掃碼用以啟用）。若已逾購後 7 天，發碼前先懶惰自動啟用，再以 active 規則發碼。

否則不發有效 token，頁面說明不可進出二三樓的原因。

## 資料模型（概念）

### `entitlements`

| 欄位 | 說明 |
|------|------|
| `id` | 主鍵 |
| `user_id` | 會員 |
| `plan` | `day_4h`／`day_12h`／`month`／`quarter`／`year`／`founding` |
| `source` | 來源（如 `stripe`／`commitment`／`admin`）與外部 id |
| `purchased_at` | 購買／確認時間 |
| `activated_at` | 可空；創始可於建立時即填（等於起算點）或等價以固定窗表達 |
| `starts_at`／`ends_at` | 創始：固定窗；其餘：啟用後寫入或由 `activated_at + duration` 推導 |
| `duration` | 非創始：小時或日曆長度（依 plan） |
| `status` | 可選冗餘：`pending`／`active`／`expired`（仍以時間推導為準） |

既有 `commitments` **保留**為創始認購 SoT；啟用後確保對應一筆 `plan=founding` entitlement（同步規則實作計畫細化）。

### Access token（QR payload）

短效（建議 30–60 秒，頁面自動刷新），簽名聲明至少含：

- `sub`：user id  
- `ent`：選用的 entitlement id（待啟用或當前有效）  
- `plan`／`floors`：如 `["2","3"]`  
- `iat`／`exp`  
- 可選 `pending_activation: true`（地端仍可開門；回報負責啟用）

金鑰：環境變數（如 `ACCESS_QR_SECRET`），與門禁 mock／真機設定相同；未設定時門禁相關發碼／驗簽 API 明確失敗。

## API 與元件（概念）

| 端點／元件 | 職責 |
|------------|------|
| `GET /api/me/access-qr`（名稱實作時可調整） | 登入會員取得下一枚短效 token／QR 資料；非授權則 403＋原因碼 |
| `POST /api/access/scan` | 門禁（或 mock）回報掃碼成功；冪等；待啟用則啟用 |
| `POST /api/access/verify`（可選，供 mock／除錯） | 伺服器端驗簽，模擬地端邏輯 |
| 會員頁 | 顯示會員、active、權益、QR 或不可進出說明 |
| 後台會員 | 列表顯示會員＋ active＋權益摘要；側欄不加會員人數 badge |
| Mock 門禁 | 開發／後台工具：貼上 QR 或 token → 驗簽 → 呼叫 scan |

購買成功（Stripe／後台確認等）→ 建立對應 entitlement（非創始為 pending）。

## 錯誤處理

- 簽名無效、過期、聲明不符 → 地端不開門。
- 無 active 且無合法待啟用權益 → 不發 QR。
- `scan` 重複送達 → 冪等，不重算 `activated_at`。
- 金鑰未設定 → 發碼／驗簽失敗，錯誤訊息可診斷。
- 自動啟用與掃碼啟用競態 → 以「首次成功寫入 `activated_at`」為準（DB 條件更新）。

## 測試要點

- 登入即會員；無權益 → 非 active、無 QR。
- 創始固定窗內 active；窗外非 active。
- 月／季／年／單日：購買後 pending；scan 後起算正確長度；7 天未 scan → 自動啟用時間正確。
- 權益重疊聯集。
- JWT 驗簽成功／失敗／過期。
- scan 冪等；自動啟用與 scan 競態只啟用一次。
- 會員頁／後台文案與狀態一致。

## 實作順序建議

1. Schema＋entitlement 建立／推導 `is_active`＋創始同步。  
2. 購買／確認流程寫入 entitlement；7 天自動啟用。  
3. Access token 發碼＋會員頁 QR。  
4. `access/scan`＋mock 門禁。  
5. 後台會員列表欄位調整。  

細部任務與驗收標準由後續 implementation plan 展開。
