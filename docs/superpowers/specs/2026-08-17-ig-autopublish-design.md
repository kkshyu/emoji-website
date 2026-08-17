# IG 自動發文系統設計

日期：2026-08-17
狀態：已核准（方案 A：自建全鏈路，無人審）
關聯：`2026-07-12-ig-studio-design.md`（版型）、`social_posts` 表（行事曆）

## 目標

`social_posts` 中 `platform='ig'`、`status='scheduled'` 的貼文，到 `scheduled_at` 自動 render 版型圖並發佈至 Instagram（@emoji0701）。後續由 AI 補產器維持每週 3-4 則（第二階段）。

## 非目標

- 不做人工審核佇列（使用者已選無人審；風險以 code 層硬檢查壓）。
- 不動既有 admin social CRUD 與 ig-studio 手動下載流程。
- 不處理 Reels／限時動態（僅 feed 圖文：單圖與輪播）。
- 第一階段不含 AI 產文（先讓 19 篇 seed 精修內容自動發）。

## API 選型

**Instagram API with Instagram Login**（新版，host `graph.instagram.com`）：

- 免綁 FB 粉專；IG 帳號須為商業／創作者帳號。
- 已建 Meta App（App ID `1580761187086722`；secret 僅存 Zeabur env，勿入 git）。
- Token：後台「Generate token」產長期 token（60 天）；系統每日 cron 以 `GET /refresh_access_token` 續期，token 持久化於 `site_content` key `ig_access_token`（env `IG_ACCESS_TOKEN` 為初始值）。
- 限制：圖片僅收公開 URL 的 **JPEG**；50 則／24h（遠高於每週 3-4 則）。

## 資料流

```
node-cron（每 5 分，env IG_AUTOPUBLISH=1 才啟用）
  → SELECT social_posts WHERE platform='ig' AND status='scheduled'
      AND scheduled_at <= now()（逐篇處理，防重入鎖）
  → 合規檢查：caption+hashtags+pages 禁用字 regex（住宿|入住|過夜|旅館|hotel|共居|床位
      ＋env IG_BANNED_WORDS 擴充）→ 命中：status='error'，notes 記原因，不發
  → render：puppeteer 開 http://localhost:PORT/ig-render.html
      per page：evaluate 注入 spec → IGStudio.renderSpec → screenshot JPEG 1080×1350
      存 uploads/social/ig-<postid>-p<n>.jpg（既有 /uploads 靜態服務 → 公開 URL）
  → 發佈（graph.instagram.com/v23.0）：
      單頁：POST /{IG_USER_ID}/media {image_url, caption} → POST /media_publish
      多頁：逐頁 media {is_carousel_item} → media {media_type:CAROUSEL, children} → media_publish
  → 成功：status='published'，published_at=now()，external_url=貼文永久連結，images=產出檔清單
  → 失敗：status='error'，notes 記錄；下輪不重試（人工在 admin 改回 scheduled 才重試）
```

## Page spec 正規化

`renderSpec` 只吃攤平格式 `{category,variant,format,...欄位}`；seed 為 `{layout:'06c',fields:{...}}`。`normalizePage()` 兼容：`layout` 拆 `category`+`variant`、`fields` 攤平。photo 僅接受 `/uploads/` 站內路徑或 data URL（沿用 renderSpec 既有守門）。

## 合規（無人審護欄，全在 code 層）

- 禁用字 regex 硬檢查（上述），命中即不發。
- 酒類警語：沿用版型層 `.igp-alcohol` 帶；render 前檢查 `p_alcohol` 頁必須有警語帶（複用 exportSpecPng 守門邏輯）。
- 溢版檢查：`contentOverflows` 任一命中即 error，不發歪圖。
- 總開關：env `IG_AUTOPUBLISH`（預設關）；admin API 可查狀態。

## 介面

- `lib/ig-publisher.js`：`normalizePage`、`checkBanned`、`renderPostImages`、`publishPost`、`refreshToken`、`getToken`。
- server.js：cron 兩條（發佈每 5 分、token 續期每日）；`POST /api/admin/social/:id/publish-ig`（adminOnly，手動即發，測試用）；`GET /api/admin/ig/status`。
- `public/ig-render.html`：headless render 頁（載 style.css＋ig-studio 系列，暴露 `window.renderPage(spec)`）。

## 部署

- deps：`node-cron`、`puppeteer`。
- Zeabur：Dockerfile（node:20-slim＋chromium），env：`IG_USER_ID`、`IG_ACCESS_TOKEN`、`IG_AUTOPUBLISH=1`、（既有 `PUBLIC_ORIGIN`）。
- 本機測試：`IG_AUTOPUBLISH` 不設即不跑 cron；手動 API 可單篇試發。

## 測試

- 單元：normalizePage（兩種格式）、checkBanned、carousel 分支（mock fetch）。
- 整合：token 到手後以測試貼文實發一篇 → 驗證 IG 上線 → 刪文。

## 第二階段（另案）

AI 補產器：每週日 cron 檢查未來 7 天排程不足 3 則 → Claude API 產 `{pages,caption,hashtags,scheduled_at}`（題材輪替、價格僅從 menu-data 帶入）→ 過檢查後直接 `status='scheduled'`。
