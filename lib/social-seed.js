'use strict';
/* 社群貼文種子：依《言文字_IG品牌重新上市行銷策略方案_2026》產出的 15 週貼文內容。
   資料本體在 social-seed.json；migrate() 以固定 id 補缺，不覆蓋後台既有編輯。 */

const SOCIAL_SEED_PLATFORMS = new Set(['ig', 'x']);
const SOCIAL_SEED_TYPES = new Set(['carousel', 'image', 'text']);
const SOCIAL_SEED_SERIES = new Set([
  'KK 的建造日記', '平常不會遇到的人', '25–35 歲的生活難題', '空間逐步解鎖', '產品與活動',
]);
// 版型白名單：與 public/ig-studio.js 的 LAYOUTS 對應（社群種子只用文字類版型）
const SOCIAL_SEED_LAYOUTS = new Set(['02a', '03a', '03b', '06a', '06b', '06c']);

// 回傳錯誤字串或 null（同 space-upload 的慣例）
function validateSeedPost(p) {
  if (!p || typeof p !== 'object') return 'seed 貼文必須是物件';
  if (!/^sp_seed_[a-z0-9_]+$/.test(p.id || '')) return `id 格式錯誤：${p && p.id}`;
  if (!SOCIAL_SEED_PLATFORMS.has(p.platform)) return `${p.id}: platform 不合法`;
  if (!SOCIAL_SEED_TYPES.has(p.post_type)) return `${p.id}: post_type 不合法`;
  if (!(p.title || '').trim()) return `${p.id}: 缺 title`;
  if (!(p.caption || '').trim()) return `${p.id}: 缺 caption`;
  // 格式必須與 server.js parseTaipei 的嚴格解析一致，否則部署時 seed 會產出 Invalid Date
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(p.scheduled_at || '')) return `${p.id}: scheduled_at 須為 YYYY-MM-DD HH:mm（台北時間）`;
  if (p.series && !SOCIAL_SEED_SERIES.has(p.series)) return `${p.id}: series 不合法`;
  if (!Array.isArray(p.pages)) return `${p.id}: pages 必須是陣列`;
  if (p.platform === 'x' && p.pages.length) return `${p.id}: X 貼文不應有 pages`;
  if (p.platform === 'ig' && !p.pages.length) return `${p.id}: IG 貼文缺 pages`;
  for (const pg of p.pages) {
    if (!pg || !SOCIAL_SEED_LAYOUTS.has(pg.layout)) return `${p.id}: 版型不合法（${pg && pg.layout}）`;
    if (!pg.fields || typeof pg.fields !== 'object') return `${p.id}: 頁面缺 fields`;
  }
  return null;
}

// 把 seed 貼文攤成 DB 匯入形狀（pages 轉為含 layout 的 spec 物件陣列）
function normalizeSeedPost(p) {
  return {
    id: p.id,
    platform: p.platform,
    post_type: p.post_type,
    status: 'draft',                       // 種子一律進草稿，由後台審稿後推進狀態
    title: p.title.trim(),
    caption: p.caption,
    hashtags: (p.hashtags || '').trim(),
    pages: p.pages.map(pg => Object.assign(
      { category: pg.layout.slice(0, 2), variant: pg.layout.slice(2), format: 'portrait' },
      pg.fields
    )),
    images: [],
    scheduled_at: p.scheduled_at,
    external_url: '',
    series: p.series || '',
    phase: p.phase || '',
    cta: p.cta || '',
    audience: p.audience || '',
    notes: p.notes || '',
  };
}

function loadSocialSeedPosts() {
  const raw = require('./social-seed.json');
  if (!Array.isArray(raw)) throw new Error('social-seed.json 必須是陣列');
  const seen = new Set();
  const out = [];
  for (const p of raw) {
    const err = validateSeedPost(p);
    if (err) throw new Error(err);
    if (seen.has(p.id)) throw new Error(`seed id 重複：${p.id}`);
    seen.add(p.id);
    out.push(normalizeSeedPost(p));
  }
  return out;
}

module.exports = { loadSocialSeedPosts, validateSeedPost, normalizeSeedPost, SOCIAL_SEED_LAYOUTS, SOCIAL_SEED_SERIES };
