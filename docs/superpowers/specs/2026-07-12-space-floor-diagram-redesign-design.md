# 空間頁樓層示意重做 — Design Spec

**Date:** 2026-07-12  
**Source:** `260711_言文字共享空間_平面圖_規劃_照片.pdf`  
**Status:** Draft for user review

## Goal

重做網站空間頁（`/space`）的等角樓層示意圖，使 footprint 與樓高符合實際長屋比例（寬 4.5m × 深 20m × 樓高 3m），並依平面圖用簡化家具標示各層機能；互動（點選／手風琴／hash）維持現狀。

## Decisions (locked)

| 項目 | 選擇 |
|------|------|
| 範圍 | 全面重做示意（非只改數字） |
| 堆疊 | 緊貼等角塔（實體建築感，非爆炸拉開、非剖面） |
| 細節 | 簡化家具（非純色塊、非尺寸文字標註） |
| 實作路徑 | 改 `space-dir.js` 為主，沿用等角＋手風琴 |
| 進深方向 | 街口 → 後端（對齊 1F 外帶口與 PDF） |

## Geometry

- 單位：**1m = 10 SVG units**
- **W = 45**（4.5m）、**D = 200**（20m）、**H = 30**（3m）
- 樓層 z：`baseZ + n * (H + seam)`，`seam` 僅 2–4u（緊貼，不再用大幅 gap 爆炸）
- **1F–3F**：完整 footprint
- **4F**：室內約 5 坪 → 深度縮為約 0.3–0.4×D；可加陽台淺色／虛邊區塊與水塔圓點
- 等角投影沿用現有 `iso(x, y, z)`（cos≈0.866, sin≈0.5）
- 重算 `viewBox` 以包住細長塔（現況依寬矮比例設定，會裁切或留白不當）

## Furniture layout（街口 → 後端）

座標以樓板局部 `(lx, ly) ∈ [0,1]²`，`ly=0` 為街口、`ly=1` 為後端。

### 1F Café & Bar

1. 外帶口／入口小矩形（前）
2. 廚房區塊
3. 長吧台 + 圓凳
4. 客席短桌
5. 駐唱台／後場（近梯側留白）

### 2F Member Plaza

1. 榻榻米娛樂室（大墊）
2. lattice 格 + 沙發長條（合併示意）
3. 淋浴／廁所小格（後端）

### 3F Talent Lounge

1. 投影幕細條（前緣）
2. 移動桌椅網格
3. 自助吧
4. 廁所小格（最後）

### 4F 支援

1. 縮短樓板：洗衣／烘衣矩形
2. 陽台虛邊 + 水塔圓點

畫風：少數 `polygon`／`circle`，沿用 `.furn`／`.furn-fill`；不在 SVG 內寫樓層或尺寸文字。

## Interaction

- 點 SVG 樓層或右側列表 → `is-active`／`is-dim`、手風琴嵌在對應 `<li>`
- 1F 含菜單；hash `#menu`／`#f2`… 行為不變
- Active 頂面黃一擊（CIS）；家具線不隨 active 變色

## Files in scope

| 檔案 | 變更 |
|------|------|
| `public/space-dir.js` | W/D/H、z 緊貼、furn1–4 重排、viewBox、I18N hints |
| `public/space-dir.css` | 細長塔／mobile 寬度微調 |

## Out of scope

- 空間頁版型、手風琴架構、後端／上傳
- SVG 內 4.5／20／3 尺寸文字
- 切開透視、俯視疊層、爆炸等角
- 將 PDF 嵌進網站

## Success criteria

1. 視覺上明顯為「窄長」長屋（W:D ≈ 0.225），不再接近正方形樓板
2. 樓層緊貼，側面可感受樓高比例（相對進深）
3. 1F–4F 家具區塊順序與上表一致，可對照 PDF 辨識
4. 點選展開／收合／深連結與現況相同
5. zh／en／ja 空間頁示意一致（同一 JS）

## Reference

- 規劃平面：repo 根目錄 `260711_言文字共享空間_平面圖_規劃_照片.pdf`
- 現況實作：`public/space-dir.js`（現行 W=120, D=200, H=14, gap=52）
