/* =========================================================================
   言文字——台灣人才聚落・創始會員計畫 — backend
   Express 同時提供前端靜態檔與 /api REST API；資料存 Postgres。
   開機自動建表 + （可選）種子；DB 未設定時優雅降級（API 回 503，前端照常）。
   ========================================================================= */
'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { Pool } = require('pg');
const Stripe = require('stripe');

const PORT = process.env.PORT || 8080;
const PRICE = 35000;                    // 創始會費（固定）
const TARGET = 3500000;                 // 預收會費總額（100 名 × NT$35,000）
const MIN_TERM = 18, MAX_TERM = 18;     // 會籍期間固定 18 個月（term 以月計）
const ADMIN_CODE = process.env.ADMIN_CODE || 'KK-ADMIN';
const SECRET = process.env.APP_SECRET || 'dev-insecure-secret-change-me';
// 受邀制會籍預售：限定特定受邀者、名額上限 100 名，售罄不補
const MAX_PARTICIPANTS = Number(process.env.MAX_PARTICIPANTS || 100);
// 個資加密金鑰（身分證字號等敏感欄位 at-rest 加密）；建議獨立設 PII_KEY，預設沿用 APP_SECRET 衍生
const PII_KEY = require('crypto').createHash('sha256').update(process.env.PII_KEY || SECRET).digest();

if (SECRET === 'dev-insecure-secret-change-me') console.warn('[warn] APP_SECRET 未設定，使用不安全的預設值，請於 Zeabur 設定 APP_SECRET。');
if (ADMIN_CODE === 'KK-ADMIN') console.warn('[warn] ADMIN_CODE 使用預設值 KK-ADMIN，請於 Zeabur 設定更安全的後台代碼。');

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
const DEFAULT_MEMBER_URL = (process.env.MEMBER_URL || WEB_ORIGINS[0] + '/member.html');
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
`;

function genPayments(c) {
  // 創始會員計畫：單筆會費收款（一次付清，應收日為申請日，供後台收款對帳）
  return [{ id: uid('p_'), commitment_id: c.id, type: '會費', amount: c.amount,
    due_date: todayISO(), paid_date: null, status: '未付' }];
}

async function migrate() {
  await q(SCHEMA_SQL);
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
}

async function seedBond() {
  await q(
    `INSERT INTO bonds (id,project_name,target_amount,interest_rate,min_term,max_term,status,progress)
     VALUES ('b1','Taiwan Talent Hub',$1,0,$2,$3,'預售中',42) ON CONFLICT (id) DO NOTHING`,
    [TARGET, MIN_TERM, MAX_TERM]
  );
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
const SEL_USER = `id,name,email,phone,invite_code,id_no,address,bank,status,can_view,to_char(created_at,'YYYY/MM/DD') AS created_at`;
const SEL_C = `id,user_id,amount::bigint,interest_rate,term_years,
  to_char(start_date,'YYYY/MM/DD') AS start_date,
  to_char(maturity_date,'YYYY/MM/DD') AS maturity_date,
  contract_status,payment_status,membership_status,cert_no`;
const SEL_P = `id,commitment_id,type,amount::bigint,
  to_char(due_date,'YYYY/MM/DD') AS due_date,
  to_char(paid_date,'YYYY/MM/DD') AS paid_date,status`;
const SEL_UPD = `id,title,content,type,to_char(published_at,'YYYY/MM/DD') AS published_at`;
const numify = rows => rows.map(r => ({ ...r, amount: r.amount != null ? Number(r.amount) : r.amount }));

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
  const p = verifyToken(t);
  if (!p) return res.status(401).json({ error: '請先登入。' });
  req.auth = p; next();
}
function adminOnly(req, res, next) {
  if (req.auth.role !== 'admin') return res.status(403).json({ error: '需要後台權限。' });
  next();
}
const wrap = fn => (req, res) => fn(req, res).catch(e => {
  console.error('[api error]', e.message);
  res.status(500).json({ error: '伺服器處理失敗。' });
});

/* ---- 登入速率限制（防邀請碼暴力嘗試） ---- */
const hits = new Map();
function rateLimit(req, res, next) {
  const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
  const now = Date.now(), win = 5 * 60 * 1000, max = 30;
  const arr = (hits.get(ip) || []).filter(t => now - t < win);
  if (arr.length >= max) return res.status(429).json({ error: '嘗試次數過多，請稍後再試。' });
  arr.push(now); hits.set(ip, arr); next();
}

app.get('/api/health', (req, res) =>
  res.json({ ok: true, db: dbReady, dbConfigured: !!pool }));

app.post('/api/login', rateLimit, requireDb, wrap(async (req, res) => {
  const code = (req.body.code || '').trim();
  if (!code) return res.status(400).json({ error: '請輸入邀請碼或 Email。' });
  if (code.toUpperCase() === ADMIN_CODE.toUpperCase())
    return res.json({ token: signToken({ role: 'admin', sub: null }), role: 'admin' });

  const lv = code.toLowerCase();
  // 安全：登入僅接受「不可猜測的邀請碼」。email 屬可知資訊，不能當憑證
  // （否則知道受邀者 email 即可冒名登入、讀取其會籍與個資）。
  // 官網會員專區的 email 登入改走 Google OAuth，由 Google 驗證信箱擁有權。
  const { rows } = await q(
    `SELECT ${SEL_USER} FROM users WHERE lower(invite_code)=$1 LIMIT 1`, [lv]);
  const u = rows[0];
  if (!u) return res.status(401).json({ error: '查無此邀請碼。本網站僅供受邀對象查看。' });
  if (u.status === '未開啟') await q(`UPDATE users SET status='已查看' WHERE id=$1`, [u.id]);
  const cc = await q(`SELECT COUNT(*)::int AS n FROM commitments WHERE user_id=$1`, [u.id]);
  const role = cc.rows[0].n > 0 ? 'participant' : 'invited';
  res.json({ token: signToken({ role, sub: u.id }), role });
}));

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
  let u = (await q(`SELECT id FROM users WHERE lower(email)=$1 LIMIT 1`, [email])).rows[0];
  if (!u) {
    const id = uid('u_');
    await q(`INSERT INTO users (id,name,email,status,created_at) VALUES ($1,$2,$3,'已查看',now())`,
      [id, info.name || info.email, info.email]);
    u = { id };
  } else if (info.name) {
    await q(`UPDATE users SET name=$2 WHERE id=$1 AND (name IS NULL OR name='')`, [u.id, info.name]);
  }
  const n = (await q(`SELECT COUNT(*)::int AS n FROM commitments WHERE user_id=$1`, [u.id])).rows[0].n;
  const token = signToken({ role: n > 0 ? 'participant' : 'invited', sub: u.id });
  // token 以 URL fragment 帶回官網（不進伺服器存取記錄）；官網讀取後即從網址移除
  const sep = redirect.includes('#') ? '&' : '#';
  res.redirect(redirect + sep + 'token=' + encodeURIComponent(token));
}));

app.get('/api/state', auth, requireDb, wrap(async (req, res) => {
  const bondRow = (await q(`SELECT id,project_name,target_amount::bigint,interest_rate,min_term,max_term,status,progress FROM bonds WHERE id='b1'`)).rows[0]
    || { target_amount: TARGET, interest_rate: 0, status: '預售中', progress: 42 };
  const raised = Number((await q(`SELECT COALESCE(SUM(amount),0)::bigint AS s FROM commitments WHERE payment_status='已付款'`)).rows[0].s);
  const bond = {
    target_amount: Number(bondRow.target_amount), interest_rate: Number(bondRow.interest_rate),
    status: bondRow.status, progress: bondRow.progress, raised,
  };
  const updates = numify((await q(`SELECT ${SEL_UPD} FROM updates ORDER BY published_at DESC`)).rows);

  if (req.auth.role === 'admin') {
    const users = (await q(`SELECT ${SEL_USER} FROM users ORDER BY created_at`)).rows.map(pubUser);
    const commitments = numify((await q(`SELECT ${SEL_C} FROM commitments ORDER BY created_at`)).rows);
    const payments = numify((await q(`SELECT ${SEL_P} FROM payments`)).rows);
    return res.json({ role: 'admin', me: null, bond, users, commitments, payments, updates });
  }
  const me = pubUser((await q(`SELECT ${SEL_USER} FROM users WHERE id=$1`, [req.auth.sub])).rows[0]);
  if (!me) return res.status(401).json({ error: '帳號不存在，請重新登入。' });
  const commitments = numify((await q(`SELECT ${SEL_C} FROM commitments WHERE user_id=$1 ORDER BY created_at`, [me.id])).rows);
  const ids = commitments.map(c => c.id);
  const payments = ids.length
    ? numify((await q(`SELECT ${SEL_P} FROM payments WHERE commitment_id = ANY($1)`, [ids])).rows) : [];
  res.json({ role: commitments.length ? 'participant' : 'invited', me, bond, users: [me], commitments, payments, updates });
}));

// 公開唯讀：進度與專案更新（無 PII，供未登入者瀏覽）
app.get('/api/public', requireDb, wrap(async (req, res) => {
  const raised = Number((await q(`SELECT COALESCE(SUM(amount),0)::bigint AS s FROM commitments WHERE payment_status='已付款'`)).rows[0].s);
  const updates = numify((await q(`SELECT ${SEL_UPD} FROM updates ORDER BY published_at DESC`)).rows);
  res.json({ raised, updates });
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
  const c = { id, term_years: term, amount, start_date: start };
  for (const p of genPayments(c))
    await q(`INSERT INTO payments (id,commitment_id,type,amount,due_date,paid_date,status) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [p.id, p.commitment_id, p.type, p.amount, p.due_date, p.paid_date, p.status]);

  const row = numify((await q(`SELECT ${SEL_C} FROM commitments WHERE id=$1`, [id])).rows)[0];
  res.json({ commitment: row });
}));

app.post('/api/admin/invites', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: '請輸入姓名。' });
  const code = 'TTH-' + crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
  const id = uid('u_');
  await q(`INSERT INTO users (id,name,email,phone,invite_code,status,created_at)
           VALUES ($1,$2,$3,$4,$5,'未開啟',now())`,
    [id, name, (req.body.email || '').trim(), (req.body.phone || '').trim(), code]);
  res.json({ ok: true, invite_code: code });
}));

app.post('/api/admin/commitments/:id/confirm', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const r = await q(`UPDATE commitments SET payment_status='已付款', membership_status='已啟用' WHERE id=$1 RETURNING user_id`, [req.params.id]);
  if (!r.rows[0]) return res.status(404).json({ error: '找不到參與紀錄。' });
  await q(`UPDATE users SET status='已參與' WHERE id=$1`, [r.rows[0].user_id]);
  res.json({ ok: true });
}));

app.post('/api/admin/payments/:id/toggle', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const cur = (await q(`SELECT status FROM payments WHERE id=$1`, [req.params.id])).rows[0];
  if (!cur) return res.status(404).json({ error: '找不到付款紀錄。' });
  if (cur.status === '已付') await q(`UPDATE payments SET status='未付', paid_date=NULL WHERE id=$1`, [req.params.id]);
  else await q(`UPDATE payments SET status='已付', paid_date=$2 WHERE id=$1`, [req.params.id, todayISO()]);
  res.json({ ok: true });
}));

app.post('/api/admin/bond', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const p = Math.round(Number(req.body.progress));
  if (!Number.isFinite(p) || p < 0 || p > 100) return res.status(400).json({ error: '進度需為 0–100 的數字。' });
  await q(`UPDATE bonds SET progress=$1 WHERE id='b1'`, [p]);
  res.json({ ok: true });
}));

app.post('/api/admin/updates', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const title = (req.body.title || '').trim();
  if (!title) return res.status(400).json({ error: '請輸入標題。' });
  const types = ['月報', '季報', '重大事項', '活動通知', '財務摘要'];
  const type = types.includes(req.body.type) ? req.body.type : '重大事項';
  await q(`INSERT INTO updates (id,title,content,type,published_at) VALUES ($1,$2,$3,$4,$5)`,
    [uid('up_'), title, (req.body.content || '').trim(), type, req.body.date || todayISO()]);
  res.json({ ok: true });
}));

app.delete('/api/admin/updates/:id', auth, adminOnly, requireDb, wrap(async (req, res) => {
  await q(`DELETE FROM updates WHERE id=$1`, [req.params.id]);
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
          description: `18 個月會籍（${MEMBERSHIP_START} 起算至 ${endMinus1}）＋200 小時休憩額度・限量 100 名`,
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
const PROGRAMS = ['fellow', 'partner', 'startup'];
for (const prog of PROGRAMS) {
  for (const pre of ['', 'en', 'ja']) {
    const parts = pre ? [pre, prog] : [prog];
    app.get('/' + parts.join('/'), (req, res) => res.sendFile(path.join(PUB, ...parts, 'index.html')));
  }
}
app.use('/fellow', express.static(path.join(PUB, 'fellow'), { extensions: ['html'] }));
// 靜態官網
app.use(express.static(PUB, { extensions: ['html'] }));
app.get('/', (req, res) => res.sendFile(path.join(PUB, 'index.html')));

/* ---------- 啟動 ---------- */
async function boot() {
  if (pool) {
    try { await migrate(); dbReady = true; console.log('[db] 連線並完成 migrate'); }
    catch (e) { console.error('[db] migrate 失敗（前端仍會運作，API 回 503）：', e.message); }
  } else {
    console.warn('[db] 未設定 DATABASE_URL / POSTGRES_*，API 將回 503；請於 Zeabur 設定資料庫連線。');
  }
  app.listen(PORT, () => console.log(`[server] listening on ${PORT}`));
}
boot();
