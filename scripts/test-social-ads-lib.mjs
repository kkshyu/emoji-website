// scripts/test-social-ads-lib.mjs — 廣告建議引擎（public/social-ads-lib.js）單元測試
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const libCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'social-ads-lib.js'), 'utf8');
const sandbox = { window: {}, console };
vm.runInNewContext(libCode, sandbox);
const Ads = sandbox.window.SocialAdsLib;

test('掛載於 window.SocialAdsLib 並含核心 API', () => {
  assert.ok(Ads);
  for (const k of ['periodOf', 'recommendAd', 'amplifyAdvice', 'budgetPlan', 'LAYERS', 'RELEASE']) {
    assert.ok(Ads[k], `缺 ${k}`);
  }
});

test('四期釋放節奏合計 $50,000、三層結構合計 $50,000', () => {
  assert.equal(Ads.RELEASE.reduce((s, p) => s + p.budget, 0), 50000);
  assert.equal(Ads.LAYERS.reduce((s, l) => s + l.budget, 0), 50000);
});

test('periodOf 邊界：期首期尾含入、期外回 null', () => {
  assert.equal(Ads.periodOf('2026-10-01').phase, '雙十連假');
  assert.equal(Ads.periodOf('2026-10-12').phase, '雙十連假');
  assert.equal(Ads.periodOf('2026-10-13').phase, '試營運（低調）');
  assert.equal(Ads.periodOf('2026-12-31').phase, '聖誕＋跨年');
  assert.equal(Ads.periodOf('2026-09-30'), null);
  assert.equal(Ads.periodOf('2027-01-01'), null);
  assert.equal(Ads.periodOf(''), null);
  assert.equal(Ads.periodOf('not-a-date'), null);
});

test('X 貼文不適投', () => {
  const r = Ads.recommendAd({ platform: 'x', series: 'KK 的建造日記', scheduled_at: '2026-07-15 21:00' });
  assert.equal(r.eligible, false);
  assert.equal(r.suitability, '不適投');
});

test('受眾痛點輪播＝高適投、陌生觸及層', () => {
  const r = Ads.recommendAd({ platform: 'ig', post_type: 'carousel', series: '25–35 歲的生活難題', scheduled_at: '2026-09-11 19:00' });
  assert.equal(r.eligible, true);
  assert.equal(r.suitability, '高');
  assert.equal(r.layerKey, 'awareness');
  assert.ok(r.score >= 85);
  assert.ok(r.checklist.some(c => c.includes('48')));
});

test('開幕後（10/27 起）行動型內容加權', () => {
  const base = Ads.recommendAd({ platform: 'ig', post_type: 'image', series: '產品與活動', scheduled_at: '2026-10-14 10:00' });
  const boosted = Ads.recommendAd({ platform: 'ig', post_type: 'image', series: '產品與活動', scheduled_at: '2026-11-20 10:00' });
  assert.ok(boosted.score > base.score);
  assert.equal(boosted.layerKey, 'action');
});

test('budgetHint 依同期貼數分攤、依適投度加減', () => {
  const peers = [
    { platform: 'ig', scheduled_at: '2026-10-14 19:00' },
    { platform: 'ig', scheduled_at: '2026-10-17 19:00' },
    { platform: 'ig', scheduled_at: '2026-10-24 19:00' },
  ];
  const r = Ads.recommendAd({ platform: 'ig', post_type: 'carousel', series: '25–35 歲的生活難題', scheduled_at: '2026-10-17 19:00' }, peers);
  // 試營運期預算 3000 / 3 篇 = 1000；高適投 ×1.5 = 1500
  assert.equal(r.budgetHint, 1500);
});

test('amplifyAdvice：缺數據／值得放大／不放大', () => {
  const noData = Ads.amplifyAdvice({ metrics: {} }, []);
  assert.equal(noData.flag, '缺數據');

  const published = [
    { id: 'a', platform: 'ig', status: 'published', metrics: { reach: 1000, shares: 10, saves: 20 } },
    { id: 'b', platform: 'ig', status: 'published', metrics: { reach: 1000, shares: 20, saves: 30 } },
    { id: 'c', platform: 'ig', status: 'published', metrics: { reach: 1000, shares: 30, saves: 40 } },
  ];
  const hot = Ads.amplifyAdvice({ id: 'x', metrics: { reach: 1000, shares: 50, saves: 60, nonFollowerPct: 70 } }, published);
  assert.equal(hot.flag, '值得放大');
  const cold = Ads.amplifyAdvice({ id: 'y', metrics: { reach: 1000, shares: 1, saves: 1 } }, published);
  assert.equal(cold.flag, '不放大');
});

test('budgetPlan 標出目前期別', () => {
  const plan = Ads.budgetPlan('2026-10-20');
  assert.equal(plan.adTotal, 50000);
  assert.equal(plan.total, 100000);
  const current = plan.release.filter(p => p.current);
  assert.equal(current.length, 1);
  assert.equal(current[0].phase, '試營運（低調）');
});

test('median 空陣列回 null、偶數取平均', () => {
  assert.equal(Ads.median([]), null);
  assert.equal(Ads.median([1, 3]), 2);
  assert.equal(Ads.median([1, 2, 3]), 2);
});
