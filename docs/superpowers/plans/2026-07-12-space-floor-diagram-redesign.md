# 空間頁樓層示意重做 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 `/space` 等角樓層示意改為寬 4.5m × 深 20m × 樓高 3m 的緊貼長屋塔，並以簡化家具依平面圖標示 1F–4F。

**Architecture:** 只改前端 `space-dir.js`／`space-dir.css`。幾何常數改為 1m=10u（W=45, D=200, H=30），樓層 z 緊貼；`furn1–4` 依街口→後端重排；4F 縮短 depth。互動與 `SpaceDir` API 不變。

**Tech Stack:** Vanilla JS IIFE、SVG、既有 CIS CSS、`node:test`（幾何常數回歸）

**Spec:** `docs/superpowers/specs/2026-07-12-space-floor-diagram-redesign-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `public/space-dir.js` | 幾何、緊貼堆疊、家具、viewBox、I18N hints |
| `public/space-dir.css` | 細長塔 viz 高度／mobile 微調 |
| `scripts/test-space-dir-geometry.mjs` | 從原始碼讀取 W/D/H／seam 比例斷言 |

---

### Task 1: 幾何常數回歸測試（先紅）

**Files:**
- Create: `scripts/test-space-dir-geometry.mjs`

- [ ] **Step 1: 寫測試（預期目前會 FAIL）**

```js
// scripts/test-space-dir-geometry.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'public/space-dir.js'), 'utf8');

function constInBuildSvg(name) {
  const m = src.match(new RegExp('function buildSvg\\(\\)[\\s\\S]*?var ' + name + ' = ([\\d.]+)'));
  assert.ok(m, 'missing ' + name + ' in buildSvg');
  return Number(m[1]);
}

test('footprint ratio W:D is 4.5:20', () => {
  const W = constInBuildSvg('W');
  const D = constInBuildSvg('D');
  assert.equal(W / D, 4.5 / 20);
});

test('slab height H is 3m at 10u/m', () => {
  assert.equal(constInBuildSvg('H'), 30);
});

test('stack uses tight seam not exploded gap', () => {
  assert.match(src, /var seam = [2-4]/);
  assert.doesNotMatch(src, /var gap = 52/);
});
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
cd emoji-website && node --test scripts/test-space-dir-geometry.mjs
```

Expected: FAIL（現行 `W=120` 使 `W/D !== 4.5/20`，且仍有 `gap = 52`）

- [ ] **Step 3: Commit 測試**

```bash
git add scripts/test-space-dir-geometry.mjs
git commit -m "$(cat <<'EOF'
test: add space-dir geometry ratio checks

EOF
)"
```

---

### Task 2: `buildSvg` 幾何與緊貼堆疊

**Files:**
- Modify: `public/space-dir.js`（`buildSvg`、`slabGroup` 呼叫處）

- [ ] **Step 1: 改 `buildSvg` 常數與樓層 z**

將 `buildSvg` 換成：

```js
function buildSvg() {
  var W = 45;
  var D = 200;
  var H = 30;
  var seam = 3;
  var step = H + seam;
  var baseZ = 0;
  var ox = 0;
  var oy = 0;
  var d4 = Math.round(D * 0.35);
  var floors = [
    { id: 1, z: baseZ, W: W, D: D, furn: furn1 },
    { id: 2, z: baseZ + step, W: W, D: D, furn: furn2 },
    { id: 3, z: baseZ + step * 2, W: W, D: D, furn: furn3 },
    { id: 4, z: baseZ + step * 3, W: W, D: d4, furn: furn4 },
  ];

  var parts = floors.map(function (f) {
    return slabGroup(ox, oy, f.z, f.W, f.D, H, f.furn(ox, oy, f.z, f.W, f.D, H), f.id);
  });

  // 細長塔：x 約 -173…39，y 約 4F 頂到 1F 底；實作後若裁切再微調
  return (
    '<svg class="space-dir__svg" viewBox="-200 -160 280 420" role="img" aria-hidden="true">' +
      parts.join('') +
    '</svg>'
  );
}
```

注意：刪除舊的 `var gap = 52` 與 `W = 120`／`H = 14`。

- [ ] **Step 2: 跑幾何測試**

```bash
node --test scripts/test-space-dir-geometry.mjs
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add public/space-dir.js scripts/test-space-dir-geometry.mjs
git commit -m "$(cat <<'EOF'
fix: scale space-dir slabs to 4.5×20×3m tight stack

EOF
)"
```

---

### Task 3: 重寫 `furn1`–`furn4`（街口→後端）

**Files:**
- Modify: `public/space-dir.js`（`furn1`–`furn4`）

座標：`ly=0` 街口、`ly=1` 後端。保留 `localIso`／`poly`／`.furn`／`.furn-fill`。

- [ ] **Step 1: 替換四個家具函式**

```js
function furn1(ox, oy, oz, W, D, H) {
  var p = function (lx, ly, lz) { return localIso(ox, oy, oz, W, D, H, lx, ly, lz); };
  var takeout = [p(0.08, 0.02), p(0.42, 0.02), p(0.42, 0.1), p(0.08, 0.1)];
  var kitchen = [p(0.08, 0.12), p(0.92, 0.12), p(0.92, 0.28), p(0.08, 0.28)];
  var bar = [p(0.12, 0.34), p(0.82, 0.34), p(0.82, 0.42), p(0.12, 0.42)];
  var seats = '';
  for (var i = 0; i < 3; i++) {
    var y0 = 0.48 + i * 0.1;
    var desk = [p(0.18, y0), p(0.72, y0), p(0.72, y0 + 0.06), p(0.18, y0 + 0.06)];
    seats += '<polygon class="furn" points="' + poly(desk) + '"/>';
  }
  var stage = [p(0.2, 0.82), p(0.8, 0.82), p(0.8, 0.94), p(0.2, 0.94)];
  var stools = [0.22, 0.38, 0.54, 0.7].map(function (x) {
    var c = p(x, 0.46);
    return '<circle class="furn" cx="' + c.x.toFixed(1) + '" cy="' + c.y.toFixed(1) + '" r="2"/>';
  }).join('');
  return (
    '<polygon class="furn-fill" points="' + poly(takeout) + '"/>' +
    '<polygon class="furn-fill" points="' + poly(kitchen) + '"/>' +
    '<polygon class="furn" points="' + poly(bar) + '"/>' +
    stools + seats +
    '<polygon class="furn" points="' + poly(stage) + '"/>'
  );
}

function furn2(ox, oy, oz, W, D, H) {
  var p = function (lx, ly, lz) { return localIso(ox, oy, oz, W, D, H, lx, ly, lz); };
  var tatami = [p(0.08, 0.04), p(0.92, 0.04), p(0.92, 0.28), p(0.08, 0.28)];
  var sofa = [p(0.1, 0.34), p(0.55, 0.34), p(0.55, 0.72), p(0.1, 0.72)];
  var cells = '';
  for (var i = 0; i < 6; i++) {
    var y0 = 0.34 + i * 0.07;
    var cell = [p(0.62, y0), p(0.92, y0), p(0.92, y0 + 0.055), p(0.62, y0 + 0.055)];
    cells += '<polygon class="furn" points="' + poly(cell) + '"/>';
  }
  var wet = [p(0.55, 0.8), p(0.94, 0.8), p(0.94, 0.96), p(0.55, 0.96)];
  return (
    '<polygon class="furn-fill" points="' + poly(tatami) + '"/>' +
    '<polygon class="furn" points="' + poly(sofa) + '"/>' +
    cells +
    '<polygon class="furn-fill" points="' + poly(wet) + '"/>'
  );
}

function furn3(ox, oy, oz, W, D, H) {
  var p = function (lx, ly, lz) { return localIso(ox, oy, oz, W, D, H, lx, ly, lz); };
  var screen = [p(0.08, 0.04), p(0.92, 0.04), p(0.92, 0.08), p(0.08, 0.08)];
  var desks = '';
  for (var row = 0; row < 4; row++) {
    for (var col = 0; col < 2; col++) {
      var x0 = 0.12 + col * 0.4;
      var y0 = 0.14 + row * 0.14;
      var desk = [p(x0, y0), p(x0 + 0.3, y0), p(x0 + 0.3, y0 + 0.08), p(x0, y0 + 0.08)];
      desks += '<polygon class="furn" points="' + poly(desk) + '"/>';
    }
  }
  var snack = [p(0.12, 0.74), p(0.55, 0.74), p(0.55, 0.88), p(0.12, 0.88)];
  var toilet = [p(0.62, 0.78), p(0.94, 0.78), p(0.94, 0.96), p(0.62, 0.96)];
  return (
    '<polygon class="furn-fill" points="' + poly(screen) + '"/>' +
    desks +
    '<polygon class="furn-fill" points="' + poly(snack) + '"/>' +
    '<polygon class="furn" points="' + poly(toilet) + '"/>'
  );
}

function furn4(ox, oy, oz, W, D, H) {
  var p = function (lx, ly, lz) { return localIso(ox, oy, oz, W, D, H, lx, ly, lz); };
  var indoor = [p(0.08, 0.08), p(0.7, 0.08), p(0.7, 0.92), p(0.08, 0.92)];
  var balcony = [p(0.72, 0.08), p(0.96, 0.08), p(0.96, 0.92), p(0.72, 0.92)];
  var t1 = p(0.84, 0.35);
  var t2 = p(0.84, 0.65);
  return (
    '<polygon class="furn-fill" points="' + poly(indoor) + '"/>' +
    '<polygon class="furn" points="' + poly(balcony) + '"/>' +
    '<circle class="furn" cx="' + t1.x.toFixed(1) + '" cy="' + t1.y.toFixed(1) + '" r="4"/>' +
    '<circle class="furn" cx="' + t2.x.toFixed(1) + '" cy="' + t2.y.toFixed(1) + '" r="4"/>'
  );
}
```

- [ ] **Step 2: 瀏覽器目視（本機）**

```bash
# 若 server 未開：PORT=8080 node server.js
# 開 http://localhost:8080/space#directory
```

Checklist：
- [ ] 塔明顯細長（非寬扁）
- [ ] 樓層緊貼
- [ ] 1F 前外帶／廚／吧，後駐唱
- [ ] 2F 前榻榻米，後淋浴區
- [ ] 3F 前投影，後自助吧＋廁所
- [ ] 4F 明顯較短
- [ ] 點選仍展開手風琴

若 SVG 裁切：只改 `viewBox` 四數字，不动家具。

- [ ] **Step 3: Commit**

```bash
git add public/space-dir.js
git commit -m "$(cat <<'EOF'
feat: redraw space-dir furniture to match floor plan

EOF
)"
```

---

### Task 4: I18N hints 對齊新分區

**Files:**
- Modify: `public/space-dir.js`（`I18N.*.hints`）

- [ ] **Step 1: 更新三語 hints**

```js
// zh.hints
1: '外帶、廚房、吧台、客席、駐唱',
2: '榻榻米娛樂室、lattice／沙發、淋浴廁所',
3: '投影、移動桌椅、自助吧、廁所',
4: '洗衣烘衣與陽台水塔',

// en.hints
1: 'Takeout, kitchen, bar, seats, stage',
2: 'Tatami lounge, lattice/sofa, shower',
3: 'Screen, desks, snack bar, toilet',
4: 'Laundry and terrace tanks',

// ja.hints
1: 'テイクアウト・厨房・バー・客席・ステージ',
2: '畳ラウンジ・lattice／ソファ・シャワー',
3: '投影・可動デスク・セルフバー・トイレ',
4: '洗濯乾燥とテラス水塔',
```

- [ ] **Step 2: Commit**

```bash
git add public/space-dir.js
git commit -m "$(cat <<'EOF'
copy: align space-dir floor hints with plan zones

EOF
)"
```

---

### Task 5: CSS 微調細長塔

**Files:**
- Modify: `public/space-dir.css`（`.space-dir__viz`、`.space-dir__svg`、mobile）

- [ ] **Step 1: 調整 viz 高度以容納高塔**

在既有規則上調整（數值以目視為準，起點如下）：

```css
.space-dir__viz {
  /* 既有屬性保留；提高最小高度讓細長塔不被壓扁 */
  min-height: 420px;
}

.space-dir__svg {
  width: 100%;
  max-height: 520px;
  height: auto;
}

@media (max-width: 720px) {
  .space-dir__viz {
    min-height: 320px;
  }
  .space-dir__svg {
    max-height: 380px;
  }
}
```

若檔內已有衝突的 `height`／`max-height`，覆寫為上列意圖，勿重複選擇器失控。

- [ ] **Step 2: Desktop + mobile 再看一次 `/space`**

確認列表與塔並排／直向堆疊皆不裁切、active 上浮 `-8px` 仍可見。

- [ ] **Step 3: Commit**

```bash
git add public/space-dir.css
git commit -m "$(cat <<'EOF'
style: give space-dir viz room for tall narrow tower

EOF
)"
```

---

### Task 6: 最終驗證

- [ ] **Step 1: 幾何測試**

```bash
node --test scripts/test-space-dir-geometry.mjs
```

Expected: PASS

- [ ] **Step 2: 手動驗收（對 spec success criteria）**

| # | Criteria | Pass? |
|---|----------|-------|
| 1 | W:D 視覺 ≈ 0.225 細長 | |
| 2 | 樓層緊貼、側面有樓高感 | |
| 3 | 家具順序對齊 spec 表 | |
| 4 | 點選／hash／菜單不變 | |
| 5 | zh／en／ja 同 JS | |

- [ ] **Step 3: 若有 viewBox／CSS 最後微調，再 commit 一次**

```bash
git add public/space-dir.js public/space-dir.css
git commit -m "$(cat <<'EOF'
fix: polish space-dir viewBox and viz sizing

EOF
)"
```

（無變更則跳過。）

---

## Spec coverage checklist

| Spec 項 | Task |
|---------|------|
| W=45 D=200 H=30、1m=10u | 1–2 |
| 緊貼 seam、非爆炸 gap | 1–2 |
| 4F 縮短 depth | 2–3 |
| furn 街口→後端 1–4F | 3 |
| 互動沿用 | 3 驗收（不改 API） |
| hints 對齊 | 4 |
| CSS 微調 | 5 |
| Success criteria | 6 |
| 不做尺寸文字／切開透視／後端 | （刻意無 task） |
