# 台灣人才聚落官網 · taiwan-talent-hub-website

單一 Node/Express 伺服器，同源提供三部分：

| 路徑 | 內容 |
|------|------|
| `/`、`/en/`、`/ja/` | 靜態官網（中／英／日三語系） |
| `/cis/`、`/en/cis/`、`/ja/cis/` | 企業識別 CIS（公開 Brand Guidelines） |
| `/fellow` | 言文字創始會員站（一頁式 SPA，含登入／會員儀表板／後台／Stripe 結帳） |
| `/api/*`、`/auth/google/*` | 後端 REST API 與 Google 登入；資料存 Postgres |
| `/member` | 會員專區（進出 QR、點數錢包、購點／兌換／退款） |
| `/admin` | 後台（會籍、發點、活動、內容） |

前端靜態檔全部在 `public/`（`public/fellow/` 為 fellow 前端），伺服器源碼（`server.js`、`package.json`）不外露。

正式標準網址唯一 `https://www.emoji.tw`；原 `fellow.emoji.tw` 子網域已退役。

## 本地開發

```bash
npm install                        # 或直接沿用既有 node_modules
npm run dev                        # 讀取上層 ../.env
```

`npm run dev` 會以 `--env-file=../.env` 啟動，預設 port 8080。需連本地 DB 時額外帶入：

```bash
PORT=8080 DATABASE_URL="postgres://USER@localhost:5432/fellow_test" \
  PUBLIC_ORIGIN="http://localhost:8080" npm run dev
```

DB 未設定時伺服器優雅降級：靜態頁照常，`/api/*` 回 503。

## 環境變數

| 變數 | 用途 |
|------|------|
| `DATABASE_URL`（或 `POSTGRES_*`） | Postgres 連線 |
| `APP_SECRET` | token 簽章金鑰（務必設定） |
| `ADMIN_CODE` | 後台登入代碼（務必改掉預設 `KK-ADMIN`） |
| `STRIPE_SECRET_KEY` | Stripe 結帳；未設時 `/api/checkout` 回 503 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 會員專區 Google 登入 |
| `PUBLIC_ORIGIN` | 站台對外網址（正式：`https://www.emoji.tw`），供 Stripe 導回與 Google callback |
| `WEB_ORIGINS` | 允許的 CORS／導回白名單（逗號分隔） |

## 部署提醒

- Google OAuth：Console 的授權導回 URI 需設為 `https://www.emoji.tw/auth/google/callback`。
- Stripe 結帳成功／取消導回 `https://www.emoji.tw/fellow`。


## 會員點數（摘要）

- 每點 NT$10；購買本金無效期可退未使用部分；加贈／會籍贈點預設一年、不退現。
- 兌換（須 Active）：淋浴 7 點、膠囊／娛樂室各 10 點／小時；包場現金。
- 規格：`docs/superpowers/specs/2026-07-12-member-points-design.md`
