# IG 貼文產生器（後台）設計 — v2

日期：2026-07-12  
狀態：已核准（方法 A：模板引擎化）  
取代：同檔 v1（僅 3 型 × 2 比例）

## 目標

讓管理員在後台 `admin.html` 的「IG 貼文」分頁，依 **6 類 × 3 版型（共 18）** 填入資訊／照片，即時預覽並下載可直接發布的 Instagram PNG（直式 1080×1350 或方形 1080×1080）。

根目錄靜態模板 `言文字_IG貼文模板.html` 不再是現行來源：實作完成後封存並自工作區根目錄移除，**唯一 SoT 為後台產生器**。

## 非目標

- 不新增後端 API、不動 `server.js`、不動資料庫。
- 不自動發佈至 Instagram（僅本機下載 PNG）。
- 不在此決策正式菜價／EMO 資格（菜單 owner 另案核定）；本工具以「內部預覽」標示未核定價格。
- 不保證跨機 CJK 字型 100% 內嵌保真（沿用 `skipFonts: true`；升級路徑見下方）。

## 方法

**A — 模板引擎化（已選）**

- 18 版型收進 `public/ig-studio.js` 的 layout registry（`1a`–`6c`）。
- 共用 footer、酒類警語帶、尺寸、匯出管線、表單綁定。
- 根目錄 HTML 移至 `_archive/_整理_2026-07-12/superseded-brand-previews/` 後自根目錄刪除。

否決：B（iframe 嵌入靜態頁）、C（獨立 SPA）。

## 版型矩陣

| 類別 | 代碼 | 版型 | 說明 |
|---|---|---|---|
| 新品／飲品 | 01 | 1a / 1b / 1c | 全幅照底部資訊；文字主＋方照；深色框線照 |
| 活動預告 | 02 | 2a / 2b / 2c | 沿用既有活動欄位與三種構圖 |
| 金句／字 | 03 | 3a / 3b / 3c | 留白大字；深色引號；照片疊字 |
| 營業資訊 | 04 | 4a / 4b / 4c | 週時間表；日／夜雙模式；地點交通 |
| 菜單 | 05 | 5a / 5b / 5c | 點線價目；咖啡／酒分類；招牌單品 |
| 品牌／開幕 | 06 | 6a / 6b / 6c | 開幕大日期；品牌標語；Coming soon |

視覺語言沿用 CIS：墨／紙／唯一黃 `#FFDE34`、明體標題、螢光筆底線、明／暗底。構圖對齊封存前根目錄模板 HTML，但欄位改為表單驅動（不再 contentEditable 靜態頁）。

每版型皆支援：

- `portrait` 1080×1350
- `square` 1080×1080（垂直節奏依版型微調字級／照片高度，不得裁切關鍵文字）

## 狀態模型

```
state = {
  category: '01'..'06',
  variant: 'a'|'b'|'c',
  format: 'portrait'|'square',
  dark: boolean,          // 部分版型鎖定 dark（如 1c/3b/4c/5c/6c）時 UI 反映鎖定
  showEn: boolean,
  showMember: boolean,    // 僅單品／價目相關版型
  hl: boolean,
  photo: dataURL|'',
  handle: string,         // 預設 '@emoji0701'
  place: string,          // 預設 '重慶南路'
  // 01 product fields, 02 event, 03 quote,
  // 04 hours/location rows, 05 menu rows, 06 brand/opening fields
}
```

切換 `category`／`variant` 時：保留共用欄位與照片；切換專屬欄位表單；若版型強制 dark，同步 `state.dark`。

## 菜單資料

檔案：`public/menu-data.js`

- 修正 `COCA LATTE` → `COCOA LATTE`。
- 各品項加 `alcohol: true|false`（`ALCOHOL` 分類與「含酒精」咖啡為 true）。
- 補 `SNACK`：若無法從已封存 legacy PDF（全影像）可靠還原品項，則以空陣列＋註解標明「待菜單 owner 補齊」，不得虛構價格。
- UI 明示：**價格未核定，僅供內部預覽**。
- 單品（01）與菜單（05）可下拉帶入；仍可手改。

## 酒類合規

凡 `alcohol === true` 的品項被選入，或版型內容明顯為酒類（05b 夜間酒區、1c／5c 等）：

1. 預覽與匯出底部保留 **連續獨立警語區，高度 ≥ 畫布 10%**。
2. 文案至少含：「未滿十八歲禁止飲酒」與「禁止酒駕」。
3. 若警語區無法配置（極端矮版型），**阻擋下載**並 toast 說明。

非酒類版型不強制警語。

## UI

- 左填右看（既有 grid；窄螢幕直向堆疊）。
- 左欄順序：類別 → 版型 a/b/c → 直式／方形 → 開關 → 動態欄位 → 照片 → handle／place。
- 右欄：即時預覽＋「下載 PNG」；caption 顯示實際像素。
- 預覽以真實 1080 節點 + `transform: scale()` 縮小；**僅在可見時計算 scale**。

## 工程修復（P1-19）

| 項目 | 作法 |
|---|---|
| 負縮放 | `bindNav` 切到 `ig` 時呼叫 `IGStudio.resize()`；`sizeStage` 若 `clientWidth < 80` 則跳過；可選 `ResizeObserver` |
| 示範日期 | 清空或正確 weekday；placeholder 不含錯誤「(六)」 |
| 預設帳號／地點 | `@emoji0701`、`重慶南路`（可編輯） |
| 上傳 | 僅 `image/jpeg`、`image/png`、`image/webp`；≤ 5MB；失敗 toast |
| 檔名 | sanitize：去掉路徑字元與控制字元，截斷長度 |
| 匯出 busy | 下載中 disabled＋文案「匯出中…」；防連點 |
| vendor | `html-to-image.js` 檔頭註版本／來源；旁掛 `html-to-image.LICENSE`（MIT） |
| 腳本載入 | `html-to-image`／`menu-data`／`ig-studio` 改為管理員登入成功後動態 `import`／插 script，未登入不載入 |
| 測試頁 | 確認 `public/_igtest.html` 不存在（已封存） |

字型：匯出前 `await document.fonts.ready`；維持 `skipFonts: true`。註解保留升級路徑（自架 woff2 subset + `fontEmbedCSS`）。

## 根目錄模板處置

1. 複製／移動 `言文字_IG貼文模板.html` → `_archive/_整理_2026-07-12/superseded-brand-previews/言文字_IG貼文模板.html`。
2. 於 `MOVED_FILES.md` 追加一筆（日期、理由：SoT 改為後台 18 版引擎）。
3. 確認專案根目錄不再有該檔；網站 repo 內無引用該路徑。

## 檔案異動

| 動作 | 路徑 |
|---|---|
| 重寫 | `emoji-website/public/ig-studio.js` |
| 更新 | `emoji-website/public/menu-data.js` |
| 更新 | `emoji-website/public/admin.html` |
| 新增 | `emoji-website/public/vendor/html-to-image.LICENSE` |
| 註記 | `emoji-website/public/vendor/html-to-image.js` 檔頭 provenance |
| 更新 | 本 spec |
| 封存 | 根目錄 `言文字_IG貼文模板.html` → archive `superseded-brand-previews/` |

## 錯誤處理

- 匯出函式庫未載入 → toast，不拋未捕捉例外。
- 匯出失敗 → toast 訊息；還原按鈕狀態；移除離屏節點。
- 照片讀取失敗／超限 → toast；保留舊照片。

## 測試／驗收

1. 管理員登入可見「IG 貼文」；未登入 Network 無 `ig-studio.js`／`menu-data.js`。
2. 18 版型 × 2 比例皆可預覽；切換無負縮放（從其他分頁切入亦然）。
3. 選含酒精品項 → 預覽有 ≥10% 警語；下載 PNG 含警語。
4. 非酒類下載無強制警語。
5. 上傳 6MB 檔／`image/gif` → 拒絕並提示。
6. 下載中按鈕不可再點；完成後恢復；檔名無 `/`、`\\`、控制字元。
7. `vendor/` 有 LICENSE；JS 檔頭有版本與來源 URL。
8. 根目錄無 `言文字_IG貼文模板.html`；archive 有副本。
9. 菜單下拉可見修正後的 COCOA；價格區有「未核定」提示。

## 風險與後續

- 正式 IG handle／據點文案若品牌改口，只改預設值即可。
- 菜單核定後：去掉「未核定」提示或改讀核准資料來源（另案）。
- CJK 字型跨機保真：另案 subset woff2。
`}