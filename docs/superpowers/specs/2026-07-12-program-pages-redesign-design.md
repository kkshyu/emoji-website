# 計畫頁版型重設計 — 設計 Spec

**日期**：2026-07-12
**分支**：`redesign-program-pages`（自 `84fb2b0` 分出，不含 main 未提交 WIP）

## 目標

三個計畫頁（fellow / partner / startup）目前共用同一套版型元件（`/fellow/styles.css` 的 hero-grid＋terms-card＋cards＋floors＋risk-panel），只有文字不同、骨架雷同。本案讓**每頁的版型語言配合其計畫宗旨而不同**，同時全部遵守 CIS。

## 範圍

- **頁面**：fellow、partner、startup 三頁全做。
- **語系**：zh / en / ja 三版同步；en/ja 沿用現有翻譯文案，只換版型骨架。共 9 個 `index.html`。
- **fellow 功能保留**：`data-go` 分頁切換、`data-buy` Stripe 購買、名額進度條、`app.js` 邏輯**不得破壞**；只改版型與視覺。

## 硬性約束（CIS，不可違反）

依 `余白 · 言文字 CIS`：
- 色：墨 `#1B1A17`／紙 `#FFFFFF`·`#FBFAF6`·`#F4F1EA`／hairline `#E4E0D6`／深墨面 `#16150F`。
- **唯一強調色黃 `#FFDE34`**：每畫面至多一擊、只當底色、墨字壓其上、不當文字色、不加第二強調色。
- 字體：Noto Serif TC（明體，標題）＋Cormorant Garamond（拉丁/數字）＋Noto Sans TC（內文）。
- 余白：8 節奏間距、單一焦點、偏心不置中；手機版仍保留留白。
- 語氣：短句、少形容詞、無驚嘆號與推銷腔。圖標 Lucide 線性 ~1.5px、禁 emoji/填色。
- **品牌名修正**：本分支標題仍為舊分隔符「言文字——台灣人才聚落」，一律改為 CIS 定案「言文字｜台灣人才聚落」（en：`Emoji - Taiwan Talent Hub`／ja：`言文字｜台湾タレントハブ`）。

## 三頁版型骨架

### ① fellow 創始會員 —「邀請函・限量名冊」
宗旨：信任・稀缺・親筆邀請。
- Hero：明體大標偏心直落，KK 親筆信為脊；條款卡帶印章感；**名額計數 `NN/100`＋進度條為稀缺主視覺（此頁唯一黃擊）**。
- **創始牆座號長條**（001–100）為貫穿全頁的 motif（「你的號碼」）。
- hub 五主題改為「目次」直式編號清單（01–05），非均一卡片。
- 保留既有 view 分頁與購買流程。

### ② partner 社群夥伴 —「織網・關係」
宗旨：關係、不設定價、先聊。
- Hero：開放式陳述句＋織線 motif。
- **三種合作（Event Salon／Partner／Circle）為主脊**：三大不等寬面板，非縮成小卡（這才是計畫本體）。
- 六種情境：不規則磚牆（masonry，不等大小），非 3×2 均一格。
- 為什麼是言文字：位置—社群—國際—空間，以連線串起。
- 唯一黃擊：「聊聊合作」CTA。

### ③ startup 新創陪跑 —「橋樑・賽程」
宗旨：雙向橋、三梯次、陪你跑。
- Hero：`台灣新創 ⇄ 世界新創` 雙向橋 motif。
- **主脊為方向性時間軸／賽道**：三梯次（MAR/JUN/SEP）為時間軸站點（黃＝下一梯）；四階段流程（Apply→Talk→Select→Run）為水平推進跑道，非樓層卡。
- 三大支援（培訓/優化/媒合）：三跑道並行。
- 適合對象：TW→World／World→TW 兩端對望面板、中間交會。
- 唯一黃擊：「遞交意向」CTA（或下一梯站點）。

## 技術做法

- 三頁**續用共享 `styles.css`**（CIS token／nav／footer／`.btn`／`.risk-panel` 不動，零風險），各頁**新增一支專屬版型 CSS**：`/fellow/founding.css`、`/partner/partner.css`、`/startup/startup.css`，定義該頁獨有骨架類別。
- 新版型類別加命名前綴（`fnd-` / `ptn-` / `stp-`）避免與共享類別衝突。
- 純 CSS Grid／Flex 排版，不新增 JS 相依（startup 賽道、partner 磚牆、fellow 名冊皆以 CSS 完成；fellow 進度條沿用既有 `app.js` 掛鉤）。
- en/ja 版套用相同結構與 class，只替換文案。

## 驗證

- 無自動化測試。以 `npm install` 後 `node server.js` 起站，用無頭 Chrome 逐頁渲染（zh 三頁優先）比對：
  - CIS 三秒檢核：三頁各自只有一次黃、焦點單一、留白足夠、手機版不破。
  - fellow 購買流程與進度條仍運作（`data-buy`／`data-go` 可點）。
  - 三頁骨架彼此明顯不同。
- 依 memory 規定，處理靜態 HTML／無頭 Chrome 一律停用沙盒。

## 非目標（YAGNI）

- 不重構共享 `styles.css`、不抽 design token 系統。
- 不改 `server.js`、路由、購買後端、i18n 機制。
- 不改首頁（`/index.html`）、會員頁、後台。
- 不動 main 上的未提交 WIP。
