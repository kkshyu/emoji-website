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

test('localePaths maps member menu and space locales', () => {
  const m = localePaths('/member');
  assert.equal(m.lang, 'zh');
  assert.equal(m.zh, '/member');
  assert.equal(m.en, '/en/member');
  assert.equal(m.ja, '/ja/member');
  assert.equal(localePaths('/en/member').lang, 'en');
  assert.equal(localePaths('/en/member').en, '/en/member');
  assert.equal(localePaths('/ja/member').ja, '/ja/member');
  assert.equal(localePaths('/menu/').zh, '/menu/');
  assert.equal(localePaths('/menu').en, '/en/menu/');
  assert.equal(localePaths('/en/menu/').en, '/en/menu/');
  assert.equal(localePaths('/ja/menu/').ja, '/ja/menu/');
  assert.equal(localePaths('/space').slug, 'space');
  assert.equal(localePaths('/space').zh, '/space');
  assert.equal(localePaths('/en/space').en, '/en/space');
  assert.equal(localePaths('/ja/space').ja, '/ja/space');
  assert.equal(localePaths('/space.html').slug, 'space');
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
});
