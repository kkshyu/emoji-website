import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const EXTENSIONS = new Set(['.css', '.html', '.js']);
const NUMBER = String.raw`[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?`;
const FIXED_SIZE = new RegExp(`^(${NUMBER})\\s*(rem|em|px|pt|%)$`, 'i');
const ZERO = new RegExp(`^${NUMBER}$`, 'i');
const VIEWPORT_SIZE = new RegExp(`^${NUMBER}(?:[dsl]?v(?:w|h|min|max|i|b))$`, 'i');
const FLOORS = { rem: 1, em: 1, px: 16, pt: 12, '%': 100 };
const EXCLUDED = new Set([
  'public/access-mock.html',
  'public/admin.html',
  'public/ig-studio-lib.js',
  'public/ig-studio.js',
  'public/social-ads-lib.js',
  'public/vendor/html-to-image.js',
  'public/vendor/qrcode.min.js',
]);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function withoutAllowedDecoration(relative, source) {
  if (relative !== 'public/fellow/founding.css') return source;
  const masked = new Set();
  return source.replace(/([^{}]+)\{([^{}]*)\}/gs, (rule, selector, body) => {
    if (selector.trim().replace(/\s+/g, ' ') !== '.fnd-roster i') return rule;
    const safeBody = body.replace(
      /font-size\s*:\s*(\.52rem|\.42rem)(?=\s*(?:;|$))/gi,
      (declaration, size) => {
        const key = size.toLowerCase();
        if (masked.has(key)) return declaration;
        masked.add(key);
        return declaration.replace(/[^\n]/g, ' ');
      },
    );
    return `${selector}{${safeBody}}`;
  });
}

function withoutBlockComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
}

function topLevelArgs(value, name) {
  const prefix = `${name}(`;
  if (!value.toLowerCase().startsWith(prefix) || !value.endsWith(')')) return null;
  const source = value.slice(prefix.length, -1);
  const args = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '(') depth += 1;
    else if (source[index] === ')') {
      if (depth === 0) return null;
      depth -= 1;
    } else if (source[index] === ',' && depth === 0) {
      args.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (depth !== 0) return null;
  args.push(source.slice(start).trim());
  return args.every(Boolean) ? args : null;
}

function belowFloor(rawValue) {
  const value = rawValue.replace(/\s*!important\s*$/i, '').trim();
  const max = topLevelArgs(value, 'max');
  if (max) {
    return !max.some((argument) => {
      const fixed = argument.match(FIXED_SIZE);
      if (!fixed || fixed[2].toLowerCase() === 'em') return false;
      return Number(fixed[1]) >= FLOORS[fixed[2].toLowerCase()];
    });
  }

  const clamp = topLevelArgs(value, 'clamp');
  if (clamp) return belowFloor(clamp[0]);

  const fixed = value.match(FIXED_SIZE);
  if (fixed) {
    const amount = Number(fixed[1]);
    return amount < FLOORS[fixed[2].toLowerCase()];
  }

  if (ZERO.test(value) && Number(value) === 0) return true;
  if (/^(?:xx-small|x-small|small|smaller)$/i.test(value)) return true;
  if (/^(?:calc|min|max|clamp)\(/i.test(value)) return true;
  if (VIEWPORT_SIZE.test(value)) return true;
  return false;
}

test('max 與 clamp 只接受頂層明確固定下限', () => {
  const unsafe = [
    'max(.5rem,.9rem)',
    'max(1vw,2vw)',
    'max(.5rem,calc(1rem - 1px))',
    'max(1em,.5rem)',
    'clamp(max(.2rem,.3rem),2vw,2rem)',
  ];
  const safe = [
    'max(1rem,.34em)',
    'max(.5rem,16px)',
    'max(.5rem,12pt)',
    'max(.5rem,100%)',
    'clamp(1rem,2vw,2rem)',
  ];

  assert.deepEqual(unsafe.map((value) => [value, belowFloor(value)]), unsafe.map((value) => [value, true]));
  assert.deepEqual(safe.map((value) => [value, belowFloor(value)]), safe.map((value) => [value, false]));
});

test('數值接受正負號與科學記號', () => {
  const unsafe = ['+.5rem', '1.5e1px', '9e1%', '-1e0rem', '+0', '-0'];
  const safe = ['+1rem', '1.6e1px', '1.2e1pt', '1e2%'];

  assert.deepEqual(unsafe.map((value) => [value, belowFloor(value)]), unsafe.map((value) => [value, true]));
  assert.deepEqual(safe.map((value) => [value, belowFloor(value)]), safe.map((value) => [value, false]));
});

test('viewport-only 字級涵蓋傳統、dynamic、small、large 與 logical 單位', () => {
  const units = [
    'vw', 'vh', 'vmin', 'vmax',
    'dvw', 'dvh', 'dvmin', 'dvmax',
    'svw', 'svh', 'svmin', 'svmax',
    'lvw', 'lvh', 'lvmin', 'lvmax',
    'vi', 'vb', 'dvi', 'dvb', 'svi', 'svb', 'lvi', 'lvb',
  ];

  assert.deepEqual(units.map((unit) => [unit, belowFloor(`1${unit}`)]), units.map((unit) => [unit, true]));
});

test('roster 例外只遮罩第一個合法 .52rem 與 .42rem 宣告', () => {
  const source = withoutAllowedDecoration(
    'public/fellow/founding.css',
    withoutBlockComments(`
      .fnd-roster i{font-size:.52rem;color:red}
      @media(max-width:640px){.fnd-roster i{font-size:.42rem}}
      .fnd-roster i{font-size:.1rem}
      .fnd-roster i{font-size:.52rem}
      .meaningful,.fnd-roster i{font-size:.5rem}
      .meaningful,/* } .fnd-roster i{font-size:.52rem} */.fnd-roster i{font-size:.4rem}
    `),
  );
  const remaining = [...source.matchAll(/font-size\s*:\s*([^;}]+)/gi)].map((match) => match[1].trim());

  assert.deepEqual(remaining, ['.1rem', '.52rem', '.5rem', '.4rem']);
  assert.equal(remaining.every(belowFloor), true);
});

test('正式官網不得宣告低於 16px 的有意義文字', () => {
  const violations = [];
  for (const file of walk(PUBLIC)) {
    if (!EXTENSIONS.has(path.extname(file))) continue;
    const relative = path.relative(ROOT, file).split(path.sep).join('/');
    if (EXCLUDED.has(relative)) continue;

    const source = withoutAllowedDecoration(relative, withoutBlockComments(readFileSync(file, 'utf8')));
    for (const match of source.matchAll(/font-size\s*:\s*([^;}"']+)/gi)) {
      if (!belowFloor(match[1])) continue;
      const line = source.slice(0, match.index).split('\n').length;
      violations.push(`${relative}:${line} font-size:${match[1].trim()}`);
    }
  }

  assert.deepEqual(violations, [], `低於 16px 的字級：\n${violations.join('\n')}`);
});
