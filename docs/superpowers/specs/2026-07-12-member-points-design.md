# 會員點數（購點／贈點／兌換／退款）設計

日期：2026-07-12  
狀態：已核准；實作進行中（branch `member-points`）  
實作計畫：`docs/superpowers/plans/2026-07-12-member-points.md`  
相關設計：`docs/superpowers/specs/2026-07-12-member-active-access-design.md`（會員／active／QR 進出）

## 目標

在既有「登入即會員、active 權益進出二三樓」之上，建立封閉式點數機制：

1. 會員可購買點數（固定方案，多買有加贈）。
2. 會籍付款成功發放贈點；管理員可後台發點。
3. Active 會員可以點數兌換二樓服務：淋浴、膠囊時數、娛樂室時數。
4. 購買點（無效期）可退未使用部分；加贈點不退現，退款時作廢。
5. 包場維持現金（與一樓拆帳），本階段不走點數。

本設計**取代**營運計畫書中的「會籍贈休憩時數」模型：贈送改發點數，加值服務統一扣點。

## 非目標

- 包場點數折抵、點數轉讓、點數兌現（購買點退款除外）、跨店／第三方使用。
- 改動 active／entitlements／QR 門禁核心規則（僅讀取 active 狀態作為兌換門檻）。
- 改動創始認購金額／條款本身（僅在付款成功時依表發贈點）。
- 真人臉、真門鎖、一樓 POS 串接。
- 法律意見書本身（產品規則預留合規表述；正式對外收費前另請律師審閱）。

## 方法

**A′ — `point_lots` 為餘額 SoT、ledger 稽核、可選 `users.points_balance` 快取（已選）**

- 每筆入帳建立 lot：`remaining`、`expires_at`（購買本金為 null＝無效期）、`type`。
- 可用餘額＝未過期 lot 的 `remaining` 加總；扣點依 `expires_at` 由近到遠（null 視為最後）。
- 所有異動寫不可變 `point_ledger`；退款／作廢／沖正可追溯。

否決：B（純 SUM 流水、無 lot，難處理效期與部分退）；C（購買／贈點完全拆成兩套錢包 API，過量——以 lot `type` 區分即可）。

## 領域規則

### 與會員／Active 的關係

| 概念 | 規則 |
|------|------|
| 會員 | Google 登入成功即會員（既有）。 |
| Active | 由 entitlements 推導（既有）；有效期間可進出二三樓。 |
| 購點／看餘額／申請退購買點 | 不要求 active。 |
| 兌換淋浴／膠囊／娛樂室 | **必須 active**（服務在二樓，非 active 無法上楼使用）。 |
| 包場 | 現金；不走點數。 |

### 點數類型與效期

| 類型 | `type` | 效期 | 可退現 |
|------|--------|------|--------|
| 購點本金 | `purchase` | 無效期（`expires_at = null`） | 可退**尚未使用**的 remaining |
| 購點方案加贈 | `bonus` | 入帳起 **1 年** | 否；退該筆購點訂單時剩餘加贈**全部作廢** |
| 會籍贈點 | `membership_gift` | 入帳起 **1 年** | 否；不受購點退款影響 |
| 後台發點 | `admin` | 預設 1 年；管理員可個別設定 | 否（除非後台沖正） |

扣點順序：有效 lot 依 `expires_at` 升序；`expires_at IS NULL` 排最後。同效期可再依 `created_at` 升序。

過期 lot：不計入可用餘額；可排程將 `remaining` 歸零並寫 ledger `expire`（冪等）。

### 購點方案

牌價：每點 10 元。

| 方案 | 本金 | 加贈 | 實得 | 實付 |
|------|------|------|------|------|
| 小 | 50 | 0 | 50 | 500 元 |
| 中 | 100 | 10 | 110 | 1,000 元 |
| 大 | 300 | 45 | 345 | 3,000 元 |
| 超大 | 500 | 100 | 600 | 5,000 元 |

付款成功 → 建立 `point_orders`（已付）→ 本金 lot（purchase）＋加贈 lot（bonus，若加贈＞0）→ ledger。

### 會籍贈點

付款成功當下入帳（不等待首次進場／啟用）：

| 方案 | 贈點 |
|------|------|
| 單日 4h／12h | 0 |
| 月 | 100 |
| 季 | 300 |
| 年 | 1,000 |
| 創始 | 2,000 |

同一會籍訂單／commitment 僅發一次（以 `source`＋外部 id 冪等）。

### 兌換價目（須 active）

| 服務 | 點數 | 使用方式 |
|------|------|----------|
| 淋浴 | 7／次 | 扣點後完成一筆兌換 |
| 膠囊 | 10／小時 | **先買時數再進場**；與娛樂室分帳 |
| 娛樂室一般進出 | 10／小時 | **先買時數再進場**；與膠囊分帳 |
| 遊樂室／三樓包場 | — | 本階段不支援點數 |

膠囊與娛樂室單價相同，但 `point_redemptions.service` 分開，便於營運統計與現場控管。

### 退款（僅購買本金）

1. 會員（或後台代操作）對某筆 `point_orders` 申請退 N 點，N ≤ 該單剩餘 **purchase** lot remaining。
2. 允許**部分退**。
3. 執行時：扣減本金 lot remaining → ledger `refund`；該 order 底下所有 **bonus** lot 若仍有 remaining，一次歸零 → ledger `void_bonus`（已作廢則略過）；金流原路退回對應金額（N × 10 元；加贈無現金價值）。
4. 會籍贈點、其他訂單的點、後台發點：**不因**本次退款而變動。
5. 已兌換消耗掉的本金不可退。
6. 已扣點的兌換（淋浴／已購時數）不因退購點而自動回補；未使用之時數是否可取消退點，實作計畫另定（預設：不自動退點）。

### 後台發點

- 指定會員、點數、`expires_at`（預設 now＋1 年）、備註（必填）。
- 寫 `admin` lot ＋ ledger；可沖正（另筆 ledger，不刪歷史）。

### 合規產品約束（非正式法律意見）

- 定位為**封閉式、僅限本場域指定服務**的預付／贈與點數；不可轉讓、不可提領（購買點依法規與契約之退款除外）。
- 對外文案與會員規章須載明：效期、加贈不退現、退款範圍、僅限本場服務。
- 正式對外收費前請律師確認是否涉及電子支付／預收款等義務；本 spec 不替代法律審查。

## 資料模型（概念）

### `point_lots`

| 欄位 | 說明 |
|------|------|
| `id` | 主鍵 |
| `user_id` | 會員 |
| `type` | `purchase`／`bonus`／`membership_gift`／`admin` |
| `original_amount` | 入帳點數 |
| `remaining` | 剩餘 |
| `expires_at` | 可空；空＝無效期 |
| `source_type`／`source_id` | 如 `point_order`／`commitment`／`admin_grant` |
| `created_at` | 入帳時間 |

### `point_ledger`

| 欄位 | 說明 |
|------|------|
| `id` | 主鍵 |
| `user_id` | 會員 |
| `lot_id` | 可空（跨多 lot 的摘要列可拆多筆） |
| `delta` | 正入負出 |
| `reason` | `purchase`／`bonus`／`membership_gift`／`admin`／`redeem`／`refund`／`void_bonus`／`expire`／`reversal` |
| `ref_type`／`ref_id` | 業務單 |
| `created_at`／`actor` | 時間與操作者（user／admin／system） |

### `point_orders`

方案、本金、加贈、應付金額、付款狀態、付款外部 id、user_id、timestamps。

### `point_redemptions`

`service`（`shower`／`capsule`／`entertainment`）、`points`、`hours`（淋浴可空或 0）、`status`（如 `paid`／`consumed`／`cancelled`）、`user_id`、建立時須驗證 active。

### `point_refunds`

對應 `point_order_id`、退本金點數、退款金額、加贈作廢點數、狀態、金流 id。

可選：`users.points_balance` 整數快取；以 lots 為準校驗。

## API 與介面（概念）

| 端點／畫面 | 職責 |
|------------|------|
| `GET /api/me/points` | 餘額、lots 摘要、即將到期贈點 |
| `GET /api/points/packs` | 購點方案表 |
| `POST /api/me/points/orders` | 建立購點訂單並進入付款 |
| 付款 webhook／確認 | 入帳本金＋加贈（冪等） |
| `POST /api/me/points/redeem` | active 檢查＋扣點＋建 redemption |
| `POST /api/me/points/refunds` | 申請／執行未用本金退款＋作廢該單加贈 |
| `POST /api/admin/points/grants` | 後台發點 |
| `POST /api/admin/points/reversals` | 沖正 |
| 會員頁 | 餘額、購點、兌換、紀錄、退款入口；既有 QR／active |
| 後台 | 點數總覽、發點、退款、流水 |

會籍付款成功路徑（既有 Stripe／commitment 確認）加掛：依 plan 發 `membership_gift`（冪等）。

## 錯誤處理

- 非 active 兌換 → 403＋原因碼。
- 餘額不足、退款超過剩餘本金 → 400；整筆交易失敗。
- 扣點／退款／作廢加贈須同交易、條件更新 `remaining`，防併發超扣。
- 購點／會籍贈點入帳以外部付款 id 冪等。
- 過期與扣點競態：扣點 SQL 條件含「未過期或 expires_at IS NULL」。

## 測試要點

- 購點本金無到期、加贈＋1 年；會籍贈點額度與冪等。
- 扣點效期近先用；不足跨多 lot；購買點最後才扣。
- 非 active 不可兌換；active 可兌換價目正確。
- 部分退本金 → 該單加贈全作廢；會籍贈點不動。
- 後台自訂效期發點；沖正稽核。
- 餘額快取與 lots 一致（若有快取）。

## 實作順序建議

1. Schema：lots／ledger／orders／redemptions／refunds（＋可選 balance 快取）。
2. 入帳引擎：購點付款、會籍贈點、後台發點；餘額查詢。
3. 扣點引擎：效期近先扣；兌換 API＋會員頁。
4. 退款：部分退本金＋作廢加贈＋金流。
5. 後台發點／流水／沖正；過期排程。
6. 與既有會籍付款成功路徑串贈點。

細部任務與驗收標準由後續 implementation plan 展開。
