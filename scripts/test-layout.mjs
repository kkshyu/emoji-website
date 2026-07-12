// scripts/test-layout.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  composeLayout, localePaths, resolvePublicHtml, MARKER_HEADER, MARKER_FOOTER,
} = require('../lib/layout.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(__dirname, '..', 'public');

test('localePaths maps home locales', () => {
  assert.deepEqual(localePaths('/'), { lang: 'zh', slug: '', zh: '/', en: '/en/', ja: '/ja/' });
  assert.equal(localePaths('/en/').lang, 'en');
  assert.equal(localePaths('/en').zh, '/');
  assert.equal(localePaths('/ja/fellow').ja, '/ja/fellow');
});

test('localePaths maps programs and cis slash', () => {
  assert.equal(localePaths('/fellow').slug, 'fellow');
  assert.equal(localePaths('/en/partner').en, '/en/partner');
  assert.equal(localePaths('/cis').zh, '/cis/');
  assert.equal(localePaths('/en/cis/').en, '/en/cis/');
});

test('localePaths maps about locales', () => {
  assert.equal(localePaths('/about').slug, 'about');
  assert.equal(localePaths('/about').zh, '/about');
  assert.equal(localePaths('/en/about').en, '/en/about');
  assert.equal(localePaths('/ja/about').ja, '/ja/about');
  assert.equal(localePaths('/about.html').slug, 'about');
});

test('header and footer link to /about not /#about', () => {
  for (const lang of ['zh', 'en', 'ja']) {
    const h = fs.readFileSync(path.join(__dirname, '..', 'views', 'partials', `header-${lang}.html`), 'utf8');
    const f = fs.readFileSync(path.join(__dirname, '..', 'views', 'partials', `footer-${lang}.html`), 'utf8');
    assert.doesNotMatch(h, /\/#about/);
    assert.doesNotMatch(f, /\/#about/);
    assert.match(h, /NAV_ABOUT_CURRENT/);
    if (lang === 'zh') {
      assert.match(h, /href="\/about"/);
      assert.match(f, /href="\/about"/);
    } else {
      assert.match(h, new RegExp(`href="/${lang}/about"`));
      assert.match(f, new RegExp(`href="/${lang}/about"`));
    }
  }
});

test('composeLayout about page marks about current', () => {
  const raw = `<!doctype html><body>${MARKER_HEADER}<main></main>${MARKER_FOOTER}</body>`;
  const html = composeLayout(raw, '/about');
  assert.match(html, /href="\/about"[^>]*aria-current="page"/);
  assert.doesNotMatch(html, /href="\/#about"/);
});

test('localePaths maps member menu and space locales', () => {
  const m = localePaths('/member');
  assert.equal(m.lang, 'zh');
  assert.equal(m.zh, '/member');
  assert.equal(m.en, '/en/member');
  assert.equal(m.ja, '/ja/member');
  assert.equal(localePaths('/en/member').lang, 'en');
  assert.equal(localePaths('/en/member').en, '/en/member');
  assert.equal(localePaths('/ja/member').ja, '/ja/member');
  assert.equal(localePaths('/menu/').zh, '/menu');
  assert.equal(localePaths('/menu').en, '/en/menu');
  assert.equal(localePaths('/en/menu/').en, '/en/menu');
  assert.equal(localePaths('/ja/menu/').ja, '/ja/menu');
  assert.equal(localePaths('/space').slug, 'space');
  assert.equal(localePaths('/space').zh, '/space');
  assert.equal(localePaths('/en/space').en, '/en/space');
  assert.equal(localePaths('/ja/space').ja, '/ja/space');
  assert.equal(localePaths('/space.html').slug, 'space');
});

test('localePaths maps system locales', () => {
  assert.equal(localePaths('/system').slug, 'system');
  assert.equal(localePaths('/system').zh, '/system');
  assert.equal(localePaths('/en/system').en, '/en/system');
  assert.equal(localePaths('/ja/system').ja, '/ja/system');
  assert.equal(localePaths('/system.html').slug, 'system');
});

test('composeLayout system page marks system current', () => {
  const raw = `<!doctype html><body>${MARKER_HEADER}<main></main>${MARKER_FOOTER}</body>`;
  const html = composeLayout(raw, '/system');
  assert.match(html, /href="\/system"[^>]*aria-current="page"/);
});

test('composeLayout injects header and footer with aria-current', () => {
  const raw = `<!doctype html><body>${MARKER_HEADER}<main></main>${MARKER_FOOTER}</body>`;
  const html = composeLayout(raw, '/en/fellow');
  assert.match(html, /class="site-nav"/);
  assert.match(html, /class="site-foot"/);
  assert.doesNotMatch(html, /SITE_HEADER/);
  assert.match(html, /href="\/en\/fellow"[^>]*aria-current="page"/);
  assert.match(html, /hreflang="en"[^>]*aria-current="page"/);
  assert.match(html, /href="\/fellow"/);
});

test('composeLayout passes through unmarked html', () => {
  const raw = '<html><body><header class="a-top">x</header></body></html>';
  assert.equal(composeLayout(raw, '/admin'), raw);
});

test('resolvePublicHtml resolves known pages', () => {
  assert.ok(resolvePublicHtml(PUB, '/').endsWith('index.html'));
  assert.ok(resolvePublicHtml(PUB, '/member').endsWith('member.html'));
  assert.ok(resolvePublicHtml(PUB, '/fellow').includes(`${path.sep}fellow${path.sep}index.html`));
});

test('header partials include system link after about, before space', () => {
  const expect = {
    zh: { label: '消費方式', href: '/system' },
    en: { label: 'SYSTEM', href: '/en/system' },
    ja: { label: 'システム', href: '/ja/system' },
  };
  for (const lang of ['zh', 'en', 'ja']) {
    const h = fs.readFileSync(path.join(__dirname, '..', 'views', 'partials', `header-${lang}.html`), 'utf8');
    assert.doesNotMatch(h, /href="[^"]*\/menu/);
    assert.doesNotMatch(h, /#floors/);
    assert.match(h, /NAV_SYSTEM_CURRENT/);
    assert.match(h, new RegExp(`href="${expect[lang].href}"[^>]*>\\s*${expect[lang].label}`));
    assert.match(h, /\/space/);
    const iAbout = h.indexOf(lang === 'zh' ? '/about"' : `/${lang}/about"`);
    const iSys = h.indexOf(`href="${expect[lang].href}"`);
    const iSpace = h.indexOf(lang === 'zh' ? 'href="/space"' : `href="/${lang}/space"`);
    assert.ok(iAbout < iSys && iSys < iSpace, `${lang} nav order`);
  }
});

test('composeLayout space page marks space current', () => {
  const raw = `<!doctype html><body>${MARKER_HEADER}<main></main>${MARKER_FOOTER}</body>`;
  const html = composeLayout(raw, '/space');
  assert.match(html, /href="\/space"[^>]*aria-current="page"/);
  assert.doesNotMatch(html, /\/menu\//);
});

test('source pages use markers', () => {
  const index = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
  const member = fs.readFileSync(path.join(PUB, 'member.html'), 'utf8');
  assert.match(index, /SITE_HEADER/);
  assert.match(index, /SITE_FOOTER/);
  assert.match(member, /SITE_HEADER/);
  assert.match(member, /SITE_FOOTER/);
  assert.doesNotMatch(member, /m-top|m-foot/);
});

test('member page has redesign markers', () => {
  const member = fs.readFileSync(path.join(PUB, 'member.html'), 'utf8');
  assert.match(member, /m-access-chip|m-chip/);
  assert.match(member, /m-qr-overlay/);
  assert.match(member, /m-notice/);
  assert.match(member, /m-panel--wallet|ptsAvailable|walletTitle/);
  assert.match(member, /m-toast/);
  assert.doesNotMatch(member, /申購|本金|持倉|贖回/);
  assert.doesNotMatch(member, /Principal left|残元本/);
});

test('about zh page structure', () => {
  const html = fs.readFileSync(path.join(PUB, 'about.html'), 'utf8');
  assert.match(html, /SITE_HEADER/);
  assert.match(html, /SITE_FOOTER/);
  assert.match(html, /id="why"/);
  assert.match(html, /id="kk"/);
  assert.match(html, /about\.css/);
  assert.match(html, /href="\/space"/);
  assert.match(html, /href="\/fellow#about"/);
  assert.doesNotMatch(html, /旅館|hotel|住宿|過夜/i);
  assert.doesNotMatch(html, /哈哈|～～/);
});

test('resolvePublicHtml resolves about zh', () => {
  assert.ok(resolvePublicHtml(PUB, '/about').endsWith('about.html'));
});

test('system zh page structure', () => {
  const html = fs.readFileSync(path.join(PUB, 'system.html'), 'utf8');
  assert.match(html, /SITE_HEADER/);
  assert.match(html, /SITE_FOOTER/);
  assert.match(html, /system\.css/);
  assert.match(html, /id="overview"/);
  assert.match(html, /id="membership"/);
  assert.match(html, /id="points"/);
  assert.match(html, /id="booking"/);
  assert.match(html, /id="cafe"/);
  assert.match(html, /href="\/fellow"/);
  assert.match(html, /href="\/partner"/);
  assert.match(html, /href="\/space"/);
  assert.match(html, /NT\$\s*4,000|NT\$4,000/);
  assert.doesNotMatch(html, /旅館|hotel|住宿|過夜|共居|居住|入住/i);
});

test('resolvePublicHtml resolves system zh', () => {
  assert.ok(resolvePublicHtml(PUB, '/system').endsWith('system.html'));
});

test('system en page structure', () => {
  const html = fs.readFileSync(path.join(PUB, 'en', 'system.html'), 'utf8');
  assert.match(html, /lang="en"/);
  assert.match(html, /id="membership"/);
  assert.match(html, /href="\/en\/fellow"/);
  assert.match(html, /href="\/en\/partner"/);
  assert.match(html, /href="\/en\/space"/);
  assert.match(html, /canonical" href="https:\/\/www\.emoji\.tw\/en\/system"/);
  assert.doesNotMatch(html, /旅館|hotel|住宿|過夜|共居|居住|入住/i);
});

test('system ja page structure', () => {
  const html = fs.readFileSync(path.join(PUB, 'ja', 'system.html'), 'utf8');
  assert.match(html, /lang="ja"/);
  assert.match(html, /id="membership"/);
  assert.match(html, /href="\/ja\/fellow"/);
  assert.match(html, /href="\/ja\/partner"/);
  assert.match(html, /href="\/ja\/space"/);
  assert.match(html, /canonical" href="https:\/\/www\.emoji\.tw\/ja\/system"/);
  assert.doesNotMatch(html, /旅館|hotel|宿泊|ホテル|過夜|共居|居住|入住/i);
});

test('about en page structure', () => {
  const html = fs.readFileSync(path.join(PUB, 'en', 'about.html'), 'utf8');
  assert.match(html, /lang="en"/);
  assert.match(html, /id="why"/);
  assert.match(html, /id="kk"/);
  assert.match(html, /href="\/en\/space"/);
  assert.match(html, /href="\/en\/fellow#about"/);
  assert.match(html, /canonical" href="https:\/\/www\.emoji\.tw\/en\/about"/);
  assert.match(html, /SITE_HEADER/);
  assert.match(html, /about\.css/);
  assert.doesNotMatch(html, /旅館|hotel|住宿|過夜/i);
});

test('resolvePublicHtml resolves about en', () => {
  assert.ok(resolvePublicHtml(PUB, '/en/about').endsWith(`en${path.sep}about.html`));
});

test('about ja page structure', () => {
  const html = fs.readFileSync(path.join(PUB, 'ja', 'about.html'), 'utf8');
  assert.match(html, /lang="ja"/);
  assert.match(html, /id="why"/);
  assert.match(html, /id="kk"/);
  assert.match(html, /href="\/ja\/space"/);
  assert.match(html, /href="\/ja\/fellow#about"/);
  assert.match(html, /canonical" href="https:\/\/www\.emoji\.tw\/ja\/about"/);
  assert.match(html, /SITE_HEADER/);
  assert.match(html, /about\.css/);
  assert.doesNotMatch(html, /旅館|hotel|住宿|過夜|ホテル/i);
});

test('resolvePublicHtml resolves about ja', () => {
  assert.ok(resolvePublicHtml(PUB, '/ja/about').endsWith(`ja${path.sep}about.html`));
});

test('homepages no longer ship #about section', () => {
  for (const rel of ['index.html', path.join('en', 'index.html'), path.join('ja', 'index.html')]) {
    const html = fs.readFileSync(path.join(PUB, rel), 'utf8');
    assert.doesNotMatch(html, /id="about"/);
    assert.doesNotMatch(html, /class="about"/);
  }
});

test('sitemap includes about locales', () => {
  const sm = fs.readFileSync(path.join(PUB, 'sitemap.xml'), 'utf8');
  assert.match(sm, /https:\/\/www\.emoji\.tw\/about/);
  assert.match(sm, /https:\/\/www\.emoji\.tw\/en\/about/);
  assert.match(sm, /https:\/\/www\.emoji\.tw\/ja\/about/);
});
