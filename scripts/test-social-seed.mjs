// scripts/test-social-seed.mjs — 社群貼文種子（lib/social-seed.json）內容品質閘門
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadSocialSeedPosts, validateSeedPost } = require('../lib/social-seed.js');
const seed = require('../lib/social-seed.json');

test('seed 全數通過結構驗證且可正規化', () => {
  for (const p of seed) assert.equal(validateSeedPost(p), null, p.id);
  const posts = loadSocialSeedPosts();
  assert.equal(posts.length, seed.length);
  for (const p of posts) assert.equal(p.status, 'draft');
});

test('涵蓋完整戰役：IG 19 則（16 輪播＋3 單圖）、X 18 則', () => {
  const ig = seed.filter(p => p.platform === 'ig');
  const x = seed.filter(p => p.platform === 'x');
  assert.equal(ig.length, 19);
  assert.equal(x.length, 18);
  assert.equal(ig.filter(p => p.post_type === 'carousel').length, 16);
  assert.equal(ig.filter(p => p.post_type === 'image').length, 3);
  assert.ok(x.every(p => p.post_type === 'text'));
});

const textOf = (p) => [
  p.title, p.caption, p.hashtags, p.cta, p.audience, p.notes,
  ...(p.pages || []).flatMap(pg => Object.values(pg.fields).map(String)),
].join('\n');

test('禁簡體字', () => {
  const simplified = /[设为这来时后过还发对问让说动业东车头实应见话语间们个买卖点线约铁号张风书学习员马义乐]/;
  for (const p of seed) {
    const m = textOf(p).match(simplified);
    assert.equal(m, null, `${p.id} 含簡體字「${m && m[0]}」`);
  }
});

test('禁空泛詞與推銷腔', () => {
  const banned = ['賦能', '鏈結', '共創生態系', '生態系共創', '極致體驗', '手刀', '衝一波', '快來搶', '限時搶購'];
  for (const p of seed) {
    const t = textOf(p);
    for (const w of banned) assert.ok(!t.includes(w), `${p.id} 含禁詞「${w}」`);
  }
});

test('品牌資料統一：不寫舊帳號、不寫總樓層數、日期一致', () => {
  for (const p of seed) {
    const t = textOf(p);
    assert.ok(!t.includes('@emoji0701'), `${p.id} 用到舊帳號`);
    assert.ok(!/[三四4３]層樓/.test(t), `${p.id} 寫了總樓層數`);
    assert.ok(!t.includes('10/14 試營運') && !t.includes('11/2 正式開幕'), `${p.id} 日期錯誤`);
    // 殘留 HTML 實體（workflow 傳輸污染）不可進 DB
    assert.ok(!/&(amp|lt|gt|quot|#39);/.test(t), `${p.id} 殘留 HTML 實體`);
  }
});

test('IG 版型字數預算（防匯出溢版）', () => {
  const LIMITS = {
    '03a': { q_text: 24, q_sub: 48, q_by: 16 },
    '03b': { q_text: 28, q_sub: 24, q_by: 16 },
    '06a': { openingLine: 14, openingDesc: 44 },
    '06c': { comingTitle: 10, comingSub: 30 },
    '02a': { e_title: 14, e_desc: 48 },
  };
  for (const p of seed) {
    for (const pg of p.pages || []) {
      const lim = LIMITS[pg.layout];
      if (!lim) continue;
      for (const [k, max] of Object.entries(lim)) {
        const v = String(pg.fields[k] || '');
        assert.ok(v.length <= max, `${p.id} ${pg.layout}.${k} 過長（${v.length} > ${max}）：${v}`);
      }
      if (pg.layout === '06b') {
        for (const line of String(pg.fields.manifesto || '').split('\n')) {
          assert.ok(line.length <= 14, `${p.id} manifesto 行過長：${line}`);
        }
      }
    }
  }
});

test('X 貼文長度符合平台限制（CJK 計 2、上限 280）', () => {
  const weighted = (s) => [...String(s)].reduce((n, ch) => n + (ch.codePointAt(0) > 0x2E80 ? 2 : 1), 0);
  for (const p of seed.filter(p => p.platform === 'x')) {
    const total = weighted(p.caption) + (p.hashtags ? weighted(p.hashtags) + 1 : 0);
    assert.ok(total <= 280, `${p.id} 全文 ${total} 超過 280`);
  }
});

test('排程都落在戰役期間內（2026-07-15 ～ 2026-11-01）', () => {
  for (const p of seed) {
    const d = p.scheduled_at.slice(0, 10);
    assert.ok(d >= '2026-07-15' && d <= '2026-11-01', `${p.id} 排程 ${d} 超出期間`);
  }
});

test('IG caption 皆含唯一 CTA 欄位與 hashtags 下限', () => {
  for (const p of seed.filter(p => p.platform === 'ig')) {
    assert.ok(p.cta && p.cta.length >= 3, `${p.id} 缺 CTA`);   // 「來坐坐」是合法的品牌 CTA
    const tags = (p.hashtags.match(/#/g) || []).length;
    assert.ok(tags >= 6 && tags <= 10, `${p.id} hashtags ${tags} 個（應 6–10）`);
    assert.ok(p.hashtags.includes('#言文字') && p.hashtags.includes('#台灣人才聚落'), `${p.id} 缺固定 hashtag`);
  }
});
