import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const code = fs.readFileSync(
  new URL('../public/ig-studio-lib.js', import.meta.url),
  'utf8',
);
const studioCode = fs.readFileSync(
  new URL('../public/ig-studio.js', import.meta.url),
  'utf8',
);
const window = {};
vm.runInNewContext(code, { window, console });
const {
  sanitizeFilename,
  computePreviewScale,
  itemNeedsAlcoholBand,
  alcoholBandHTML,
  buildDownloadName,
  PHOTO_MAX_BYTES,
  isAllowedPhotoType,
} = window.IGStudioLib;

test('sanitizeFilename strips path and control chars', () => {
  assert.equal(sanitizeFilename('a/b\\c:美式*.png'), 'abc美式.png');
  assert.ok(sanitizeFilename('x'.repeat(200)).length <= 80);
});

test('computePreviewScale skips tiny widths', () => {
  assert.equal(computePreviewScale(0, 1080), null);
  assert.equal(computePreviewScale(50, 1080), null);
  assert.equal(computePreviewScale(700, 1080), 460 / 1080);
});

test('alcohol flags', () => {
  assert.equal(itemNeedsAlcoholBand({ alcohol: true }), true);
  assert.equal(itemNeedsAlcoholBand({ cat: 'ALCOHOL' }), true);
  assert.equal(itemNeedsAlcoholBand({ note: '含酒精' }), true);
  assert.equal(itemNeedsAlcoholBand({ cat: 'COFFEE', alcohol: false }), false);
});

test('alcoholBandHTML height >= 10% of canvas', () => {
  const html = alcoholBandHTML(1350);
  assert.match(html, /未滿十八歲禁止飲酒/);
  assert.match(html, /禁止酒駕/);
  assert.match(html, /height:\s*135px/);
});

test('photo limits', () => {
  assert.equal(PHOTO_MAX_BYTES, 5 * 1024 * 1024);
  assert.equal(isAllowedPhotoType('image/png'), true);
  assert.equal(isAllowedPhotoType('image/gif'), false);
});

test('buildDownloadName', () => {
  assert.equal(
    buildDownloadName('美式/咖啡', 'portrait'),
    '言文字_IG_美式咖啡_直式.png',
  );
  assert.equal(buildDownloadName('x', 'square'), '言文字_IG_x_方形.png');
});

test('sizeStage skips hidden preview widths', () => {
  assert.match(studioCode, /const scale = Lib\.computePreviewScale\([\s\S]*?\);\s*if \(scale == null\) return;/);
});

test('readPhoto reports FileReader errors without changing photo state', () => {
  assert.match(studioCode, /r\.onerror = r\.onabort = \(\) => toast\('照片讀取失敗'\);/);
});
