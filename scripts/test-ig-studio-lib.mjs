import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const code = fs.readFileSync(
  new URL('../public/ig-studio-lib.js', import.meta.url),
  'utf8',
);
const studioCode = fs.readFileSync(
  new URL('../public/ig-studio.js', import.meta.url),
  'utf8',
);
const adminCode = fs.readFileSync(
  new URL('../public/admin.html', import.meta.url),
  'utf8',
);
const window = {};
vm.runInNewContext(code, { window, console });
const {
  sanitizeFilename,
  computePreviewScale,
  itemNeedsAlcoholBand,
  alcoholBandHTML,
  buildDownloadName,
  contentOverflows,
  parsePipeRows,
  menuLayoutNeedsAlcohol,
  PHOTO_MAX_BYTES,
  isAllowedPhotoType,
} = window.IGStudioLib;

test('sanitizeFilename strips path and control chars', () => {
  assert.equal(sanitizeFilename('a/b\\c:美式*.png'), 'abc美式.png');
  assert.ok(sanitizeFilename('x'.repeat(200)).length <= 80);
});

test('computePreviewScale skips tiny widths', () => {
  assert.equal(computePreviewScale(0, 1080), null);
  assert.equal(computePreviewScale(50, 1080), null);
  assert.equal(computePreviewScale(700, 1080), 460 / 1080);
});

test('alcohol flags', () => {
  assert.equal(itemNeedsAlcoholBand({ alcohol: true }), true);
  assert.equal(itemNeedsAlcoholBand({ cat: 'ALCOHOL' }), true);
  assert.equal(itemNeedsAlcoholBand({ note: '含酒精' }), true);
  assert.equal(itemNeedsAlcoholBand({ cat: 'COFFEE', alcohol: false }), false);
});

test('alcoholBandHTML height >= 10% of canvas', () => {
  const html = alcoholBandHTML(1350);
  assert.match(html, /未滿十八歲禁止飲酒/);
  assert.match(html, /禁止酒駕/);
  assert.match(html, /height:\s*135px/);
});

test('photo limits', () => {
  assert.equal(PHOTO_MAX_BYTES, 5 * 1024 * 1024);
  assert.equal(isAllowedPhotoType('image/png'), true);
  assert.equal(isAllowedPhotoType('image/gif'), false);
});

test('buildDownloadName', () => {
  assert.equal(
    buildDownloadName('美式/咖啡', 'portrait'),
    '言文字_IG_美式咖啡_直式.png',
  );
  assert.equal(buildDownloadName('x', 'square'), '言文字_IG_x_方形.png');
});

test('sizeStage skips hidden preview widths', () => {
  assert.match(studioCode, /const scale = Lib\.computePreviewScale\([\s\S]*?\);\s*if \(scale == null\) return;/);
});

test('readPhoto reports FileReader errors without changing photo state', () => {
  assert.match(studioCode, /r\.onerror = r\.onabort = \(\) => toast\('照片讀取失敗'\);/);
});

test('shell and download guard preserve state across remounts', () => {
  for (const fragment of [
    "currentTypeKey() === 'product' ? 'on' : ''",
    "currentTypeKey() === 'event' ? 'on' : ''",
    "currentTypeKey() === 'quote' ? 'on' : ''",
    "state.format === 'portrait' ? 'on' : ''",
    "state.format === 'square' ? 'on' : ''",
    "state.dark ? ' checked' : ''",
    "state.showEn ? ' checked' : ''",
    "state.showMember ? ' checked' : ''",
    "state.hl ? ' checked' : ''",
    'let root, stage, downloading = false;',
    'if (!btn || btn.disabled || downloading) return;',
    'downloading = true;',
  ]) assert.ok(studioCode.includes(fragment), fragment);
  assert.match(studioCode, /finally \{[\s\S]*?downloading = false;/);
});

test('menu selection uses stable ids and refreshes after menu changes', () => {
  assert.doesNotMatch(studioCode, /p_menuIdx/);
  for (const fragment of [
    "p_menuId: ''",
    'MENU().find(m => m.id === id)',
    'value="${H(m.id)}"',
    "window.addEventListener('tth:menu-data', refreshMenu);",
  ]) assert.ok(studioCode.includes(fragment), fragment);
  assert.match(adminCode, /MENU_DOC && Array\.isArray\(MENU_DOC\.items\)[\s\S]*?\? MENU_DOC\.items/);
  assert.ok(adminCode.includes("window.dispatchEvent(new Event('tth:menu-data'));"));
});

test('contentOverflows detects clipped content', () => {
  assert.equal(contentOverflows(101, 100), true);
  assert.equal(contentOverflows(100, 100), false);
  assert.equal(contentOverflows(99, 100), false);
  assert.equal(contentOverflows('bad', 100), false);
  assert.equal(contentOverflows(100, 100, 101, 100), true);
});

test('alcohol layout is compact and export blocks overflow', () => {
  for (const fragment of [
    'const photoH = needsAlcohol ? (sq ? 160 : 320)',
    "needsAlcohol ? ' igp-body--alcohol' : ''",
    'Lib.contentOverflows(el.scrollHeight, el.clientHeight, el.scrollWidth, el.clientWidth)',
    "toast('內容超出版面，請縮短文字或移除照片')",
  ]) assert.ok(studioCode.includes(fragment), fragment);
});

test('LAYOUTS wires nine real named renderers', () => {
  const keys = ['01a', '01b', '01c', '02a', '02b', '02c', '03a', '03b', '03c'];
  assert.ok(studioCode.includes('const LAYOUTS = {'));
  keys.forEach((key, index) => {
    const fn = `render${key}`;
    const start = studioCode.indexOf(`function ${fn}() {`);
    const next = index === keys.length - 1
      ? studioCode.indexOf('const LAYOUTS = {', start)
      : studioCode.indexOf(`function render${keys[index + 1]}() {`, start);
    assert.ok(start >= 0 && next > start, `${fn} must be a named implementation`);
    const body = studioCode.slice(start, next);
    assert.ok(body.includes(`data-layout="${key}"`), `${fn} must render its own layout`);
    assert.doesNotMatch(body, /return render\d{2}[a-c]\(\);/);
    assert.match(
      studioCode,
      new RegExp(`${key[2]}:\\s*\\{\\s*label:\\s*['\"][^'\"]+['\"],\\s*forceDark:\\s*(?:true|false),\\s*render:\\s*${fn}\\s*\\}`),
    );
  });
});

test('layout controls support category, variant, and forced dark state', () => {
  for (const category of ['01', '02', '03']) {
    assert.ok(studioCode.includes(`data-category="${category}"`), category);
  }
  for (const variant of ['a', 'b', 'c']) {
    assert.ok(studioCode.includes(`data-variant="${variant}"`), variant);
  }
  for (const key of ['01c', '02c', '03b']) {
    assert.match(studioCode, new RegExp(`${key[2]}:\\s*\\{[^}]*forceDark:\\s*true`));
  }
  assert.ok(studioCode.includes('if (currentLayout().forceDark) state.dark = true;'));
  assert.ok(studioCode.includes('dark.checked = state.dark;'));
  assert.ok(studioCode.includes('dark.disabled = currentLayout().forceDark;'));
});

test('forms expose required 01-03 fields and escape user text', () => {
  const fields = [
    'p_eyebrow', 'p_zh', 'p_en', 'p_note', 'p_desc', 'p_unit', 'p_price', 'p_emo',
    'e_title', 'e_dateBig', 'e_weekday', 'e_when', 'e_place', 'e_desc', 'e_capacity', 'e_signup',
    'q_text', 'q_sub', 'q_by',
  ];
  for (const field of fields) {
    assert.ok(studioCode.includes(`data-k="${field}"`), field);
    assert.ok(studioCode.includes(`H(state.${field})`), `${field} must be escaped`);
  }
  for (const field of ['place', 'handle']) {
    assert.ok(studioCode.includes(`H(state.${field})`), `${field} must be escaped`);
  }
});

test('photo quote participates in the overflow export guard', () => {
  assert.ok(studioCode.includes("node.querySelectorAll('.igp-body,.igp-quote,.igp-overlay-copy,.igp-layout')"));
});

test('01b photo stays square in alcohol modes', () => {
  const body = studioCode.slice(
    studioCode.indexOf('function render01b() {'),
    studioCode.indexOf('function render01c() {'),
  );
  assert.ok(body.includes("photo(photoH, 'igp-photo-square', `width:${photoH}px;margin-top:"));
});

test('parsePipeRows parses native textarea rows and ignores blank lines', () => {
  const rows = parsePipeRows('週一｜10:00–18:00\n\n 週六 | 12:00–20:00 ', ['day', 'time']);
  assert.equal(JSON.stringify(rows), JSON.stringify([
    { day: '週一', time: '10:00–18:00' },
    { day: '週六', time: '12:00–20:00' },
  ]));
});

test('05 alcohol compliance is scoped to each variant', () => {
  const alcohol = [{ id: 'beer', alcohol: true }];
  const manualAlcohol = [{ zh: '高球', price: '300' }];
  assert.equal(menuLayoutNeedsAlcohol('a', alcohol, manualAlcohol, false), true);
  assert.equal(menuLayoutNeedsAlcohol('a', [], manualAlcohol, false), false);
  assert.equal(menuLayoutNeedsAlcohol('b', [], manualAlcohol, false), true);
  assert.equal(menuLayoutNeedsAlcohol('b', alcohol, [], false), true);
  assert.equal(menuLayoutNeedsAlcohol('c', alcohol, manualAlcohol, false), false);
  assert.equal(menuLayoutNeedsAlcohol('c', [], [], true), true);
});

test('LAYOUTS wires nine distinct named 04-06 renderers', () => {
  const keys = ['04a', '04b', '04c', '05a', '05b', '05c', '06a', '06b', '06c'];
  keys.forEach((key, index) => {
    const fn = `render${key}`;
    const start = studioCode.indexOf(`function ${fn}() {`);
    const next = index === keys.length - 1
      ? studioCode.indexOf('const LAYOUTS = {', start)
      : studioCode.indexOf(`function render${keys[index + 1]}() {`, start);
    assert.ok(start >= 0 && next > start, `${fn} must be a named implementation`);
    const body = studioCode.slice(start, next);
    assert.ok(body.includes(`data-layout="${key}"`), `${fn} must render its own layout`);
    assert.ok(body.includes("state.format === 'square'"), `${fn} must size square separately`);
    assert.ok(body.includes('${foot()}'), `${fn} must use the shared state footer`);
    assert.doesNotMatch(body, /return render\d{2}[a-c]\(\);/);
    assert.match(
      studioCode,
      new RegExp(`${key[2]}:\\s*\\{\\s*label:\\s*['\"][^'\"]+['\"],\\s*forceDark:\\s*(?:true|false),\\s*render:\\s*${fn}\\s*\\}`),
    );
  });
});

test('04-06 UI exposes required fields and only c variants force dark', () => {
  for (const [category, type] of [['04', 'hours'], ['05', 'menu'], ['06', 'brand']]) {
    assert.ok(studioCode.includes(`'${category}': '${type}'`));
    assert.ok(studioCode.includes(`data-category="${category}"`));
  }
  for (const key of ['04c', '05c', '06c']) {
    assert.match(studioCode, new RegExp(`${key[2]}:\\s*\\{[^}]*forceDark:\\s*true`));
  }
  for (const key of ['04a', '04b', '05a', '05b', '06a', '06b']) {
    assert.match(studioCode, new RegExp(`${key[2]}:\\s*\\{[^}]*forceDark:\\s*false`));
  }

  const fields = [
    'hoursRows', 'note', 'dayTitle', 'dayHours', 'dayDesc', 'nightTitle', 'nightHours', 'nightDesc',
    'address', 'mrt', 'booking', 'menuTitle', 'menuRows', 'coffeeRows', 'alcoholRows',
    'openingLine', 'openingDate', 'openingDesc', 'manifesto', 'en', 'comingTitle', 'comingSub',
  ];
  fields.forEach(field => assert.ok(studioCode.includes(`data-k="${field}"`), field));
  assert.match(studioCode, /<select data-menu-multi multiple/);
  assert.match(studioCode, /一行一列[^<]*\|/);
});

test('05 menu selection keeps stable ids, prunes stale ids, and refreshes', () => {
  for (const fragment of [
    'm_menuIds: []',
    'value="${H(m.id)}"',
    'state.m_menuIds.includes(m.id)',
    'e.target.selectedOptions',
    'state.m_menuIds = state.m_menuIds.filter',
    "window.addEventListener('tth:menu-data', refreshMenu);",
  ]) assert.ok(studioCode.includes(fragment), fragment);
});

test('05 renderers add preview/export alcohol band from shared variant-scoped decision', () => {
  assert.match(studioCode, /function currentNeedsAlcohol\(\)[\s\S]*?menuLayoutNeedsAlcohol\(state\.variant/);
  for (const key of ['05a', '05b', '05c']) {
    const start = studioCode.indexOf(`function render${key}() {`);
    const next = key === '05c'
      ? studioCode.indexOf('function render06a() {', start)
      : studioCode.indexOf(`function render05${String.fromCharCode(key.charCodeAt(2) + 1)}() {`, start);
    const body = studioCode.slice(start, next);
    assert.ok(body.includes('Lib.alcoholBandHTML'), key);
  }
  assert.ok(studioCode.includes("toast('酒精飲品缺少法定警語，已阻止匯出')"));
  assert.ok(studioCode.includes('Lib.contentOverflows(el.scrollHeight, el.clientHeight, el.scrollWidth, el.clientWidth)'));
});

test('manifesto remains escaped while CSS preserves newlines', () => {
  const body = studioCode.slice(
    studioCode.indexOf('function render06b() {'),
    studioCode.indexOf('function render06c() {'),
  );
  assert.ok(body.includes('H(state.manifesto)'));
  assert.match(studioCode, /\.igp-manifesto\{[^}]*white-space:pre-line/);
  assert.doesNotMatch(body, /innerHTML\s*=\s*state\.manifesto|\$\{state\.manifesto\}/);
});

test('04-06 user copy is escaped and 05c has the CIS photo placeholder', () => {
  for (const field of [
    'note', 'dayTitle', 'dayHours', 'dayDesc', 'nightTitle', 'nightHours', 'nightDesc',
    'address', 'mrt', 'booking', 'menuTitle', 'openingLine', 'openingDate', 'openingDesc',
    'manifesto', 'en', 'comingTitle', 'comingSub',
  ]) assert.ok(studioCode.includes(`H(state.${field})`), field);
  for (const field of ['day', 'time', 'zh', 'price']) {
    assert.ok(studioCode.includes(`H(r.${field})`), field);
  }
  const body = studioCode.slice(
    studioCode.indexOf('function render05c() {'),
    studioCode.indexOf('function render06a() {'),
  );
  assert.ok(body.includes("photo(photoH, '', '', true)"));
  assert.match(studioCode, /\.igp-photo-placeholder\{[^}]*background:var\(--ig-yellow\)/);
  assert.ok(studioCode.includes('--ig-yellow:#FFDE34'));
});
