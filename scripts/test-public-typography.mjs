import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const EXTENSIONS = new Set(['.css', '.html', '.js']);
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
  return source.replace(/\.fnd-roster i\s*\{[^}]*\}/gs, '');
}

function withoutBlockComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
}

function belowFloor(rawValue) {
  const value = rawValue.replace(/\s*!important\s*$/i, '').trim();
  if (/^max\(/i.test(value) && /(?:1rem|16px|12pt|100%)/i.test(value)) return false;

  const clamp = value.match(/^clamp\(\s*([^,]+),/i);
  if (clamp) return belowFloor(clamp[1]);

  const fixed = value.match(/^(-?\d*\.?\d+)\s*(rem|em|px|pt|%)$/i);
  if (fixed) {
    const amount = Number(fixed[1]);
    const floor = { rem: 1, em: 1, px: 16, pt: 12, '%': 100 }[fixed[2].toLowerCase()];
    return amount < floor;
  }

  if (/^0(?:\.0+)?$/.test(value)) return true;
  if (/^(?:xx-small|x-small|small|smaller)$/i.test(value)) return true;
  if (/^(?:calc|min)\(/i.test(value)) return true;
  if (/^-?\d*\.?\d+(?:vw|vh|vmin|vmax)$/i.test(value)) return true;
  return false;
}

test('正式官網不得宣告低於 16px 的有意義文字', () => {
  const violations = [];
  for (const file of walk(PUBLIC)) {
    if (!EXTENSIONS.has(path.extname(file))) continue;
    const relative = path.relative(ROOT, file).split(path.sep).join('/');
    if (EXCLUDED.has(relative)) continue;

    const source = withoutBlockComments(withoutAllowedDecoration(relative, readFileSync(file, 'utf8')));
    for (const match of source.matchAll(/font-size\s*:\s*([^;}"']+)/gi)) {
      if (!belowFloor(match[1])) continue;
      const line = source.slice(0, match.index).split('\n').length;
      violations.push(`${relative}:${line} font-size:${match[1].trim()}`);
    }
  }

  assert.deepEqual(violations, [], `低於 16px 的字級：\n${violations.join('\n')}`);
});
