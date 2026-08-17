/* =========================================================================
   言文字｜台灣人才聚落・創始會員計畫 — backend
   Express 同時提供前端靜態檔與 /api REST API；資料存 Postgres。
   開機自動建表 + （可選）種子；DB 未設定時優雅降級（API 回 503，前端照常）。
   ========================================================================= */
'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { Pool } = require('pg');
const Stripe = require('stripe');
const {
  endsAtAfterActivation, deriveMemberAccess, pickEntitlementForQr,
  applyLazyAutoActivate,
} = require('./lib/entitlements');
const { signAccessToken, verifyAccessToken } = require('./lib/access-token');
const { isAdminApiKey, ADMIN_API_KEY_MIN } = require('./lib/admin-key');
const {
  POINT_PRICE_TWD, PACKS, MEMBERSHIP_GIFT_POINTS,
  addYears, isLotAvailable, availableBalance, planDebit, planRefund, redeemPointsFor,
} = require('./lib/points');
const { sendPage, layoutMiddleware } = require('./lib/layout');
const { SPACE_SEED, missingSpaceSeedKeys } = require('./lib/space-content');
const { assertSpaceImageFile, buildSafeSpaceFilename } = require('./lib/space-upload');
const { assertSocialImageFile, buildSafeSocialFilename, sniffImageType } = require('./lib/social-upload');
const { loadSocialSeedPosts } = require('./lib/social-seed');
const {
  MENU_CONTENT_KEY,
  loadMenuSeedRows,
  buildMenuSeedDoc,
  validateMenuSeedDoc,
  shouldWriteMenuSeed,
  stringifyMenuDoc,
} = require('./lib/menu-seed');

const PORT = process.env.PORT || 8080;
const PRICE = 35000;                    // 創始會費（固定）
const TARGET = 3500000;                 // 預收會費總額（100 名 × NT$35,000）
const MIN_TERM = 18, MAX_TERM = 18;     // 會籍期間固定 18 個月（term 以月計）
// 超級管理員：以 Google 帳號（email）認定，非代碼。超管可於後台指派其他管理員（users.is_admin）。
const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || 'us@twouring.com').toLowerCase();
const SECRET = process.env.APP_SECRET || 'dev-insecure-secret-change-me';
const ACCESS_QR_SECRET = process.env.ACCESS_QR_SECRET || '';
const ACCESS_DOOR_SECRET = process.env.ACCESS_DOOR_SECRET || '';
// AI agent 管理金鑰：以 Authorization: Bearer <key> 取得超級管理員權限打 /api/admin/*。
// 等同超管密碼，僅存於環境變數、勿寫入前端；外洩即全後台淪陷，換金鑰即撤銷。
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
// 受邀制會籍預售：限定特定受邀者、名額上限 100 名，售罄不補
const MAX_PARTICIPANTS = Number(process.env.MAX_PARTICIPANTS || 100);
// 個資加密金鑰（身分證字號等敏感欄位 at-rest 加密）；建議獨立設 PII_KEY，預設沿用 APP_SECRET 衍生
const PII_KEY = require('crypto').createHash('sha256').update(process.env.PII_KEY || SECRET).digest();

if (SECRET === 'dev-insecure-secret-change-me') console.warn('[warn] APP_SECRET 未設定，使用不安全的預設值，請於 Zeabur 設定 APP_SECRET。');
if (!ACCESS_QR_SECRET) console.warn('[warn] ACCESS_QR_SECRET 未設定，進出 QR 停用。');
if (!ACCESS_DOOR_SECRET) console.warn('[warn] ACCESS_DOOR_SECRET 未設定，access/scan 停用。');
if (!ADMIN_API_KEY) console.warn('[warn] ADMIN_API_KEY 未設定，AI agent 管理 API 停用（後台 Google 登入不受影響）。');
else if (ADMIN_API_KEY.length < ADMIN_API_KEY_MIN)
  console.warn(`[warn] ADMIN_API_KEY 長度不足 ${ADMIN_API_KEY_MIN} 字元，已忽略；請改用 openssl rand -hex 32 產生。`);

/* ---------- Stripe（開放購買；未設金鑰時 /api/checkout 回 503） ---------- */
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
if (!stripe) console.warn('[warn] STRIPE_SECRET_KEY 未設定，購買功能停用（/api/checkout 回 503）。');
const MEMBERSHIP_START = process.env.MEMBERSHIP_START || '2026-11-01'; // 會籍起算＝開幕日

/* ---------- Google 登入（官網會員專區用；未設 GOOGLE_CLIENT_ID 時 /auth/google 回 503） ---------- */
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
// 站台對外網址，供 Google 導回 callback；本地測試設 PUBLIC_ORIGIN=http://localhost:8080
const SITE_BASE = (process.env.PUBLIC_ORIGIN || 'https://www.emoji.tw').replace(/\/$/, '');
const GOOGLE_REDIRECT_URI = SITE_BASE + '/auth/google/callback';
if (!GOOGLE_CLIENT_ID) console.warn('[warn] GOOGLE_CLIENT_ID 未設定，Google 登入停用（/auth/google 回 503）。');
// 允許的登入完成導回目標與 CORS 來源（官網子網域），防 open redirect；逗號分隔可覆寫
const WEB_ORIGINS = (process.env.WEB_ORIGINS ||
  'https://www.emoji.tw,https://emoji.tw,http://localhost:5500,http://127.0.0.1:5500')
  .split(',').map(s => s.trim()).filter(Boolean);
const DEFAULT_MEMBER_URL = (process.env.MEMBER_URL || WEB_ORIGINS[0] + '/member');
function safeRedirect(u) {
  try { return WEB_ORIGINS.includes(new URL(u).origin) ? u : null; } catch { return null; }
}

/* ---------- DB ---------- */
const connStr = process.env.DATABASE_URL || process.env.POSTGRES_CONNECTION_STRING || '';
function poolConfig() {
  // SSL：Zeabur 內網 Postgres 不需 SSL（預設關閉，不會停用任何驗證）。
  // 託管型外部 DB 需要 SSL 時：設 PGSSL=true（完整驗證憑證）；
  // 僅當憑證鏈無法驗證、且你信任該網路時，才用 PGSSL=relax（放寬驗證）。
  let ssl = false;
  if (process.env.PGSSL === 'true') ssl = true;
  else if (process.env.PGSSL === 'relax') ssl = { rejectUnauthorized: false };
  if (connStr) return { connectionString: connStr, ssl };
  // 退而求其次：用個別環境變數組裝（相容 Zeabur POSTGRES_* 與標準 PG*）
  const host = process.env.POSTGRES_HOST || process.env.PGHOST;
  if (!host) return null;
  return {
    host,
    port: Number(process.env.POSTGRES_PORT || process.env.PGPORT || 5432),
    user: process.env.POSTGRES_USERNAME || process.env.POSTGRES_USER || process.env.PGUSER,
    password: process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD,
    database: process.env.POSTGRES_DATABASE || process.env.POSTGRES_DB || process.env.PGDATABASE,
    ssl,
  };
}
const cfg = poolConfig();
const pool = cfg ? new Pool(cfg) : null;
let dbReady = false;
const q = (text, params) => pool.query(text, params);

/* ---------- 日期工具 ---------- */
function addMonthsISO(iso, m) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + m);
  return d.toISOString().slice(0, 10);
}
const todayISO = () => new Date().toISOString().slice(0, 10);
const uid = (p = '') => p + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
const certNo = seq => 'TTHM-2026-' + String(seq).padStart(3, '0');

/* ---------- 敏感個資 at-rest 加密（AES-256-GCM） ---------- */
function decPII(v) {
  if (!v || typeof v !== 'string' || !v.startsWith('enc:')) return v;
  try {
    const raw = Buffer.from(v.slice(4), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', PII_KEY, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch (e) { return '***'; }
}
const pubUser = u => u ? { ...u, id_no: decPII(u.id_no) } : u;

/* ---------- migrate + seed ---------- */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS bonds (
  id TEXT PRIMARY KEY,
  project_name TEXT,
  target_amount BIGINT,
  interest_rate NUMERIC,
  min_term INT, max_term INT,
  status TEXT,
  progress INT
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT, email TEXT, phone TEXT,
  invite_code TEXT UNIQUE,
  id_no TEXT, address TEXT, bank TEXT,
  status TEXT, can_view BOOLEAN DEFAULT true,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS commitments (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  amount BIGINT, interest_rate NUMERIC, term_years INT,
  start_date DATE, maturity_date DATE,
  contract_status TEXT, payment_status TEXT, membership_status TEXT,
  cert_no TEXT UNIQUE, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  commitment_id TEXT REFERENCES commitments(id) ON DELETE CASCADE,
  type TEXT, amount BIGINT,
  due_date DATE, paid_date DATE, status TEXT
);
CREATE TABLE IF NOT EXISTS updates (
  id TEXT PRIMARY KEY,
  title TEXT, content TEXT, type TEXT,
  visible_to TEXT DEFAULT 'all',
  published_at DATE
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT, description TEXT, location TEXT,
  starts_at TIMESTAMPTZ,
  capacity INT DEFAULT 0,               -- 0 = 不限名額
  status TEXT DEFAULT '報名中',          -- 草稿 / 報名中 / 已結束
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS event_regs (
  id TEXT PRIMARY KEY,
  event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (event_id, user_id)
);
CREATE TABLE IF NOT EXISTS entitlements (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  source TEXT,
  source_id TEXT,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (source, source_id)
);
CREATE INDEX IF NOT EXISTS entitlements_user_idx ON entitlements(user_id);
CREATE TABLE IF NOT EXISTS access_scans (
  id TEXT PRIMARY KEY,
  entitlement_id TEXT REFERENCES entitlements(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  token_iat INT,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entitlement_id, token_iat)
);
CREATE TABLE IF NOT EXISTS site_content (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS point_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pack_id TEXT NOT NULL,
  principal INT NOT NULL,
  bonus INT NOT NULL DEFAULT 0,
  pay_twd INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  stripe_session_id TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS point_orders_stripe_session_uidx
  ON point_orders(stripe_session_id) WHERE stripe_session_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS point_lots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  original_amount INT NOT NULL,
  remaining INT NOT NULL,
  expires_at TIMESTAMPTZ,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, type, source_type, source_id)
);
CREATE INDEX IF NOT EXISTS point_lots_user_idx ON point_lots(user_id);
CREATE TABLE IF NOT EXISTS point_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lot_id TEXT REFERENCES point_lots(id),
  delta INT NOT NULL,
  reason TEXT NOT NULL,
  ref_type TEXT,
  ref_id TEXT,
  actor TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS point_ledger_user_idx ON point_ledger(user_id);
CREATE TABLE IF NOT EXISTS point_redemptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  points INT NOT NULL,
  hours INT,
  status TEXT NOT NULL DEFAULT 'paid',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS point_refunds (
  id TEXT PRIMARY KEY,
  point_order_id TEXT NOT NULL REFERENCES point_orders(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  principal_points INT NOT NULL,
  refund_twd INT NOT NULL,
  bonus_voided INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  stripe_refund_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS social_posts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL DEFAULT 'ig',
  post_type TEXT NOT NULL DEFAULT 'image',
  status TEXT NOT NULL DEFAULT 'draft',
  title TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  caption_en TEXT NOT NULL DEFAULT '',
  caption_ja TEXT NOT NULL DEFAULT '',
  hashtags TEXT NOT NULL DEFAULT '',
  pages JSONB NOT NULL DEFAULT '[]',
  images JSONB NOT NULL DEFAULT '[]',
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  external_url TEXT NOT NULL DEFAULT '',
  series TEXT NOT NULL DEFAULT '',
  phase TEXT NOT NULL DEFAULT '',
  cta TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  metrics JSONB NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS social_posts_sched_idx ON social_posts(scheduled_at);
CREATE TABLE IF NOT EXISTS ig_assets (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  used_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

async function migrate() {
  await q(SCHEMA_SQL);
  // 既有 DB 補欄位：管理員旗標（超管以 Google email 認定，其餘管理員存此旗標）
  await q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false`);
  // 社群貼文雙語欄位（IG 中英、X 中日）
  await q(`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS caption_en TEXT NOT NULL DEFAULT ''`);
  await q(`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS caption_ja TEXT NOT NULL DEFAULT ''`);
  // Founding rebrand：既有資料的舊編號一次改過（冪等，無舊資料時不影響）
  await q(`UPDATE commitments SET cert_no = replace(replace(cert_no,'TTHB-','TTHM-'),'TTHF-','TTHM-') WHERE cert_no LIKE 'TTHB-%' OR cert_no LIKE 'TTHF-%'`);
  // 創始會員計畫改版：舊版專案參數一次改過（冪等）
  await q(`UPDATE bonds SET target_amount=$1, interest_rate=0, min_term=$2, max_term=$3, status='預售中' WHERE id='b1' AND target_amount=10000000`,
    [TARGET, MIN_TERM, MAX_TERM]);
  // 正式上線：下架示範資料（僅刪固定示範 id，真實資料不受影響；冪等）
  await q(`DELETE FROM users WHERE id IN ('u_demo','u_invite','u2','u3','u4','u5','u6','u7')`);
  await q(`DELETE FROM updates WHERE id IN ('up1','up2','up3')`);
  const { rows } = await q('SELECT COUNT(*)::int AS n FROM bonds');
  if (rows[0].n === 0) await seedBond();
  const paid = (await q(`SELECT ${SEL_C} FROM commitments WHERE payment_status='已付款'`)).rows;
  for (const c of paid) await ensureFoundingEntitlement(c);
  await seedSpaceContent();
  await seedMenuContent();
  await seedSocialPosts();
}

async function seedBond() {
  await q(
    `INSERT INTO bonds (id,project_name,target_amount,interest_rate,min_term,max_term,status,progress)
     VALUES ('b1','Taiwan Talent Hub',$1,0,$2,$3,'預售中',42) ON CONFLICT (id) DO NOTHING`,
    [TARGET, MIN_TERM, MAX_TERM]
  );
}

// 空間介紹（menu 頁四樓文案）：既有內容不覆蓋，僅補缺漏的語系鍵值
async function seedSpaceContent() {
  const content = await readContent();
  const miss = missingSpaceSeedKeys(content);
  for (const key of miss) {
    const value = SPACE_SEED[key];
    if (!value) continue;
    await q(
      `INSERT INTO site_content (key,value,updated_at) VALUES ($1,$2,now())
       ON CONFLICT (key) DO NOTHING`,
      [key, value]
    );
  }
}

// 社群貼文：依固定 id 補缺（不覆蓋後台編輯）；FORCE_SOCIAL_SEED=1 時覆寫內容欄位
async function seedSocialPosts() {
  const force = process.env.FORCE_SOCIAL_SEED === '1' || process.env.FORCE_SOCIAL_SEED === 'true';
  let posts;
  try {
    posts = loadSocialSeedPosts();
  } catch (e) {
    console.warn('[social-seed] 讀取 seed 失敗，略過：', e && e.message);
    return;
  }
  // 墓碑：後台刪除過的種子 id 不再復活（FORCE_SOCIAL_SEED=1 無視墓碑重灌）
  let dead = [];
  if (!force) {
    const row = (await q(`SELECT value FROM site_content WHERE key='social_seed_deleted'`)).rows[0];
    try { dead = JSON.parse((row && row.value) || '[]'); } catch (_) { dead = []; }
    if (!Array.isArray(dead)) dead = [];
  }
  for (const p of posts) {
    if (dead.includes(p.id)) continue;
    const scheduledAt = parseTaipei(p.scheduled_at);   // seed 排程以台北時間解讀（function 宣告有 hoisting，先用後定義無妨）
    if (scheduledAt && isNaN(scheduledAt.getTime())) {
      console.warn('[social-seed] 排程時間格式錯誤，略過：', p.id, p.scheduled_at);
      continue;
    }
    const vals = [
      p.id, p.platform, p.post_type, p.status, p.title, p.caption, p.caption_en || '', p.caption_ja || '', p.hashtags,
      JSON.stringify(p.pages || []), JSON.stringify(p.images || []),
      scheduledAt,
      p.external_url || '', p.series || '', p.phase || '', p.cta || '', p.audience || '', p.notes || '',
    ];
    try {
      if (force) {
        await q(
          `INSERT INTO social_posts (id,platform,post_type,status,title,caption,caption_en,caption_ja,hashtags,pages,images,scheduled_at,external_url,series,phase,cta,audience,notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
           ON CONFLICT (id) DO UPDATE SET platform=EXCLUDED.platform, post_type=EXCLUDED.post_type,
             title=EXCLUDED.title, caption=EXCLUDED.caption, caption_en=EXCLUDED.caption_en, caption_ja=EXCLUDED.caption_ja,
             hashtags=EXCLUDED.hashtags, pages=EXCLUDED.pages,
             scheduled_at=EXCLUDED.scheduled_at, series=EXCLUDED.series, phase=EXCLUDED.phase,
             cta=EXCLUDED.cta, audience=EXCLUDED.audience, notes=EXCLUDED.notes, updated_at=now()`,
          vals
        );
      } else {
        await q(
          `INSERT INTO social_posts (id,platform,post_type,status,title,caption,caption_en,caption_ja,hashtags,pages,images,scheduled_at,external_url,series,phase,cta,audience,notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
           ON CONFLICT (id) DO NOTHING`,
          vals
        );
      }
    } catch (e) {
      // 單筆匯入失敗不擋 migrate（否則整站 API 會因 dbReady=false 全回 503）
      console.warn('[social-seed] 匯入失敗，略過：', p.id, e && e.message);
    }
  }
  if (force) console.warn('[social-seed] FORCE_SOCIAL_SEED=1：已覆寫種子貼文內容。請勿長期開啟此旗標。');
}

// 菜單：缺鍵時灌入 seed（全部 published:true）；FORCE_MENU_SEED=1 時覆寫
async function seedMenuContent() {
  const force = process.env.FORCE_MENU_SEED === '1' || process.env.FORCE_MENU_SEED === 'true';
  const content = await readContent();
  if (!shouldWriteMenuSeed(content, force)) return;
  let rows;
  try {
    rows = loadMenuSeedRows();
  } catch (e) {
    console.warn('[menu-seed] 讀取 seed 失敗，略過：', e && e.message);
    return;
  }
  const doc = buildMenuSeedDoc(rows);
  const v = validateMenuSeedDoc(doc);
  if (!v.ok) {
    console.warn('[menu-seed] 驗證失敗，略過：', v.error);
    return;
  }
  const value = stringifyMenuDoc(doc);
  await q(
    `INSERT INTO site_content (key,value,updated_at) VALUES ($1,$2,now())
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
    [MENU_CONTENT_KEY, value]
  );
  if (force) {
    console.warn('[menu-seed] FORCE_MENU_SEED=1：已覆寫 site_content.menu（全部已發布）。請勿長期開啟此旗標。');
  } else {
    console.log('[menu-seed] 已灌入 site_content.menu（全部已發布）。');
  }
}

/* ---------- token (HMAC) ---------- */
const b64 = s => Buffer.from(s).toString('base64url');
const unb64 = s => Buffer.from(s, 'base64url').toString('utf8');
const hmac = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
function signToken(payload) {
  const body = b64(JSON.stringify({ ...payload, iat: Date.now() }));
  return body + '.' + hmac(body);
}
function verifyToken(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [body, sig] = token.split('.');
  const expected = hmac(body);
  if (sig.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try { return JSON.parse(unb64(body)); } catch (e) { return null; }
}

/* ---------- SELECT 片段（日期格式化成 YYYY/MM/DD） ---------- */
const SEL_USER = `id,name,email,phone,invite_code,id_no,address,bank,status,can_view,is_admin,to_char(created_at,'YYYY/MM/DD') AS created_at`;
const SEL_C = `id,user_id,amount::bigint,interest_rate,term_years,
  to_char(start_date,'YYYY/MM/DD') AS start_date,
  to_char(maturity_date,'YYYY/MM/DD') AS maturity_date,
  contract_status,payment_status,membership_status,cert_no`;
const SEL_UPD = `id,title,content,type,to_char(published_at,'YYYY/MM/DD') AS published_at`;
const SEL_EVENT = `id,title,description,location,capacity,status,
  to_char(starts_at,'YYYY/MM/DD HH24:MI') AS starts_at,
  starts_at AS starts_at_iso`;
const SEL_ENT = `id,user_id,plan,source,source_id,
  purchased_at, activated_at, starts_at, ends_at`;
const numify = rows => rows.map(r => ({ ...r, amount: r.amount != null ? Number(r.amount) : r.amount }));
const FLOOR_PLANS = ['day_4h', 'day_12h', 'month', 'quarter', 'year'];

function rowToEnt(r) {
  if (!r) return null;
  return {
    ...r,
    purchased_at: r.purchased_at ? new Date(r.purchased_at) : null,
    activated_at: r.activated_at ? new Date(r.activated_at) : null,
    starts_at: r.starts_at ? new Date(r.starts_at) : null,
    ends_at: r.ends_at ? new Date(r.ends_at) : null,
  };
}

async function loadEntitlements(userId) {
  return (await q(
    `SELECT ${SEL_ENT} FROM entitlements WHERE user_id=$1 ORDER BY purchased_at`,
    [userId]
  )).rows.map(rowToEnt);
}

async function persistLazyActivations(ents, now = new Date()) {
  const out = [];
  for (const e of ents) {
    const { changed, entitlement } = applyLazyAutoActivate(e, now);
    if (!changed) { out.push(e); continue; }
    const r = await q(
      `UPDATE entitlements SET activated_at=$2, starts_at=$3, ends_at=$4
       WHERE id=$1 AND activated_at IS NULL
       RETURNING ${SEL_ENT}`,
      [e.id, entitlement.activated_at, entitlement.starts_at, entitlement.ends_at]
    );
    out.push(r.rows[0] ? rowToEnt(r.rows[0]) : (await loadEntitlements(e.user_id)).find(x => x.id === e.id) || entitlement);
  }
  return out;
}

async function memberAccessFor(userId, now = new Date()) {
  let ents = await loadEntitlements(userId);
  ents = await persistLazyActivations(ents, now);
  return deriveMemberAccess(ents, now);
}

function accessSummary(access) {
  return [
    ...(access.activeEntitlements || []).map(e => e.plan),
    ...(access.pending || []).map(e => e.plan + '（待啟用）'),
  ].join('、') || '—';
}

async function ensureFoundingEntitlement(commitment) {
  // commitment: { id, user_id, start_date, maturity_date, payment_status, membership_status }
  if (commitment.payment_status !== '已付款') return null;
  const starts = new Date(String(commitment.start_date).replace(/\//g, '-') + 'T00:00:00.000Z');
  const maturityDay = String(commitment.maturity_date).replace(/\//g, '-');
  const maturityStart = new Date(maturityDay + 'T00:00:00.000Z');
  // maturity_date 是會籍末日；ends_at 為末日次日 00:00 UTC，採半開區間 [starts, ends)。
  const endsExclusive = new Date(maturityStart.getTime() + 24 * 3600 * 1000);
  const id = uid('en_');
  const r = await q(
    `INSERT INTO entitlements
      (id,user_id,plan,source,source_id,purchased_at,activated_at,starts_at,ends_at)
     VALUES ($1,$2,'founding','commitment',$3,now(),$4,$4,$5)
     ON CONFLICT (source, source_id) DO UPDATE SET
       starts_at=EXCLUDED.starts_at, ends_at=EXCLUDED.ends_at,
       activated_at=COALESCE(entitlements.activated_at, EXCLUDED.activated_at)
     RETURNING ${SEL_ENT}`,
    [id, commitment.user_id, commitment.id, starts, endsExclusive]
  );
  return rowToEnt(r.rows[0]);
}

function rowToLot(r) {
  if (!r) return null;
  return {
    ...r,
    original_amount: Number(r.original_amount),
    remaining: Number(r.remaining),
    expires_at: r.expires_at ? new Date(r.expires_at) : null,
    created_at: r.created_at ? new Date(r.created_at) : null,
  };
}

async function expireLotsForUser(userId, now = new Date()) {
  const due = await q(
    `SELECT id, remaining FROM point_lots
     WHERE user_id=$1 AND remaining > 0 AND expires_at IS NOT NULL AND expires_at <= $2`,
    [userId, now]
  );
  for (const row of due.rows) {
    const rem = Number(row.remaining);
    const u = await q(
      `UPDATE point_lots SET remaining=0 WHERE id=$1 AND remaining=$2 RETURNING id`,
      [row.id, rem]
    );
    if (!u.rowCount) continue;
    await q(
      `INSERT INTO point_ledger (id, user_id, lot_id, delta, reason, actor)
       VALUES ($1,$2,$3,$4,'expire','system')`,
      [uid('ldg_'), userId, row.id, -rem]
    );
  }
}

async function loadPointLots(userId, client) {
  await expireLotsForUser(userId);
  const run = client ? (t, p) => client.query(t, p) : q;
  const r = await run(
    `SELECT id, user_id, type, original_amount, remaining, expires_at, source_type, source_id, created_at
     FROM point_lots WHERE user_id=$1 ORDER BY created_at`,
    [userId]
  );
  return r.rows.map(rowToLot);
}

async function creditLot(client, {
  userId, type, amount, expiresAt, sourceType, sourceId, reason, actor, note,
}) {
  const id = uid('pl_');
  const ins = await client.query(
    `INSERT INTO point_lots
       (id, user_id, type, original_amount, remaining, expires_at, source_type, source_id)
     VALUES ($1,$2,$3,$4,$4,$5,$6,$7)
     ON CONFLICT (user_id, type, source_type, source_id) DO NOTHING
     RETURNING *`,
    [id, userId, type, amount, expiresAt, sourceType, sourceId]
  );
  let row = ins.rows[0];
  if (!row) {
    row = (await client.query(
      `SELECT * FROM point_lots WHERE user_id=$1 AND type=$2 AND source_type=$3 AND source_id=$4`,
      [userId, type, sourceType, sourceId]
    )).rows[0];
    return { lot: rowToLot(row), created: false };
  }
  await client.query(
    `INSERT INTO point_ledger (id, user_id, lot_id, delta, reason, ref_type, ref_id, actor, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [uid('ldg_'), userId, row.id, amount, reason, sourceType, sourceId, actor || 'system', note || null]
  );
  return { lot: rowToLot(row), created: true };
}

async function fulfillPointOrder(client, order, now = new Date()) {
  if (order.status === 'paid') return { already: true };
  const upd = await client.query(
    `UPDATE point_orders SET status='paid', paid_at=$2 WHERE id=$1 AND status='pending' RETURNING *`,
    [order.id, now]
  );
  if (!upd.rows[0]) {
    const cur = (await client.query(`SELECT * FROM point_orders WHERE id=$1`, [order.id])).rows[0];
    return { already: cur && cur.status === 'paid' };
  }
  await creditLot(client, {
    userId: order.user_id, type: 'purchase', amount: Number(order.principal),
    expiresAt: null, sourceType: 'point_order', sourceId: order.id,
    reason: 'purchase', actor: 'system',
  });
  if (Number(order.bonus) > 0) {
    await creditLot(client, {
      userId: order.user_id, type: 'bonus', amount: Number(order.bonus),
      expiresAt: addYears(now, 1), sourceType: 'point_order', sourceId: order.id,
      reason: 'bonus', actor: 'system',
    });
  }
  return { already: false };
}

async function grantMembershipGift(client, userId, plan, sourceId, now = new Date()) {
  const amount = MEMBERSHIP_GIFT_POINTS[plan];
  if (amount == null) throw new Error('unknown plan');
  if (amount <= 0) return { skipped: true };
  return creditLot(client, {
    userId, type: 'membership_gift', amount,
    expiresAt: addYears(now, 1),
    sourceType: 'commitment', sourceId,
    reason: 'membership_gift', actor: 'system',
  });
}

async function applyDebit(client, userId, allocations, reason, refType, refId, actor) {
  for (const a of allocations) {
    const u = await client.query(
      `UPDATE point_lots SET remaining = remaining - $2
       WHERE id=$1 AND remaining >= $2
         AND (expires_at IS NULL OR expires_at > now())
       RETURNING id`,
      [a.lot_id, a.amount]
    );
    if (!u.rowCount) {
      const err = new Error('lot_debit_conflict');
      err.status = 409;
      throw err;
    }
    await client.query(
      `INSERT INTO point_ledger (id, user_id, lot_id, delta, reason, ref_type, ref_id, actor)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [uid('ldg_'), userId, a.lot_id, -a.amount, reason, refType, refId, actor]
    );
  }
}

async function pointsSummaryFor(userId) {
  const lots = await loadPointLots(userId);
  const now = new Date();
  return {
    balance: availableBalance(lots, now),
    lots: lots.map(l => ({
      id: l.id,
      type: l.type,
      remaining: l.remaining,
      expires_at: l.expires_at,
      source_type: l.source_type,
      source_id: l.source_id,
      available: isLotAvailable(l, now),
    })),
  };
}

/* ---------- app ---------- */
const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '256kb' }));

// CORS：官網（www.emoji.tw）會員專區以 Bearer token 跨網域打 /api；只放行白名單來源
app.use((req, res, next) => {
  const o = req.headers.origin;
  if (o && WEB_ORIGINS.includes(o)) {
    res.set('Access-Control-Allow-Origin', o);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Headers', 'authorization, content-type');
    res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// 503 if DB not ready（讓前端照常運作，但 API 明確回報）
function requireDb(req, res, next) {
  if (!pool) return res.status(503).json({ error: '尚未設定資料庫連線（DATABASE_URL）。' });
  if (!dbReady) return res.status(503).json({ error: '資料庫尚未就緒，請稍候再試。' });
  next();
}
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  // AI agent：金鑰即超管身分，sub 為 null（不綁任何會員，故 /api/me/* 一律拒絕）
  if (isAdminApiKey(t, ADMIN_API_KEY)) {
    req.auth = { role: 'admin', super: true, sub: null, agent: true };
    return next();
  }
  const p = verifyToken(t);
  if (!p) return res.status(401).json({ error: '請先登入。' });
  req.auth = p; next();
}
function doorAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!ACCESS_DOOR_SECRET || t !== ACCESS_DOOR_SECRET)
    return res.status(401).json({ error: '門禁憑證無效。' });
  next();
}
function adminOnly(req, res, next) {
  if (req.auth.role !== 'admin') return res.status(403).json({ error: '需要後台權限。' });
  next();
}
function superOnly(req, res, next) {
  if (req.auth.super !== true) return res.status(403).json({ error: '需要超級管理員權限。' });
  next();
}
const wrap = fn => (req, res) => fn(req, res).catch(e => {
  console.error('[api error]', e.message);
  res.status(500).json({ error: '伺服器處理失敗。' });
});

app.get('/api/health', (req, res) =>
  res.json({ ok: true, db: dbReady, dbConfigured: !!pool }));

/* ---- Google 登入（OAuth 2.0 授權碼流程；重用既有 signToken 與 users 表） ---- */
app.get('/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(503).send('Google 登入尚未開通（未設定 GOOGLE_CLIENT_ID）。');
  const redirect = safeRedirect(req.query.redirect) || DEFAULT_MEMBER_URL;
  // state：HMAC 簽章保護導回目標並帶 nonce（CSRF 防護），callback 端驗章與時效
  const state = signToken({ r: redirect, n: crypto.randomBytes(8).toString('hex') });
  const p = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID, redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account',
  });
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + p);
});

app.get('/auth/google/callback', wrap(async (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(503).send('Google 登入尚未開通。');
  const st = verifyToken(String(req.query.state || ''));
  if (!st || !st.r || Date.now() - (st.iat || 0) > 10 * 60 * 1000)
    return res.status(400).send('登入連結已失效，請重新登入。');
  const redirect = safeRedirect(st.r) || DEFAULT_MEMBER_URL;
  if (!req.query.code) return res.status(400).send('登入未完成。');
  // 以授權碼換 access_token（後端持 client_secret）
  const tok = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: String(req.query.code), client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  }).then(r => r.json()).catch(() => ({}));
  if (!tok.access_token) return res.status(400).send('Google 驗證失敗，請重試。');
  const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: 'Bearer ' + tok.access_token },
  }).then(r => r.json()).catch(() => ({}));
  if (!info.email || info.email_verified === false)
    return res.status(400).send('無法取得已驗證的 Google Email。');
  if (!pool || !dbReady) return res.status(503).send('資料庫尚未就緒，請稍後再試。');
  // upsert：以已驗證 email 為鍵（Google 保證 email_verified 時為本人所有）
  const email = String(info.email).toLowerCase();
  let u = (await q(`SELECT id, name FROM users WHERE lower(email)=$1 LIMIT 1`, [email])).rows[0];
  if (!u) {
    const id = uid('u_');
    const name = info.name || info.email;
    await q(`INSERT INTO users (id,name,email,status,created_at) VALUES ($1,$2,$3,'已查看',now())`,
      [id, name, info.email]);
    u = { id, name };
  } else if (info.name) {
    await q(`UPDATE users SET name=$2 WHERE id=$1 AND (name IS NULL OR name='')`, [u.id, info.name]);
    if (!u.name) u.name = info.name;
  }
  // 管理權限：超管以 email 認定；其餘管理員讀 users.is_admin（由超管指派）
  const isSuper = email === SUPER_ADMIN_EMAIL;
  const isAdmin = isSuper || (await q(`SELECT is_admin FROM users WHERE id=$1`, [u.id])).rows[0]?.is_admin === true;
  const n = (await q(`SELECT COUNT(*)::int AS n FROM commitments WHERE user_id=$1`, [u.id])).rows[0].n;
  const role = isAdmin ? 'admin' : (n > 0 ? 'participant' : 'invited');
  const token = signToken({ role, sub: u.id, super: isSuper, name: u.name || info.name || '' });
  // token 以 URL fragment 帶回官網（不進伺服器存取記錄）；官網讀取後即從網址移除
  const sep = redirect.includes('#') ? '&' : '#';
  res.redirect(redirect + sep + 'token=' + encodeURIComponent(token));
}));

// 網站內容（首頁公告等）：讀成 { key: value } 物件
async function readContent() {
  const rows = (await q(`SELECT key, value FROM site_content`)).rows;
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

app.get('/api/state', auth, requireDb, wrap(async (req, res) => {
  const raised = Number((await q(`SELECT COALESCE(SUM(amount),0)::bigint AS s FROM commitments WHERE payment_status='已付款'`)).rows[0].s);
  const bond = { target_amount: TARGET, raised };
  const updates = numify((await q(`SELECT ${SEL_UPD} FROM updates ORDER BY published_at DESC`)).rows);

  if (req.auth.role === 'admin') {
    const users = (await q(`SELECT ${SEL_USER} FROM users ORDER BY created_at`)).rows.map(pubUser);
    const commitments = numify((await q(`SELECT ${SEL_C} FROM commitments ORDER BY created_at`)).rows);
    const entitlements = (await q(`SELECT ${SEL_ENT} FROM entitlements`)).rows.map(rowToEnt);
    for (const u of users) {
      const access = await memberAccessFor(u.id);
      u.access_active = access.active;
      u.access_summary = accessSummary(access);
      u.points_balance = (await pointsSummaryFor(u.id)).balance;
    }
    // 活動 + 每場報名人數（後台總覽用）
    const events = (await q(
      `SELECT ${SEL_EVENT}, (SELECT COUNT(*)::int FROM event_regs r WHERE r.event_id=e.id) AS reg_count
       FROM events e ORDER BY starts_at DESC NULLS LAST, created_at DESC`)).rows;
    const content = await readContent();
    const me = users.find(u => u.id === req.auth.sub) || null;  // 管理員自己：供會員頁顯示姓名
    return res.json({ role: 'admin', super: req.auth.super === true, me, bond, users, commitments, entitlements, events, content, updates });
  }
  const me = pubUser((await q(`SELECT ${SEL_USER} FROM users WHERE id=$1`, [req.auth.sub])).rows[0]);
  if (!me) return res.status(401).json({ error: '帳號不存在，請重新登入。' });
  const commitments = numify((await q(`SELECT ${SEL_C} FROM commitments WHERE user_id=$1 ORDER BY created_at`, [me.id])).rows);
  const access = await memberAccessFor(me.id);
  const points = await pointsSummaryFor(me.id);
  const pointOrders = (await q(
    `SELECT id, pack_id, principal, bonus, pay_twd, status, paid_at, created_at
     FROM point_orders WHERE user_id=$1 ORDER BY created_at DESC`, [me.id]
  )).rows;
  // 會員專區：報名中的活動 + 我是否已報名（供報名/取消按鈕）
  const events = (await q(
    `SELECT ${SEL_EVENT},
       (SELECT COUNT(*)::int FROM event_regs r WHERE r.event_id=e.id) AS reg_count,
       EXISTS (SELECT 1 FROM event_regs r WHERE r.event_id=e.id AND r.user_id=$1) AS registered
     FROM events e WHERE status='報名中' ORDER BY starts_at ASC NULLS LAST`, [me.id])).rows;
  res.json({
    role: commitments.length ? 'participant' : 'invited',
    me, bond, users: [me], commitments, events, updates,
    access: {
      active: access.active,
      entitlements: access.entitlements,
      pending: access.pending,
      activeEntitlements: access.activeEntitlements,
    },
    points,
    point_orders: pointOrders,
  });
}));

app.get('/api/me/access-qr', auth, requireDb, wrap(async (req, res) => {
  if (!ACCESS_QR_SECRET) return res.status(503).json({ error: '進出 QR 尚未開通（未設定 ACCESS_QR_SECRET）。' });
  if (!req.auth.sub) return res.status(403).json({ error: '請以會員身分登入。' });
  const now = new Date();
  let ents = await persistLazyActivations(await loadEntitlements(req.auth.sub), now);
  const pick = pickEntitlementForQr(ents, now);
  if (!pick) return res.status(403).json({ error: '目前無法進出二三樓（無有效或待啟用權益）。', code: 'NO_ENTITLEMENT' });
  const pending = !pick.activated_at;
  const token = signAccessToken({
    sub: req.auth.sub,
    ent: pick.id,
    plan: pick.plan,
    floors: ['2', '3'],
    pending_activation: pending,
  }, ACCESS_QR_SECRET, { ttlSec: 45 });
  const payload = verifyAccessToken(token, ACCESS_QR_SECRET);
  res.json({
    token,
    exp: payload.exp,
    pending_activation: pending,
    plan: pick.plan,
    entitlement_id: pick.id,
  });
}));

app.post('/api/access/verify', wrap(async (req, res) => {
  if (!ACCESS_QR_SECRET) return res.status(503).json({ error: '未設定 ACCESS_QR_SECRET。' });
  const token = String((req.body && req.body.token) || '');
  const p = verifyAccessToken(token, ACCESS_QR_SECRET);
  if (!p) return res.status(401).json({ ok: false, error: '無效或過期的 QR。' });
  res.json({ ok: true, claims: p });
}));

app.post('/api/access/scan', doorAuth, requireDb, wrap(async (req, res) => {
  if (!ACCESS_QR_SECRET) return res.status(503).json({ error: '未設定 ACCESS_QR_SECRET。' });
  const token = String((req.body && req.body.token) || '');
  const p = verifyAccessToken(token, ACCESS_QR_SECRET);
  if (!p) return res.status(401).json({ ok: false, error: '無效或過期的 QR。' });

  const ent = rowToEnt((await q(`SELECT ${SEL_ENT} FROM entitlements WHERE id=$1`, [p.ent])).rows[0]);
  if (!ent || ent.user_id !== p.sub)
    return res.status(400).json({ ok: false, error: '權益不符。' });

  const now = new Date();
  // 冪等：同一 token_iat + entitlement 只記一次
  const scanId = uid('as_');
  const ins = await q(
    `INSERT INTO access_scans (id,entitlement_id,user_id,token_iat,scanned_at)
     VALUES ($1,$2,$3,$4,now())
     ON CONFLICT (entitlement_id, token_iat) DO NOTHING
     RETURNING id`,
    [scanId, ent.id, ent.user_id, p.iat]
  );

  let activated = false;
  if (!ent.activated_at && ent.plan !== 'founding') {
    const ends = endsAtAfterActivation(ent.plan, now);
    const upd = await q(
      `UPDATE entitlements SET activated_at=$2, starts_at=$2, ends_at=$3
       WHERE id=$1 AND activated_at IS NULL
       RETURNING ${SEL_ENT}`,
      [ent.id, now, ends]
    );
    activated = !!upd.rows[0];
  }

  res.json({
    ok: true,
    door: 'open',
    activated,
    duplicate: !ins.rows[0],
    access: await memberAccessFor(ent.user_id, now),
  });
}));

// 公開唯讀：進度、專案更新、報名中活動、首頁公告（無 PII，供未登入者瀏覽）
app.get('/api/public', requireDb, wrap(async (req, res) => {
  const raised = Number((await q(`SELECT COALESCE(SUM(amount),0)::bigint AS s FROM commitments WHERE payment_status='已付款'`)).rows[0].s);
  const updates = numify((await q(`SELECT ${SEL_UPD} FROM updates ORDER BY published_at DESC`)).rows);
  const events = (await q(
    `SELECT ${SEL_EVENT}, (SELECT COUNT(*)::int FROM event_regs r WHERE r.event_id=e.id) AS reg_count
     FROM events e WHERE status='報名中' ORDER BY starts_at ASC NULLS LAST`)).rows;
  const content = await readContent();
  res.json({ raised, updates, events, content });
}));

app.post('/api/commitments', auth, requireDb, wrap(async (req, res) => {
  if (!req.auth.sub) return res.status(403).json({ error: '後台無法以參與者身分送出。' });
  const b = req.body || {};
  const amount = Number(b.amount || 0);
  const term = Number(b.term || 0);
  if (amount !== PRICE) return res.status(400).json({ error: '創始會費為固定 NT$35,000。' });
  if (!(term >= MIN_TERM && term <= MAX_TERM)) return res.status(400).json({ error: '會籍期間為固定 18 個月。' });
  if (!b.name || !b.email || !b.phone)
    return res.status(400).json({ error: '請填寫姓名、電話與 Email。' });

  // 名額上限：受邀制、限量 100 名、售罄不補
  const agg = (await q(`SELECT COALESCE(SUM(amount),0)::bigint AS s, COUNT(DISTINCT user_id)::int AS p FROM commitments`)).rows[0];
  const isExisting = (await q(`SELECT 1 FROM commitments WHERE user_id=$1 LIMIT 1`, [req.auth.sub])).rowCount > 0;
  if (!isExisting && agg.p >= MAX_PARTICIPANTS)
    return res.status(400).json({ error: '創始名額已滿（限量 100 名，售罄不補），請與發起方聯繫。' });
  if (Number(agg.s) + amount > TARGET)
    return res.status(400).json({ error: '創始名額已售罄，請與發起方聯繫。' });

  await q(`UPDATE users SET name=$2,email=$3,phone=$4,status='已參與' WHERE id=$1`,
    [req.auth.sub, b.name, b.email, b.phone]);

  const seq = (await q(`SELECT COUNT(*)::int AS n FROM commitments`)).rows[0].n + 1;
  const id = uid('c_');
  // 會籍起訖：以正式開幕日 2026-11-01 起算 18 個月；若開幕延後，依實際開幕日調整
  const start = '2026-11-01';
  const maturity = addMonthsISO(start, term);
  await q(
    `INSERT INTO commitments
       (id,user_id,amount,interest_rate,term_years,start_date,maturity_date,contract_status,payment_status,membership_status,cert_no,created_at)
     VALUES ($1,$2,$3,0,$4,$5,$6,'已簽','未付款',$7,$8,now())`,
    [id, req.auth.sub, amount, term, start, maturity, b.agree_member ? '待啟用' : '未啟用', certNo(seq)]);

  const row = numify((await q(`SELECT ${SEL_C} FROM commitments WHERE id=$1`, [id])).rows)[0];
  res.json({ commitment: row });
}));

/* ---- 超管：指派／取消其他管理員（以 user id；對象需已於系統有帳號，通常先以 Google 登入過） ---- */
app.post('/api/admin/users/:id/admin', auth, adminOnly, superOnly, requireDb, wrap(async (req, res) => {
  const makeAdmin = req.body.admin === true;
  const r = await q(`UPDATE users SET is_admin=$2 WHERE id=$1 RETURNING id,email`, [req.params.id, makeAdmin]);
  if (!r.rows[0]) return res.status(404).json({ error: '找不到使用者。' });
  res.json({ ok: true, id: r.rows[0].id, is_admin: makeAdmin });
}));

app.post('/api/admin/commitments/:id/confirm', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `UPDATE commitments SET payment_status='已付款', membership_status='已啟用' WHERE id=$1 RETURNING user_id`,
      [req.params.id]
    );
    if (!r.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '找不到參與紀錄。' });
    }
    await client.query(`UPDATE users SET status='已參與' WHERE id=$1`, [r.rows[0].user_id]);
    const c = (await client.query(`SELECT ${SEL_C} FROM commitments WHERE id=$1`, [req.params.id])).rows[0];
    // ensureFoundingEntitlement 用全域 q；此處先 commit 後再呼叫會失去交易——改為交易外既有函式 + gift 同連線
    await client.query('COMMIT');
    await ensureFoundingEntitlement(c);
    const gClient = await pool.connect();
    try {
      await gClient.query('BEGIN');
      await grantMembershipGift(gClient, c.user_id, 'founding', c.id);
      await gClient.query('COMMIT');
    } catch (e) {
      await gClient.query('ROLLBACK');
      throw e;
    } finally {
      gClient.release();
    }
    res.json({ ok: true });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
}));

app.post('/api/admin/entitlements', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const userId = (req.body.user_id || '').trim();
  const plan = req.body.plan;
  if (!userId || !FLOOR_PLANS.includes(plan))
    return res.status(400).json({ error: '需要 user_id 與合法 plan（day_4h／day_12h／month／quarter／year）。' });
  const u = (await q(`SELECT id FROM users WHERE id=$1`, [userId])).rows[0];
  if (!u) return res.status(404).json({ error: '找不到使用者。' });
  const id = uid('en_');
  const sourceId = req.body.source_id || id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO entitlements (id,user_id,plan,source,source_id,purchased_at)
       VALUES ($1,$2,$3,'admin',$4,now())`,
      [id, userId, plan, sourceId]
    );
    await grantMembershipGift(client, userId, plan, id);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  const row = rowToEnt((await q(`SELECT ${SEL_ENT} FROM entitlements WHERE id=$1`, [id])).rows[0]);
  res.json({ entitlement: row });
}));

/* ---- 點數：方案／餘額／購點／兌換／退款／後台發點 ---- */
app.get('/api/points/packs', (req, res) => {
  res.json({ price_twd: POINT_PRICE_TWD, packs: Object.values(PACKS) });
});

app.get('/api/me/points', auth, requireDb, wrap(async (req, res) => {
  if (!req.auth.sub) return res.status(403).json({ error: '請以會員身分登入。' });
  res.json(await pointsSummaryFor(req.auth.sub));
}));

app.post('/api/admin/points/grants', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const userId = (req.body.user_id || '').trim();
  const amount = Number(req.body.amount);
  const note = (req.body.note || '').trim();
  if (!userId || !Number.isInteger(amount) || amount < 1) {
    return res.status(400).json({ error: 'user_id 與正整數 amount 必填。' });
  }
  if (!note) return res.status(400).json({ error: '備註必填。' });
  const u = (await q(`SELECT id FROM users WHERE id=$1`, [userId])).rows[0];
  if (!u) return res.status(404).json({ error: '找不到使用者。' });
  const now = new Date();
  let expiresAt = addYears(now, 1);
  if (req.body.expires_at) {
    const d = new Date(req.body.expires_at);
    if (Number.isNaN(+d)) return res.status(400).json({ error: 'expires_at 無效。' });
    expiresAt = d;
  }
  const grantId = uid('pg_');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { lot } = await creditLot(client, {
      userId, type: 'admin', amount, expiresAt,
      sourceType: 'admin_grant', sourceId: grantId,
      reason: 'admin', actor: req.auth.sub || 'agent', note,   // agent 無會員 id，軌跡仍留名
    });
    await client.query('COMMIT');
    res.json({ lot, grant_id: grantId, note });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

app.get('/api/admin/users/:id/points', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const summary = await pointsSummaryFor(req.params.id);
  const ledger = (await q(
    `SELECT id, lot_id, delta, reason, ref_type, ref_id, actor, note, created_at
     FROM point_ledger WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`,
    [req.params.id]
  )).rows;
  const orders = (await q(
    `SELECT * FROM point_orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
    [req.params.id]
  )).rows;
  res.json({ ...summary, ledger, orders });
}));

app.post('/api/me/points/redeem', auth, requireDb, wrap(async (req, res) => {
  if (!req.auth.sub) return res.status(403).json({ error: '請以會員身分登入。' });
  const access = await memberAccessFor(req.auth.sub);
  if (!access.active) {
    return res.status(403).json({ error: '需要 active 會員才能兌換二樓服務。', code: 'not_active' });
  }
  const service = (req.body.service || '').trim();
  let hours = req.body.hours;
  if (service === 'shower') hours = 1;
  else {
    hours = Number(hours);
    if (!Number.isInteger(hours) || hours < 1) return res.status(400).json({ error: 'hours 須為正整數。' });
  }
  let points;
  try { points = redeemPointsFor(service, hours); }
  catch { return res.status(400).json({ error: '不支援的服務。' }); }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await expireLotsForUser(req.auth.sub);
    const lots = (await client.query(
      `SELECT * FROM point_lots WHERE user_id=$1 FOR UPDATE`, [req.auth.sub]
    )).rows.map(rowToLot);
    const plan = planDebit(lots, points, new Date());
    if (!plan.ok) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '點數不足。', code: plan.error });
    }
    const rid = uid('pr_');
    await client.query(
      `INSERT INTO point_redemptions (id, user_id, service, points, hours, status)
       VALUES ($1,$2,$3,$4,$5,'paid')`,
      [rid, req.auth.sub, service, points, service === 'shower' ? null : hours]
    );
    await applyDebit(client, req.auth.sub, plan.allocations, 'redeem', 'point_redemption', rid, req.auth.sub);
    await client.query('COMMIT');
    res.json({
      redemption: { id: rid, service, points, hours: service === 'shower' ? null : hours, status: 'paid' },
      balance: (await pointsSummaryFor(req.auth.sub)).balance,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.status === 409) return res.status(409).json({ error: '扣點衝突，請重試。' });
    throw e;
  } finally {
    client.release();
  }
}));

app.post('/api/me/points/orders', auth, requireDb, wrap(async (req, res) => {
  if (!req.auth.sub) return res.status(403).json({ error: '請以會員身分登入。' });
  if (!stripe) return res.status(503).json({ error: '購買功能尚未開通（未設定 Stripe）。' });
  const pack = PACKS[(req.body.pack_id || '').trim()];
  if (!pack) return res.status(400).json({ error: '未知方案。' });

  const id = uid('po_');
  await q(
    `INSERT INTO point_orders (id, user_id, pack_id, principal, bonus, pay_twd, status)
     VALUES ($1,$2,$3,$4,$5,$6,'pending')`,
    [id, req.auth.sub, pack.id, pack.principal, pack.bonus, pack.pay_twd]
  );

  const origin = SITE_BASE;
  const lang = String((req.body && req.body.lang) || 'zh').toLowerCase();
  const memberBase = lang === 'en' ? '/en/member' : lang === 'ja' ? '/ja/member' : '/member';
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'twd',
        product_data: {
          name: `言文字點數方案 ${pack.id}`,
          description: `本金 ${pack.principal} 點` + (pack.bonus ? `＋加贈 ${pack.bonus} 點（一年效期）` : '') + '・每點 NT$1',
        },
        unit_amount: pack.pay_twd * 100,
      },
      quantity: 1,
    }],
    success_url: `${origin}${memberBase}?points_paid=1&oid=${id}&s={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}${memberBase}?points_canceled=1`,
    client_reference_id: id,
    metadata: { kind: 'point_pack', point_order_id: id, user_id: req.auth.sub, pack_id: pack.id },
  });
  await q(`UPDATE point_orders SET stripe_session_id=$2 WHERE id=$1`, [id, session.id]);
  res.json({ order_id: id, url: session.url });
}));

app.post('/api/me/points/orders/:id/fulfill', auth, requireDb, wrap(async (req, res) => {
  if (!req.auth.sub) return res.status(403).json({ error: '請以會員身分登入。' });
  if (!stripe) return res.status(503).json({ error: 'Stripe 未設定。' });
  const order = (await q(`SELECT * FROM point_orders WHERE id=$1`, [req.params.id])).rows[0];
  if (!order || order.user_id !== req.auth.sub) return res.status(404).json({ error: '找不到訂單。' });
  if (order.status === 'paid') {
    return res.json({ ok: true, already: true, balance: (await pointsSummaryFor(req.auth.sub)).balance });
  }

  const sessionId = (req.body.session_id || order.stripe_session_id || '').trim();
  if (!sessionId) return res.status(400).json({ error: '缺少 session_id。' });
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== 'paid') return res.status(402).json({ error: '尚未付款。' });
  if (session.metadata?.point_order_id && session.metadata.point_order_id !== order.id) {
    return res.status(400).json({ error: 'session 與訂單不符。' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = (await client.query(`SELECT * FROM point_orders WHERE id=$1 FOR UPDATE`, [order.id])).rows[0];
    await fulfillPointOrder(client, locked);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  res.json({ ok: true, balance: (await pointsSummaryFor(req.auth.sub)).balance });
}));

app.post('/api/admin/points/orders/:id/fulfill', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const order = (await q(`SELECT * FROM point_orders WHERE id=$1`, [req.params.id])).rows[0];
  if (!order) return res.status(404).json({ error: '找不到訂單。' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = (await client.query(`SELECT * FROM point_orders WHERE id=$1 FOR UPDATE`, [order.id])).rows[0];
    const out = await fulfillPointOrder(client, locked);
    await client.query('COMMIT');
    res.json({ ok: true, already: !!out.already, balance: (await pointsSummaryFor(order.user_id)).balance });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

app.post('/api/me/points/refunds', auth, requireDb, wrap(async (req, res) => {
  if (!req.auth.sub) return res.status(403).json({ error: '請以會員身分登入。' });
  const orderId = (req.body.point_order_id || '').trim();
  const principalPoints = Number(req.body.principal_points);
  if (!orderId || !Number.isInteger(principalPoints) || principalPoints < 1) {
    return res.status(400).json({ error: 'point_order_id 與 principal_points 必填。' });
  }
  const order = (await q(`SELECT * FROM point_orders WHERE id=$1`, [orderId])).rows[0];
  if (!order || order.user_id !== req.auth.sub) return res.status(404).json({ error: '找不到訂單。' });
  if (order.status !== 'paid') return res.status(400).json({ error: '訂單未付款。' });

  const client = await pool.connect();
  let refundRow;
  try {
    await client.query('BEGIN');
    await expireLotsForUser(req.auth.sub);
    const lots = (await client.query(
      `SELECT * FROM point_lots WHERE user_id=$1 FOR UPDATE`, [req.auth.sub]
    )).rows.map(rowToLot);
    const plan = planRefund(lots, orderId, principalPoints);
    if (!plan.ok) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '無法退款。', code: plan.error });
    }
    const rid = uid('prf_');
    const bonusVoided = plan.void_bonus.reduce((s, x) => s + x.amount, 0);
    await applyDebit(client, req.auth.sub, plan.debit_principal, 'refund', 'point_refund', rid, req.auth.sub);
    for (const v of plan.void_bonus) {
      const u = await client.query(
        `UPDATE point_lots SET remaining = 0 WHERE id=$1 AND remaining=$2 RETURNING id`,
        [v.lot_id, v.amount]
      );
      if (!u.rowCount) continue;
      await client.query(
        `INSERT INTO point_ledger (id, user_id, lot_id, delta, reason, ref_type, ref_id, actor)
         VALUES ($1,$2,$3,$4,'void_bonus','point_refund',$5,$6)`,
        [uid('ldg_'), req.auth.sub, v.lot_id, -v.amount, rid, req.auth.sub]
      );
    }

    let stripeRefundId = null;
    if (stripe && order.stripe_session_id) {
      const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id, {
        expand: ['payment_intent'],
      });
      const pi = session.payment_intent;
      const piId = typeof pi === 'string' ? pi : pi && pi.id;
      if (piId) {
        const rf = await stripe.refunds.create({
          payment_intent: piId,
          amount: plan.refund_twd * 100,
        });
        stripeRefundId = rf.id;
      }
    }

    await client.query(
      `INSERT INTO point_refunds
         (id, point_order_id, user_id, principal_points, refund_twd, bonus_voided, status, stripe_refund_id)
       VALUES ($1,$2,$3,$4,$5,$6,'completed',$7)`,
      [rid, orderId, req.auth.sub, principalPoints, plan.refund_twd, bonusVoided, stripeRefundId]
    );
    await client.query('COMMIT');
    refundRow = {
      id: rid,
      principal_points: principalPoints,
      refund_twd: plan.refund_twd,
      bonus_voided: bonusVoided,
      stripe_refund_id: stripeRefundId,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.status === 409) return res.status(409).json({ error: '退款衝突，請重試。' });
    throw e;
  } finally {
    client.release();
  }
  res.json({ refund: refundRow, balance: (await pointsSummaryFor(req.auth.sub)).balance });
}));

// 帶 id＝改寫既有消息，否則新增（同 events／social posts 的 upsert 慣例）
app.post('/api/admin/updates', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const title = (req.body.title || '').trim();
  if (!title) return res.status(400).json({ error: '請輸入標題。' });
  const types = ['月報', '季報', '重大事項', '活動通知', '財務摘要'];
  const type = types.includes(req.body.type) ? req.body.type : '重大事項';
  const content = (req.body.content || '').trim();
  const date = req.body.date || todayISO();
  if (req.body.id) {
    const r = await q(`UPDATE updates SET title=$2,content=$3,type=$4,published_at=$5 WHERE id=$1 RETURNING id`,
      [req.body.id, title, content, type, date]);
    if (!r.rows[0]) return res.status(404).json({ error: '找不到最新消息。' });
    return res.json({ ok: true, id: req.body.id });
  }
  const id = uid('up_');
  await q(`INSERT INTO updates (id,title,content,type,published_at) VALUES ($1,$2,$3,$4,$5)`,
    [id, title, content, type, date]);
  res.json({ ok: true, id });
}));

app.delete('/api/admin/updates/:id', auth, adminOnly, requireDb, wrap(async (req, res) => {
  await q(`DELETE FROM updates WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
}));

/* ---- 前台管理：活動（後台建/改/刪＋看報名） ---- */
const EVENT_STATUS = ['草稿', '報名中', '已結束'];
app.post('/api/admin/events', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const b = req.body || {};
  const title = (b.title || '').trim();
  if (!title) return res.status(400).json({ error: '請輸入活動名稱。' });
  const status = EVENT_STATUS.includes(b.status) ? b.status : '報名中';
  const capacity = Math.max(0, Math.round(Number(b.capacity) || 0));
  const startsAt = b.starts_at ? new Date(b.starts_at) : null;   // ISO 'YYYY-MM-DDTHH:mm'
  if (startsAt && isNaN(startsAt.getTime())) return res.status(400).json({ error: '活動時間格式不正確。' });
  if (b.id) {
    const r = await q(`UPDATE events SET title=$2,description=$3,location=$4,starts_at=$5,capacity=$6,status=$7 WHERE id=$1 RETURNING id`,
      [b.id, title, (b.description || '').trim(), (b.location || '').trim(), startsAt, capacity, status]);
    if (!r.rows[0]) return res.status(404).json({ error: '找不到活動。' });
    return res.json({ ok: true, id: b.id });
  }
  const id = uid('e_');
  await q(`INSERT INTO events (id,title,description,location,starts_at,capacity,status) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, title, (b.description || '').trim(), (b.location || '').trim(), startsAt, capacity, status]);
  res.json({ ok: true, id });
}));

app.delete('/api/admin/events/:id', auth, adminOnly, requireDb, wrap(async (req, res) => {
  await q(`DELETE FROM events WHERE id=$1`, [req.params.id]);   // event_regs 隨 ON DELETE CASCADE 一併清除
  res.json({ ok: true });
}));

app.get('/api/admin/events/:id/regs', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const rows = (await q(
    `SELECT u.name, u.email, u.phone, r.note, to_char(r.created_at,'YYYY/MM/DD HH24:MI') AS created_at
     FROM event_regs r JOIN users u ON u.id=r.user_id
     WHERE r.event_id=$1 ORDER BY r.created_at`, [req.params.id])).rows;
  res.json({ regs: rows });
}));

/* ---- 前台管理：空間介紹圖片上傳（menu 頁四樓照片） ---- */
const UPLOAD_SPACE_DIR = path.join(__dirname, 'uploads', 'space');
fs.mkdirSync(UPLOAD_SPACE_DIR, { recursive: true });
const spaceUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_SPACE_DIR),
    filename: (req, file, cb) => cb(null, buildSafeSpaceFilename(file.originalname, file.mimetype)),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const err = assertSpaceImageFile({ mimetype: file.mimetype, size: 0 });
    cb(err ? new Error(err) : null, !err);
  },
});
app.post('/api/admin/upload/space', auth, adminOnly, (req, res) => {
  spaceUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const sizeErr = assertSpaceImageFile({ mimetype: req.file.mimetype, size: req.file.size });
    if (sizeErr) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({ error: sizeErr });
    }
    return res.json({ url: `/uploads/space/${req.file.filename}` });
  });
});

/* ---- 前台管理：網站內容（首頁公告等 key-value） ---- */
app.post('/api/admin/content', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const key = (req.body.key || '').trim();
  if (!key) return res.status(400).json({ error: '缺少內容鍵值。' });
  await q(`INSERT INTO site_content (key,value,updated_at) VALUES ($1,$2,now())
           ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
    [key, String(req.body.value ?? '')]);
  res.json({ ok: true });
}));

/* ---- 前台管理：社群經營（IG/X 貼文規劃；不串接平台 API，僅供內容管理與排程） ---- */
const SOCIAL_PLATFORMS = ['ig', 'x'];
const SOCIAL_STATUS = ['draft', 'ready', 'scheduled', 'publishing', 'published', 'error', 'archived'];
// 排程時間一律以台北時間讀寫（與部署環境時區脫鉤）
const SEL_POST = `id,platform,post_type,status,title,caption,caption_en,caption_ja,hashtags,pages,images,
  to_char(scheduled_at AT TIME ZONE 'Asia/Taipei','YYYY-MM-DD"T"HH24:MI') AS scheduled_at,
  to_char(published_at AT TIME ZONE 'Asia/Taipei','YYYY-MM-DD"T"HH24:MI') AS published_at,
  external_url,series,phase,cta,audience,metrics,notes`;
// 'YYYY-MM-DDTHH:mm'（datetime-local）→ 以台北時間解讀為絕對時刻；空值回 null、無效回 NaN Date
function parseTaipei(s) {
  if (!s) return null;
  return new Date(String(s).trim().replace(' ', 'T').slice(0, 16) + ':00+08:00');
}

app.get('/api/admin/social/posts', auth, adminOnly, requireDb, wrap(async (_req, res) => {
  const rows = (await q(`SELECT ${SEL_POST} FROM social_posts ORDER BY scheduled_at NULLS LAST, id`)).rows;
  res.json({ posts: rows });
}));

app.post('/api/admin/social/posts', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const b = req.body || {};
  const title = (b.title || '').trim();
  if (!title) return res.status(400).json({ error: '請輸入貼文標題。' });
  const platform = SOCIAL_PLATFORMS.includes(b.platform) ? b.platform : 'ig';
  const status = SOCIAL_STATUS.includes(b.status) ? b.status : 'draft';
  // 類型依平台白名單校驗（IG↔X 切換時避免殘留不合法類型）
  const TYPE_BY_PLATFORM = { ig: ['carousel', 'image'], x: ['text', 'image'] };
  const postType = TYPE_BY_PLATFORM[platform].includes(b.post_type) ? b.post_type : TYPE_BY_PLATFORM[platform][0];
  const scheduledAt = parseTaipei(b.scheduled_at);
  if (scheduledAt && isNaN(scheduledAt.getTime())) return res.status(400).json({ error: '排程時間格式不正確。' });
  const publishedAt = parseTaipei(b.published_at);
  if (publishedAt && isNaN(publishedAt.getTime())) return res.status(400).json({ error: '發布時間格式不正確。' });
  const externalUrl = (b.external_url || '').trim();
  if (externalUrl && !/^https?:\/\//i.test(externalUrl)) return res.status(400).json({ error: '連結僅接受 http(s) 網址。' });
  const pages = platform === 'x' ? [] : (Array.isArray(b.pages) ? b.pages : []);   // X 貼文不留頁面殘骸
  const images = Array.isArray(b.images) ? b.images : [];
  const metrics = (b.metrics && typeof b.metrics === 'object' && !Array.isArray(b.metrics)) ? b.metrics : {};
  const vals = [
    title, platform, postType, status, String(b.caption ?? ''), String(b.caption_en ?? ''), String(b.caption_ja ?? ''), (b.hashtags || '').trim(),
    JSON.stringify(pages), JSON.stringify(images), scheduledAt, publishedAt,
    externalUrl, (b.series || '').trim(), (b.phase || '').trim(),
    (b.cta || '').trim(), (b.audience || '').trim(), JSON.stringify(metrics), String(b.notes ?? ''),
  ];
  if (b.id) {
    const r = await q(
      `UPDATE social_posts SET title=$2,platform=$3,post_type=$4,status=$5,caption=$6,caption_en=$7,caption_ja=$8,hashtags=$9,pages=$10,images=$11,
         scheduled_at=$12,published_at=$13,external_url=$14,series=$15,phase=$16,cta=$17,audience=$18,metrics=$19,notes=$20,updated_at=now()
       WHERE id=$1 RETURNING id`, [b.id, ...vals]);
    if (!r.rows[0]) return res.status(404).json({ error: '找不到貼文。' });
    return res.json({ ok: true, id: b.id });
  }
  const id = uid('sp_');
  await q(
    `INSERT INTO social_posts (id,title,platform,post_type,status,caption,caption_en,caption_ja,hashtags,pages,images,scheduled_at,published_at,external_url,series,phase,cta,audience,metrics,notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`, [id, ...vals]);
  res.json({ ok: true, id });
}));

app.delete('/api/admin/social/posts/:id', auth, adminOnly, requireDb, wrap(async (req, res) => {
  await q(`DELETE FROM social_posts WHERE id=$1`, [req.params.id]);
  // 墓碑：刪除種子貼文要記下來，否則下次部署 seed 會復活
  if (/^sp_seed_/.test(req.params.id)) {
    const row = (await q(`SELECT value FROM site_content WHERE key='social_seed_deleted'`)).rows[0];
    let dead = [];
    try { dead = JSON.parse((row && row.value) || '[]'); } catch (_) { dead = []; }
    if (!Array.isArray(dead)) dead = [];
    if (!dead.includes(req.params.id)) dead.push(req.params.id);
    await q(`INSERT INTO site_content (key,value,updated_at) VALUES ('social_seed_deleted',$1,now())
             ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [JSON.stringify(dead)]);
  }
  res.json({ ok: true });
}));

/* ---- 前台管理：社群貼文圖片上傳 ---- */
const UPLOAD_SOCIAL_DIR = path.join(__dirname, 'uploads', 'social');
fs.mkdirSync(UPLOAD_SOCIAL_DIR, { recursive: true });
const socialUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_SOCIAL_DIR),
    filename: (req, file, cb) => cb(null, buildSafeSocialFilename(file.originalname, file.mimetype)),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const err = assertSocialImageFile({ mimetype: file.mimetype, size: 0 });
    cb(err ? new Error(err) : null, !err);
  },
});
app.post('/api/admin/upload/social', auth, adminOnly, (req, res) => {
  socialUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const sizeErr = assertSocialImageFile({ mimetype: req.file.mimetype, size: req.file.size });
    if (sizeErr) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({ error: sizeErr });
    }
    // 用戶端 MIME 可偽造：讀檔頭驗 magic bytes，內容與宣告不符即拒收
    let sniffed = null;
    try {
      const fd = fs.openSync(req.file.path, 'r');
      const head = Buffer.alloc(12);
      fs.readSync(fd, head, 0, 12, 0);
      fs.closeSync(fd);
      sniffed = sniffImageType(head);
    } catch (_) {}
    if (sniffed !== req.file.mimetype) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({ error: '檔案內容不是有效的圖片。' });
    }
    return res.json({ url: `/uploads/social/${req.file.filename}` });
  });
});

/* ---- IG 自動發佈（spec：docs/superpowers/specs/2026-08-17-ig-autopublish-design.md） ---- */
const igPublisher = require('./lib/ig-publisher');
const igDeps = () => ({ q, port: PORT, siteBase: SITE_BASE, uploadDir: UPLOAD_SOCIAL_DIR });

// 手動即發單篇（測試／補發用）；不看 scheduled_at，但仍走禁用字＋render 守門
app.post('/api/admin/social/:id/publish-ig', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const post = (await q(`SELECT * FROM social_posts WHERE id=$1`, [req.params.id])).rows[0];
  if (!post) return res.status(404).json({ error: '找不到貼文。' });
  if (post.platform !== 'ig') return res.status(400).json({ error: '僅 IG 貼文可發佈。' });
  if (post.status === 'published') return res.status(400).json({ error: '此貼文已發佈過。' });
  try {
    const r = await igPublisher.publishPost(post, igDeps());
    await q(`UPDATE social_posts SET status='published', published_at=now(), external_url=$2, images=$3, updated_at=now() WHERE id=$1`,
      [post.id, r.externalUrl, JSON.stringify(r.images)]);
    res.json({ ok: true, url: r.externalUrl, images: r.images });
  } catch (e) {
    await q(`UPDATE social_posts SET status='error', notes=left(concat('[ig-publish] ', $2::text, E'\n', notes), 2000), updated_at=now() WHERE id=$1`,
      [post.id, e.message]);
    res.status(502).json({ error: e.message });
  }
}));

// AI 補產：手動觸發（測試／立即補檔）；正常由每週日 cron 執行
const igComposer = require('./lib/ig-composer');
app.post('/api/admin/ig/compose', auth, adminOnly, requireDb, wrap(async (_req, res) => {
  try { res.json({ ok: true, made: await igComposer.composeWeek(igDeps()) }); }
  catch (e) { res.status(502).json({ error: e.message }); }
}));

// 素材庫：KK 丟素材到專案資料夾 → 上傳（既有 /api/admin/upload/social）→ 在此登記；補產器優先取用
app.post('/api/admin/ig/assets', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const url = String((req.body || {}).url || '').trim();
  const note = String((req.body || {}).note || '').trim();
  // MinIO 物件儲存 URL 或站內上傳路徑皆可；https 禁引號空白（photo 會內插 style 屬性）
  if (!/^(\/uploads\/social\/|https:\/\/[^'"\s]+$)/.test(url)) return res.status(400).json({ error: '素材 url 須為 /uploads/social/ 路徑或 https URL。' });
  if (!note) return res.status(400).json({ error: '請附素材說明（AI 產文要呼應照片內容）。' });
  const id = uid('iga_');
  await q(`INSERT INTO ig_assets (id,url,note) VALUES ($1,$2,$3)`, [id, url, note]);
  res.json({ ok: true, id });
}));

app.get('/api/admin/ig/assets', auth, adminOnly, requireDb, wrap(async (_req, res) => {
  res.json({ assets: (await q(`SELECT * FROM ig_assets ORDER BY created_at DESC LIMIT 100`)).rows });
}));

app.get('/api/admin/ig/status', auth, adminOnly, requireDb, wrap(async (_req, res) => {
  const token = await igPublisher.getToken(igDeps());
  const nextUp = (await q(`SELECT id,title,to_char(scheduled_at AT TIME ZONE 'Asia/Taipei','YYYY-MM-DD HH24:MI') AS at
    FROM social_posts WHERE platform='ig' AND status='scheduled' AND scheduled_at IS NOT NULL ORDER BY scheduled_at LIMIT 5`)).rows;
  const errors = (await q(`SELECT id,title FROM social_posts WHERE platform='ig' AND status='error' ORDER BY updated_at DESC LIMIT 5`)).rows;
  // 過期逾 24h 的排程不會自動補發（見 ig-publisher.publishDue），列出供後台改期
  const stale = (await q(`SELECT id,title,to_char(scheduled_at AT TIME ZONE 'Asia/Taipei','YYYY-MM-DD HH24:MI') AS at
    FROM social_posts WHERE platform='ig' AND status='scheduled' AND scheduled_at <= now() - interval '24 hours' ORDER BY scheduled_at`)).rows;
  res.json({
    autopublish: process.env.IG_AUTOPUBLISH === '1',
    igUserId: process.env.IG_USER_ID || 'me',
    hasToken: !!token,
    banned: igPublisher.bannedList(),
    next: nextUp, errors, stale,
  });
}));

/* ---- 會員：活動報名／取消（需登入；免費活動，額滿即擋） ---- */
app.post('/api/events/:id/register', auth, requireDb, wrap(async (req, res) => {
  if (!req.auth.sub) return res.status(403).json({ error: '請以會員身分登入後報名。' });
  const ev = (await q(`SELECT id,capacity,status FROM events WHERE id=$1`, [req.params.id])).rows[0];
  if (!ev) return res.status(404).json({ error: '找不到活動。' });
  if (ev.status !== '報名中') return res.status(400).json({ error: '此活動目前不開放報名。' });
  if (ev.capacity > 0) {
    const n = (await q(`SELECT COUNT(*)::int AS n FROM event_regs WHERE event_id=$1`, [ev.id])).rows[0].n;
    const mine = (await q(`SELECT 1 FROM event_regs WHERE event_id=$1 AND user_id=$2`, [ev.id, req.auth.sub])).rowCount > 0;
    if (!mine && n >= ev.capacity) return res.status(400).json({ error: '此活動名額已滿。' });
  }
  await q(`INSERT INTO event_regs (id,event_id,user_id,note) VALUES ($1,$2,$3,$4)
           ON CONFLICT (event_id,user_id) DO UPDATE SET note=EXCLUDED.note`,
    [uid('r_'), ev.id, req.auth.sub, (req.body.note || '').trim()]);
  res.json({ ok: true });
}));

app.delete('/api/events/:id/register', auth, requireDb, wrap(async (req, res) => {
  await q(`DELETE FROM event_regs WHERE event_id=$1 AND user_id=$2`, [req.params.id, req.auth.sub]);
  res.json({ ok: true });
}));

/* ---- Stripe Checkout（開放任何人購買，無需登入；Stripe 為訂單真相來源） ---- */
app.post('/api/checkout', wrap(async (req, res) => {
  if (!stripe) return res.status(503).json({ error: '購買功能尚未開通（未設定 Stripe）。' });
  // 不信任 Origin header（避免 open redirect）；導向目標一律用伺服器端常數，本地測試以 PUBLIC_ORIGIN 覆蓋
  const origin = SITE_BASE;
  // 結帳完成後導回購買者所在語系頁（僅允許 en/ja 前綴，其餘回中文 /fellow）
  const langPrefix = ['en', 'ja'].includes(req.body && req.body.lang) ? '/' + req.body.lang : '';
  // 會籍：自開幕日起算 18 個月（起訖明確帶入商品說明與 metadata）
  const end = addMonthsISO(addMonthsISO(MEMBERSHIP_START, MAX_TERM), 0);
  const endMinus1 = (() => { const d = new Date(end + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'twd',
        product_data: {
          name: '言文字創始會員',
          description: `18 個月會籍（${MEMBERSHIP_START} 起算至 ${endMinus1}）＋贈點 20,000（一年效期）・限量 100 名`,
        },
        unit_amount: PRICE * 100, // TWD 為 2 位小數幣別：NT$35,000 → 3,500,000
      },
      quantity: 1,
    }],
    success_url: `${origin}${langPrefix}/fellow?paid=1&s={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}${langPrefix}/fellow?canceled=1`,
    billing_address_collection: 'required',
    phone_number_collection: { enabled: true },
    metadata: { plan: 'founding-member', term_months: String(MAX_TERM), start_date: MEMBERSHIP_START, end_date: endMinus1 },
  });
  res.json({ url: session.url });
  // ponytail: 未在後端硬性擋「限量 100」——上線初期以 Stripe 後台人工控管即可。
  // 需嚴格庫存時，升級路徑：加 webhook（whsec_）累計已付款數，達 100 即回 409。
}));

/* ---- 前端靜態檔（官網掛 /、fellow 一頁式掛 /fellow；伺服器源碼不外露） ---- */
const PUB = path.join(__dirname, 'public');
// 各計畫一頁式：fellow／partner／startup × 中/en/ja。
// 精確路由先於 static，讓無斜線路徑（/partner、/en/startup…）直接回 200 不轉址；
// 資產（styles/app/kk）皆共用 /fellow/*，各語系計畫頁以絕對路徑引用。
// HTML 經 layout 組裝 header／footer（SEO／GEO：回應已含完整 markup）。
const PROGRAMS = ['fellow', 'partner', 'startup'];
for (const prog of PROGRAMS) {
  for (const pre of ['', 'en', 'ja']) {
    const parts = pre ? [pre, prog] : [prog];
    const route = '/' + parts.join('/');
    const file = path.join(PUB, ...parts, 'index.html');
    app.get(route, (req, res) => sendPage(res, file, req.path));
  }
}
// CIS 品牌識別頁（中/en/ja）；無斜線路徑直接 200
for (const pre of ['', 'en', 'ja']) {
  const parts = pre ? [pre, 'cis'] : ['cis'];
  const route = '/' + parts.join('/');
  const file = path.join(PUB, ...parts, 'index.html');
  app.get(route, (req, res) => sendPage(res, file, req.path));
}
app.get('/', (req, res) => sendPage(res, path.join(PUB, 'index.html'), '/'));
// /menu 舊頁改版為空間介紹：301 導至 /space（保留語系前綴），需先於 static 攔截
function menuToSpace(req, res) {
  const lang = req.path.startsWith('/en/') ? 'en' : req.path.startsWith('/ja/') ? 'ja' : 'zh';
  const base = lang === 'zh' ? '/space' : `/${lang}/space`;
  res.redirect(301, `${base}#menu`);
}
app.get(['/menu', '/menu/', '/en/menu', '/en/menu/', '/ja/menu', '/ja/menu/'], menuToSpace);
// 含 <!--SITE_HEADER--> 的 HTML（member、menu、語系首頁…）在 static 前組裝
app.use(layoutMiddleware(PUB));
app.use('/fellow', express.static(path.join(PUB, 'fellow'), { extensions: ['html'] }));
// 空間介紹圖片上傳檔（管理後台上傳，需先於 static 掛載）
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff'),   // 上傳目錄防內容嗅探
}));
// 靜態官網（無標記 HTML／資產）
app.use(express.static(PUB, { extensions: ['html'] }));

/* ---------- 啟動 ---------- */
async function boot() {
  if (pool) {
    try { await migrate(); dbReady = true; console.log('[db] 連線並完成 migrate'); }
    catch (e) { console.error('[db] migrate 失敗（前端仍會運作，API 回 503）：', e.message); }
  } else {
    console.warn('[db] 未設定 DATABASE_URL / POSTGRES_*，API 將回 503；請於 Zeabur 設定資料庫連線。');
  }
  app.listen(PORT, () => console.log(`[server] listening on ${PORT}`));

  // IG 自動發佈 cron：env IG_AUTOPUBLISH=1 才啟用（本機開發預設不跑，避免誤發）
  if (process.env.IG_AUTOPUBLISH === '1' && dbReady) {
    const cron = require('node-cron');
    cron.schedule('*/5 * * * *', () => igPublisher.publishDue(igDeps())
      .catch(e => console.error('[ig-publish] cron 失敗：', e.message)));
    // 長期 token 60 天效期，每日續期一次（台北 04:10 離峰）
    cron.schedule('10 4 * * *', () => igPublisher.refreshToken(igDeps())
      .then(sec => sec && console.log(`[ig-publish] token 已續期，效期 ${Math.round(sec / 86400)} 天`))
      .catch(e => console.error('[ig-publish] token 續期失敗：', e.message)), { timezone: 'Asia/Taipei' });
    // AI 補產：每週日 20:00 檢查未來 7 天排程，不足補滿（需 ANTHROPIC_API_KEY）
    cron.schedule('0 20 * * 0', () => igComposer.composeWeek(igDeps())
      .catch(e => console.error('[ig-compose] cron 失敗：', e.message)), { timezone: 'Asia/Taipei' });
    console.log('[ig-publish] 自動發佈已啟用（每 5 分掃描；週日 20:00 AI 補產）');
  } else {
    console.log('[ig-publish] 自動發佈未啟用（IG_AUTOPUBLISH!=1 或無資料庫）');
  }
}
boot();
