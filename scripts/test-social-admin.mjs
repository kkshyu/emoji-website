// scripts/test-social-admin.mjs — 社群經營後台接線的結構性測試（原始碼斷言，無瀏覽器）
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const server = read('server.js');
const admin = read('public/admin.html');
const ig = read('public/ig-studio.js');

test('server：social_posts 建表與索引在 SCHEMA_SQL', () => {
  assert.match(server, /CREATE TABLE IF NOT EXISTS social_posts/);
  assert.match(server, /CREATE INDEX IF NOT EXISTS social_posts_sched_idx/);
});

test('server：social API 皆掛 auth + adminOnly（requireDb 除上傳外）', () => {
  assert.match(server, /app\.get\('\/api\/admin\/social\/posts', auth, adminOnly, requireDb, wrap/);
  assert.match(server, /app\.post\('\/api\/admin\/social\/posts', auth, adminOnly, requireDb, wrap/);
  assert.match(server, /app\.delete\('\/api\/admin\/social\/posts\/:id', auth, adminOnly, requireDb, wrap/);
  assert.match(server, /app\.post\('\/api\/admin\/upload\/social', auth, adminOnly,/);
});

test('server：seed 掛進 migrate 且冪等（ON CONFLICT）', () => {
  assert.match(server, /await seedSocialPosts\(\)/);
  assert.match(server, /social_posts[\s\S]{0,600}ON CONFLICT \(id\) DO NOTHING/);
});

test('server：上傳沿用 multer 雙重驗證與安全檔名', () => {
  assert.match(server, /buildSafeSocialFilename\(file\.originalname, file\.mimetype\)/);
  assert.match(server, /assertSocialImageFile\(\{ mimetype: req\.file\.mimetype, size: req\.file\.size \}\)/);
});

test('admin：社群分頁註冊於 TABS 且按需載入', () => {
  assert.match(admin, /\{ id:'social',\s*label:'社群經營', render:tabSocial \}/);
  assert.match(admin, /TAB === 'social' && SOCIAL_POSTS === null\) loadSocialPosts/);
});

test('admin：多平台上傳走裸 fetch（不經 api() 的 JSON 封裝）', () => {
  assert.match(admin, /fetch\('\/api\/admin\/upload\/social'/);
});

test('admin：插值經 esc()（抽查關鍵模板）', () => {
  assert.match(admin, /esc\(p\.title\)/);
  assert.match(admin, /esc\(p\.external_url\)/);
  assert.match(admin, /esc\(socialFmtSched\(p\.scheduled_at\)\)/);
});

test('admin：編輯離開有未儲存確認、儲存走 POST upsert', () => {
  assert.match(admin, /有未儲存的編輯，確定離開？/);
  assert.match(admin, /api\('\/admin\/social\/posts', \{ method:'POST', body \}\)/);
});

test('ig-studio：公開 renderSpec / listLayouts / exportSpecPng', () => {
  assert.match(ig, /window\.IGStudio = \{ mount, resize: sizeStage, renderSpec, listLayouts, exportSpecPng \}/);
  assert.match(ig, /function renderSpec\(spec\)/);
  // spec 渲染不得沿用示範內容：內容性欄位先清空
  assert.match(ig, /for \(const k of SPEC_TEXT_FIELDS\) state\[k\] = ''/);
  // 匯出守門：溢出與酒精帶檢查都在
  assert.match(ig, /exportSpecPng[\s\S]{0,900}igp-alcohol/);
  assert.match(ig, /exportSpecPng[\s\S]{0,1400}contentOverflows/);
});

test('社群 seed 版型皆在 admin 編輯器白名單內', () => {
  const seed = JSON.parse(read('lib/social-seed.json'));
  const m = admin.match(/const SOCIAL_LAYOUTS = \{([\s\S]*?)\n\};/);
  assert.ok(m, '找不到 SOCIAL_LAYOUTS');
  const layouts = [...m[1].matchAll(/'(\d\d[abc])':/g)].map(x => x[1]);
  for (const p of seed) {
    for (const pg of p.pages || []) {
      assert.ok(layouts.includes(pg.layout), `${p.id} 用到編輯器不支援的版型 ${pg.layout}`);
    }
  }
});

test('ensureIgScripts 載入 social-ads-lib', () => {
  assert.match(admin, /load\('\/social-ads-lib\.js'\)/);
});

/* ---- 審查修復的回歸防護 ---- */

test('修復：種子刪除走墓碑，seed 讀墓碑跳過', () => {
  assert.match(server, /social_seed_deleted/);
  assert.match(server, /dead\.includes\(p\.id\)\) continue/);
});

test('修復：external_url 僅接受 http(s)（server 驗證＋前端連結守衛）', () => {
  assert.match(server, /連結僅接受 http\(s\) 網址/);
  assert.match(admin, /\/\^https\?:\\\/\\\/\/i\.test\(p\.external_url\)/);
});

test('修復：seed 排程格式嚴格（與 parseTaipei 一致）且單筆失敗不擋 migrate', () => {
  const { validateSeedPost } = require('../lib/social-seed.js');
  const base = { id: 'sp_seed_test', platform: 'x', post_type: 'text', title: 't', caption: 'c', pages: [] };
  assert.equal(validateSeedPost({ ...base, scheduled_at: '2026-07-15 19:00' }), null);
  assert.match(validateSeedPost({ ...base, scheduled_at: '2026-07-15' }) || '', /YYYY-MM-DD HH:mm/);
  assert.match(validateSeedPost({ ...base, scheduled_at: '2026-07-15T21:00:00Z' }) || '', /YYYY-MM-DD HH:mm/);
  assert.match(server, /\[social-seed\] 匯入失敗，略過/);
});

test('修復：renderSpec 的 photo 走來源白名單（擋 style 屬性注入）', () => {
  assert.match(ig, /data:image\\\/\|\\\/uploads\\\//);
});

test('修復：X 貼文儲存時清空 pages、類型依平台白名單', () => {
  assert.match(server, /platform === 'x' \? \[\] :/);
  assert.match(server, /TYPE_BY_PLATFORM/);
});

test('修復：編輯輸入即回寫 SOCIAL_EDIT、儲存期間鎖表單、上傳比對編輯目標', () => {
  assert.match(admin, /const markDirty = \(\)=>\{ socialCollectEdit\(\); SOCIAL_DIRTY=true; \}/);
  assert.match(admin, /locked\.forEach\(el=>el\.disabled=true\)/);
  assert.match(admin, /SOCIAL_EDIT !== ed/);
});

test('修復：上傳做 magic-byte 檢查、/uploads 回應 nosniff', () => {
  assert.match(server, /sniffImageType\(head\)/);
  assert.match(server, /X-Content-Type-Options', 'nosniff'/);
});
