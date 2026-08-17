'use strict';
/* IG 自動發佈：social_posts（platform='ig'）到期 → 版型 render JPEG → Instagram Graph API 發佈。
   API 為新版 Instagram API with Instagram Login（graph.instagram.com），免綁 FB 粉專。
   設計見 docs/superpowers/specs/2026-08-17-ig-autopublish-design.md。
   依賴注入 { q, port, siteBase, uploadDir }，不直接 require pg，便於測試。 */

const path = require('path');

const IG_GRAPH = 'https://graph.instagram.com/v23.0';
const TOKEN_KEY = 'ig_access_token';           // site_content 持久化 key（refresh 後寫回）
const CONTAINER_POLL_MS = 2000;
const CONTAINER_POLL_MAX = 15;                  // 容器處理最多等 30s

// 法遵禁用字（對外口徑定版 2026-07-25）；env IG_BANNED_WORDS 逗號分隔可擴充
const BANNED_BASE = ['住宿', '入住', '過夜', '旅館', 'hotel', '共居', '床位'];

function bannedList() {
  const extra = String(process.env.IG_BANNED_WORDS || '').split(',').map(s => s.trim()).filter(Boolean);
  return BANNED_BASE.concat(extra);
}

// 回傳命中的禁用字陣列（caption＋hashtags＋所有 page 文字欄位）
function checkBanned(post) {
  const texts = [post.caption || '', post.hashtags || ''];
  for (const pg of (post.pages || [])) {
    const flat = normalizePage(pg);
    for (const v of Object.values(flat)) if (typeof v === 'string') texts.push(v);
  }
  const hay = texts.join('\n').toLowerCase();
  return bannedList().filter(w => hay.includes(w.toLowerCase()));
}

// 兼容兩種 page 格式：admin 攤平 {category,variant,...}；seed {layout:'06c',fields:{...}}
function normalizePage(pg) {
  if (!pg || typeof pg !== 'object') return { category: '03', variant: 'a' };
  if (pg.category) return pg;
  const layout = String(pg.layout || '03a');
  return Object.assign(
    { category: layout.slice(0, 2), variant: layout.slice(2) || 'a', format: pg.format || 'portrait' },
    pg.fields || {},
  );
}

// ---- token：DB（refresh 後最新）優先，fallback env 初始值 ----
async function getToken(deps) {
  const row = (await deps.q(`SELECT value FROM site_content WHERE key=$1`, [TOKEN_KEY])).rows[0];
  return (row && row.value) || process.env.IG_ACCESS_TOKEN || '';
}

async function saveToken(deps, token) {
  await deps.q(
    `INSERT INTO site_content (key,value,updated_at) VALUES ($1,$2,now())
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
    [TOKEN_KEY, token],
  );
}

// 長期 token 60 天效期；每日 cron 續期（token 須存在逾 24h 才可 refresh，失敗僅記 log 不中斷）
async function refreshToken(deps) {
  const token = await getToken(deps);
  if (!token) return null;
  const r = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(`refresh 失敗：${JSON.stringify(j.error || j)}`);
  await saveToken(deps, j.access_token);
  return j.expires_in;
}

// ---- Graph API ----
async function igPost(pathname, params, token) {
  const body = new URLSearchParams(Object.assign({}, params, { access_token: token }));
  const r = await fetch(`${IG_GRAPH}/${pathname}`, { method: 'POST', body });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(`IG API ${pathname}：${JSON.stringify(j.error || j)}`);
  return j;
}

async function igGet(pathname, fields, token) {
  const r = await fetch(`${IG_GRAPH}/${pathname}?fields=${fields}&access_token=${encodeURIComponent(token)}`);
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(`IG API ${pathname}：${JSON.stringify(j.error || j)}`);
  return j;
}

// 容器建立後 IG 端非同步抓圖處理；輪詢至 FINISHED 才可 publish
async function waitContainer(id, token) {
  for (let i = 0; i < CONTAINER_POLL_MAX; i++) {
    const j = await igGet(id, 'status_code', token);
    if (j.status_code === 'FINISHED') return;
    if (j.status_code === 'ERROR') throw new Error(`媒體容器處理失敗（container ${id}）`);
    await new Promise(res => setTimeout(res, CONTAINER_POLL_MS));
  }
  throw new Error(`媒體容器逾時未就緒（container ${id}）`);
}

// ---- render：puppeteer 開本機 ig-render.html，逐頁 screenshot JPEG ----
async function renderPostImages(post, deps) {
  const puppeteer = require('puppeteer'); // 延遲載入：未裝（本機未跑 npm i）時其他功能不受影響
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });
  const files = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${deps.port}/ig-render.html`, { waitUntil: 'networkidle0', timeout: 30000 });
    const safeId = String(post.id).replace(/[^a-zA-Z0-9_-]/g, '');
    for (let i = 0; i < post.pages.length; i++) {
      const spec = normalizePage(post.pages[i]);
      const info = await page.evaluate(s => window.renderPage(s), spec);
      if (!info || !info.ok) throw new Error(`p${i + 1} render 失敗：${(info && info.error) || '未知錯誤'}`);
      const file = `ig-${safeId}-p${i + 1}.jpg`;
      await page.screenshot({
        type: 'jpeg', quality: 92, path: path.join(deps.uploadDir, file),
        clip: { x: 0, y: 0, width: info.w, height: info.h },
      });
      files.push(`/uploads/social/${file}`);
    }
  } finally {
    await browser.close();
  }
  return files;
}

// ---- 發佈一篇：合規 → render → Graph API（單圖／輪播）→ 回 { externalUrl, images } ----
async function publishPost(post, deps) {
  if (!Array.isArray(post.pages) || !post.pages.length) throw new Error('無 pages 可 render，無法發佈');
  const hit = checkBanned(post);
  if (hit.length) throw new Error(`命中禁用字：${hit.join('、')}`);

  const igUserId = process.env.IG_USER_ID || 'me'; // 'me'＝token 本人（單帳號情境免設）
  const token = await getToken(deps);
  if (!token) throw new Error('未設定 IG token（env IG_ACCESS_TOKEN 或後台產生）');

  const images = await renderPostImages(post, deps);
  const urls = images.map(p => `${deps.siteBase}${p}`);
  const caption = [post.caption || '', post.hashtags || ''].filter(Boolean).join('\n\n');

  let creationId;
  if (urls.length === 1) {
    const c = await igPost(`${igUserId}/media`, { image_url: urls[0], caption }, token);
    await waitContainer(c.id, token);
    creationId = c.id;
  } else {
    const children = [];
    for (const u of urls.slice(0, 10)) { // IG 輪播上限 10 頁
      const c = await igPost(`${igUserId}/media`, { image_url: u, is_carousel_item: 'true' }, token);
      await waitContainer(c.id, token);
      children.push(c.id);
    }
    const c = await igPost(`${igUserId}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption }, token);
    await waitContainer(c.id, token);
    creationId = c.id;
  }
  const pub = await igPost(`${igUserId}/media_publish`, { creation_id: creationId }, token);
  let externalUrl = '';
  try { externalUrl = (await igGet(pub.id, 'permalink', token)).permalink || ''; }
  catch (_) { /* permalink 拿不到不影響已發佈事實 */ }
  return { externalUrl, images, mediaId: pub.id };
}

// ---- cron 掃描：到期 scheduled → 逐篇發佈；樂觀鎖防 cron 重疊重發 ----
async function publishDue(deps) {
  // 只補發 24h 內到期者：防啟用當下把整批過期舊排程連環發出（過期逾 24h 請後台改期）
  const due = (await deps.q(
    `SELECT * FROM social_posts
     WHERE platform='ig' AND status='scheduled' AND scheduled_at IS NOT NULL
       AND scheduled_at <= now() AND scheduled_at > now() - interval '24 hours'
     ORDER BY scheduled_at LIMIT 5`,
  )).rows;
  const results = [];
  for (const post of due) {
    const lock = await deps.q(
      `UPDATE social_posts SET status='publishing', updated_at=now() WHERE id=$1 AND status='scheduled'`,
      [post.id],
    );
    if (!lock.rowCount) continue;
    try {
      const r = await publishPost(post, deps);
      await deps.q(
        `UPDATE social_posts SET status='published', published_at=now(), external_url=$2, images=$3, updated_at=now() WHERE id=$1`,
        [post.id, r.externalUrl, JSON.stringify(r.images)],
      );
      console.log(`[ig-publish] 已發佈 ${post.id} → ${r.externalUrl || r.mediaId}`);
      results.push({ id: post.id, ok: true, url: r.externalUrl });
    } catch (e) {
      // 失敗不自動重試（防重複半發佈）；admin 改回 scheduled 才重跑
      await deps.q(
        `UPDATE social_posts SET status='error', notes=left(concat('[ig-publish] ', $2::text, E'\n', notes), 2000), updated_at=now() WHERE id=$1`,
        [post.id, e.message],
      );
      console.error(`[ig-publish] 發佈失敗 ${post.id}：${e.message}`);
      results.push({ id: post.id, ok: false, error: e.message });
    }
  }
  return results;
}

module.exports = { normalizePage, checkBanned, renderPostImages, publishPost, publishDue, refreshToken, getToken, bannedList };
