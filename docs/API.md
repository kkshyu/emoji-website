# API 目錄

言文字｜台灣人才聚落 — 後台與前台 REST API 全清單。供 AI agent 管理資料使用。

> **本檔由 `scripts/test-api-docs.mjs` 強制與 `server.js` 同步。**
> 新增或刪除 `/api/*` 端點卻沒更新本檔，`npm test` 會失敗。請勿手動放寬該測試。

Base URL：`https://www.emoji.tw`（本地：`http://localhost:8080`）
所有請求與回應皆為 JSON（檔案上傳除外，用 `multipart/form-data`）。

## 認證

三種身分，都走 `Authorization: Bearer <token>`：

| 身分 | 憑證 | 用途 |
|---|---|---|
| AI agent | `ADMIN_API_KEY` 環境變數的值 | 管理全部後台資料（等同超級管理員） |
| 會員／管理員 | Google 登入後簽發的 token | 網站前台與後台 UI |
| 門禁裝置 | `ACCESS_DOOR_SECRET` 的值 | 只能打 `/api/access/scan` |

AI agent 用法：

```bash
curl -H "Authorization: Bearer $ADMIN_API_KEY" https://www.emoji.tw/api/state
```

金鑰產生：`openssl rand -hex 32`，設在 Zeabur 環境變數 `ADMIN_API_KEY`。
少於 24 字元會被忽略（視同未設定）。要撤銷就換一組新的並重啟。

**注意事項**

- 金鑰＝超級管理員，可指派管理員、發點數、改所有內容。只存在環境變數，絕不可寫進前端或 commit。
- agent 身分沒有綁定會員（`sub` 為 null），因此所有 `/api/me/*` 與報名類端點會回 403。這是刻意的。
- agent 發放點數時，`point_ledger.actor` 記為 `agent`。

## 慣例

- **Upsert**：`events`、`updates`、`social/posts` 的 POST 帶 `id` 就是更新，不帶就是新增。沒有 PATCH 動詞。
- **時間**：社群貼文的排程時間以台北時間（UTC+8）讀寫，格式 `YYYY-MM-DDTHH:mm`。
- **錯誤**：非 2xx 一律回 `{ "error": "中文訊息" }`。DB 未就緒回 503。

## 公開端點（免認證）

### GET /api/health
服務健康檢查。回 `{ ok, db, dbConfigured }`。

### GET /api/public
公開唯讀資料，無個資：`{ raised, updates, events, content }`。只含「報名中」的活動。

### GET /api/points/packs
點數方案定價表。回 `{ price_twd, packs }`。

### POST /api/checkout
建立 Stripe 結帳（購買創始會籍）。body：`{ lang }`。回 `{ url }`。未設 `STRIPE_SECRET_KEY` 時回 503；超過 `SALE_END`（預設 2026-12-31）回 410；Stripe 已付款數達 `MAX_PARTICIPANTS`（預設 100）回 409。

### GET /api/checkout/verify
付款成功頁驗證。query：`s`（Stripe checkout session id）。向 Stripe 確認 `payment_status=paid` 且為創始會員商品，回 `{ paid }`。

### POST /api/access/verify
驗證進出 QR token 是否有效。body：`{ token }`。回 `{ ok, claims }`。

## 登入

### GET /auth/google
導向 Google OAuth。query：`redirect`（須為白名單來源）。

### GET /auth/google/callback
Google 授權回呼，簽發會員 token 並導回。

## 主要讀取端點

### GET /api/state
**agent 讀取後台資料的主要入口。** 需認證。管理員身分回傳全部：

```
{ role: 'admin', super, me, bond: { target_amount, raised },
  users[], commitments[], entitlements[], events[], content{}, updates[] }
```

`users[]` 每筆含 `access_active`、`access_summary`、`points_balance`。
會員身分則只回自己的資料（`me`、`commitments`、`access`、`points`、`point_orders`、報名中活動）。

## 後台管理（需管理員或 agent 金鑰）

### POST /api/admin/updates
新增或更新最新消息。body：`{ id?, title, content, type, date }`。
`type` 限：`月報`｜`季報`｜`重大事項`｜`活動通知`｜`財務摘要`（不合法則存為 `重大事項`）。
帶 `id` 為更新，找不到回 404。回 `{ ok, id }`。

### DELETE /api/admin/updates/:id
刪除最新消息。

### POST /api/admin/events
新增或更新活動。body：`{ id?, title, description, location, starts_at, capacity, status }`。
`status` 限：`草稿`｜`報名中`｜`已結束`。`starts_at` 為 ISO `YYYY-MM-DDTHH:mm`。
帶 `id` 為更新，找不到回 404。回 `{ ok, id }`。

### DELETE /api/admin/events/:id
刪除活動，報名紀錄一併 CASCADE 清除。

### GET /api/admin/events/:id/regs
該場活動的報名名單（含姓名、email、電話、備註）。回 `{ regs }`。

### POST /api/admin/content
寫入網站內容（key-value，含菜單 `menu` 與空間文案）。body：`{ key, value }`。
永遠是 upsert。讀取請走 `/api/state` 或 `/api/public` 的 `content`。

### GET /api/admin/social/posts
全部 IG／X 貼文規劃。回 `{ posts }`。

### POST /api/admin/social/posts
新增或更新社群貼文。帶 `id` 為更新。body 主要欄位：

- `platform`：`ig`｜`x`
- `post_type`：IG 限 `carousel`｜`image`；X 限 `text`｜`image`
- `status`：`draft`｜`ready`｜`scheduled`｜`published`｜`archived`
- `title`（必填）、`caption`、`caption_en`、`caption_ja`、`hashtags`
- `pages[]`（X 平台會強制清空）、`images[]`、`metrics{}`
- `scheduled_at`、`published_at`：台北時間 `YYYY-MM-DDTHH:mm`
- `external_url`（限 http/https）、`series`、`phase`、`cta`、`audience`、`notes`

### DELETE /api/admin/social/posts/:id
刪除貼文。刪除種子貼文（`sp_seed_*`）會寫入墓碑，避免下次部署復活。

### POST /api/admin/social/:id/publish-ig
立即發布單篇 IG 貼文（不等排程）。成功回 `{ ok, url, images }`；失敗把錯誤寫回貼文 `notes` 並回 502。

### GET /api/admin/ig/status
IG 自動發文系統狀態：token 有無、AI key 有無、未來排程、錯誤與逾期清單、素材庫統計。

### POST /api/admin/ig/compose
手動觸發 AI 補產（正常由每週日 cron 執行）。回 `{ ok, made }`；需 `ANTHROPIC_API_KEY`。

### GET /api/admin/ig/assets
素材庫清單（最新 100 筆）。回 `{ assets }`。

### POST /api/admin/ig/assets
登記素材：body `{ url, note }`。`url` 限 `/uploads/social/` 路徑或 https；`note` 必填（AI 產文要呼應照片內容）。

### POST /api/admin/x/compose
X 貼文 AI 起草：body `{ topic }`，回 `{ ok, draft: { title, caption, caption_ja } }`。
沿用 IG 補產的品牌鐵律與禁用字守門；需 `ANTHROPIC_API_KEY`，未設回 502。

### GET /api/admin/ads/campaigns
廣告投放紀錄列表。回 `{ campaigns }`（日期為 `YYYY-MM-DD` 字串）。

### POST /api/admin/ads/campaigns
新增或更新投放紀錄。帶 `id` 為更新。body 欄位：

- `layer`：`awareness`｜`retarget`｜`action`（三層廣告結構）
- `status`：`planned`｜`running`｜`done`
- `start_date`、`end_date`：`YYYY-MM-DD`；結束日不可早於開始日
- `budget`、`spent`：NT 整數（負值歸零）
- `post_id`：關聯的 social_posts id（選填，須存在）
- `metrics{}`（如 `reach`、`clicks`）、`notes`

### DELETE /api/admin/ads/campaigns/:id
刪除投放紀錄。

### POST /api/admin/upload/social
上傳貼文圖片。`multipart/form-data`，欄位名 `file`，限 5MB 影像。回 `{ url }`。

### POST /api/admin/upload/space
上傳空間介紹圖片。同上限制。回 `{ url }`。

### POST /api/admin/commitments/:id/confirm
確認參與款項入帳：`payment_status` → 已付款、`membership_status` → 已啟用、
使用者 `status` → 已參與，並建立創始會員權益與贈點。

### POST /api/admin/entitlements
建立會員權益。body：`{ user_id, plan, ... }`。

### POST /api/admin/points/grants
發放點數。body：`{ user_id, amount, note（必填）, expires_at? }`。預設一年後到期。

### GET /api/admin/users/:id/points
指定會員的點數餘額與批次明細。

### POST /api/admin/points/orders/:id/fulfill
手動完成點數訂單（Stripe webhook 失敗時的補救）。

### POST /api/admin/users/:id/admin
指派或取消管理員。body：`{ admin: boolean }`。**限超級管理員或 agent 金鑰。**

## 會員端點（agent 一律 403）

以下需綁定會員身分，agent 金鑰打會得到 403。

### GET /api/me/access-qr
取得 45 秒有效的進出 QR token。

### GET /api/me/points
自己的點數餘額與批次。

### POST /api/me/points/redeem
以點數兌換服務（休憩、淋浴）。

### POST /api/me/points/orders
建立點數加值訂單（走 Stripe）。

### POST /api/me/points/orders/:id/fulfill
完成自己的點數訂單。

### POST /api/me/points/refunds
點數退款。

### POST /api/commitments
送出參與（創始會籍）申請。

### POST /api/events/:id/register
報名活動。body：`{ note }`。

### DELETE /api/events/:id/register
取消報名。

## 門禁端點

### POST /api/access/scan
掃描進出 QR，開門並惰性啟用權益。需 `ACCESS_DOOR_SECRET`。
以 `(entitlement_id, token_iat)` 冪等，重掃回 `duplicate: true`。

## 目前沒有 API 的操作

刻意不提供，不是遺漏：

- **改 `users.status` / `can_view`**：`status` 由 `/api/admin/commitments/:id/confirm` 流程驅動，手改會與 commitment 狀態不一致；`can_view` 目前沒有任何邏輯讀取。
- **改／刪 entitlements**：後台 UI 也沒有，需要時再開。
- **刪 users、刪 commitments**：涉及金流與權益，一律走人工。
