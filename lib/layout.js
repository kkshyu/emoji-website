'use strict';
/**
 * 全站 header／footer 組裝：讀 partial、依路徑填語系與 aria-current，替換頁面標記。
 * 標記：<!--SITE_HEADER--> <!--SITE_FOOTER-->
 */
const fs = require('fs');
const path = require('path');

const PARTIALS_DIR = path.join(__dirname, '..', 'views', 'partials');
const MARKER_HEADER = '<!--SITE_HEADER-->';
const MARKER_FOOTER = '<!--SITE_FOOTER-->';
const CURRENT = ' aria-current="page"';

const TRAILING_SLASH = new Set(['cis']);
const PROGRAMS = new Set(['fellow', 'partner', 'startup']);

let cache = null;

function loadPartials() {
  const out = {};
  for (const lang of ['zh', 'en', 'ja']) {
    out[lang] = {
      header: fs.readFileSync(path.join(PARTIALS_DIR, `header-${lang}.html`), 'utf8'),
      footer: fs.readFileSync(path.join(PARTIALS_DIR, `footer-${lang}.html`), 'utf8'),
    };
  }
  return out;
}

function getPartials() {
  if (process.env.NODE_ENV !== 'production') return loadPartials();
  if (!cache) cache = loadPartials();
  return cache;
}

/** @returns {{ lang: 'zh'|'en'|'ja', slug: string, zh: string, en: string, ja: string }} */
function localePaths(reqPath) {
  let p = String(reqPath || '/').split('?')[0];
  if (p.length > 1) p = p.replace(/\/+$/, '');
  if (!p) p = '/';

  let lang = 'zh';
  let rest = p;
  if (p === '/en' || p.startsWith('/en/')) {
    lang = 'en';
    rest = p.slice(3) || '/';
  } else if (p === '/ja' || p.startsWith('/ja/')) {
    lang = 'ja';
    rest = p.slice(3) || '/';
  }
  if (!rest.startsWith('/')) rest = '/' + rest;
  if (rest.length > 1) rest = rest.replace(/\/+$/, '');
  const slug = rest === '/' ? '' : rest.replace(/^\//, '');

  // space.html → slug space（與 /space 一致）
  const normSlug =
    slug === 'space.html' ? 'space'
    : slug === 'member.html' ? 'member'
    : slug === 'system.html' ? 'system'
    : slug === 'about.html' ? 'about'
    : slug;

  const pathFor = (L, s) => {
    if (!s) return L === 'zh' ? '/' : `/${L}/`;
    const slash = TRAILING_SLASH.has(s) ? '/' : '';
    return L === 'zh' ? `/${s}${slash}` : `/${L}/${s}${slash}`;
  };

  if (normSlug === 'space' || normSlug === 'menu' || normSlug === 'member' || normSlug === 'system' || normSlug === 'about') {
    return {
      lang,
      slug: normSlug,
      zh: pathFor('zh', normSlug),
      en: pathFor('en', normSlug),
      ja: pathFor('ja', normSlug),
    };
  }

  return {
    lang,
    slug,
    zh: pathFor('zh', slug),
    en: pathFor('en', slug),
    ja: pathFor('ja', slug),
  };
}

function fill(tpl, vars) {
  let out = tpl;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v);
  }
  return out;
}

function composeLayout(html, reqPath) {
  if (!html || (!html.includes(MARKER_HEADER) && !html.includes(MARKER_FOOTER))) {
    return html;
  }
  const meta = localePaths(reqPath);
  const partials = getPartials();
  const pack = partials[meta.lang] || partials.zh;

  const vars = {
    LANG_ZH: meta.zh,
    LANG_EN: meta.en,
    LANG_JA: meta.ja,
    LANG_ZH_CURRENT: meta.lang === 'zh' ? CURRENT : '',
    LANG_EN_CURRENT: meta.lang === 'en' ? CURRENT : '',
    LANG_JA_CURRENT: meta.lang === 'ja' ? CURRENT : '',
    NAV_FELLOW_CURRENT: meta.slug === 'fellow' ? CURRENT : '',
    NAV_PARTNER_CURRENT: meta.slug === 'partner' ? CURRENT : '',
    NAV_STARTUP_CURRENT: meta.slug === 'startup' ? CURRENT : '',
    NAV_SPACE_CURRENT: meta.slug === 'space' ? CURRENT : '',
    NAV_CIS_CURRENT: meta.slug === 'cis' ? CURRENT : '',
    NAV_MEMBER_CURRENT: meta.slug === 'member' ? CURRENT : '',
    NAV_SYSTEM_CURRENT: meta.slug === 'system' ? CURRENT : '',
    NAV_ABOUT_CURRENT: meta.slug === 'about' ? CURRENT : '',
    NAV_EVENTS_CURRENT: meta.slug === 'events' || meta.slug.startsWith('events/') ? CURRENT : '',
  };

  let out = html;
  if (out.includes(MARKER_HEADER)) {
    out = out.split(MARKER_HEADER).join(fill(pack.header, vars));
  }
  if (out.includes(MARKER_FOOTER)) {
    out = out.split(MARKER_FOOTER).join(fill(pack.footer, vars));
  }
  return out;
}

function hasLayoutMarkers(html) {
  return html.includes(MARKER_HEADER) || html.includes(MARKER_FOOTER);
}

/**
 * 將 URL pathname 對應到 public/ 下的 HTML 檔（若存在）。
 * @param {string} pubRoot absolute path to public/
 * @param {string} reqPath
 * @returns {string|null} absolute file path
 */
function resolvePublicHtml(pubRoot, reqPath) {
  let p = String(reqPath || '/').split('?')[0];
  if (p.length > 1) p = p.replace(/\/+$/, '');
  if (!p) p = '/';

  const candidates = [];
  if (p === '/') {
    candidates.push(path.join(pubRoot, 'index.html'));
  } else if (/\.html?$/i.test(p)) {
    candidates.push(path.join(pubRoot, p.replace(/^\//, '')));
  } else {
    const rel = p.replace(/^\//, '');
    candidates.push(path.join(pubRoot, rel + '.html'));
    candidates.push(path.join(pubRoot, rel, 'index.html'));
  }

  for (const abs of candidates) {
    try {
      if (fs.statSync(abs).isFile()) return abs;
    } catch { /* miss */ }
  }
  return null;
}

function sendPage(res, absPath, reqPath) {
  const raw = fs.readFileSync(absPath, 'utf8');
  const html = composeLayout(raw, reqPath);
  res.type('html').send(html);
}

/** Express middleware：若路徑對應含標記的 HTML，組裝後送出；否則 next()。 */
function layoutMiddleware(pubRoot) {
  return function layoutMw(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    // 略過 API 與明顯靜態副檔名
    if (req.path.startsWith('/api')) return next();
    if (/\.[a-z0-9]+$/i.test(req.path) && !/\.html?$/i.test(req.path)) return next();

    const abs = resolvePublicHtml(pubRoot, req.path);
    if (!abs) return next();
    let raw;
    try { raw = fs.readFileSync(abs, 'utf8'); } catch { return next(); }
    if (!hasLayoutMarkers(raw)) return next();
    res.type('html').send(composeLayout(raw, req.path));
  };
}

module.exports = {
  composeLayout,
  localePaths,
  sendPage,
  layoutMiddleware,
  resolvePublicHtml,
  hasLayoutMarkers,
  MARKER_HEADER,
  MARKER_FOOTER,
  PROGRAMS,
};
