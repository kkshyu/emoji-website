// scripts/test-space-dir-geometry.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'public/space-dir.js'), 'utf8');

function constInBuildSvg(name) {
  const m = src.match(new RegExp('function buildSvg\\(\\)[\\s\\S]*?var ' + name + ' = ([\\d.]+)'));
  assert.ok(m, 'missing ' + name + ' in buildSvg');
  return Number(m[1]);
}

test('footprint ratio W:D is 4.5:20', () => {
  const W = constInBuildSvg('W');
  const D = constInBuildSvg('D');
  assert.equal(W / D, 4.5 / 20);
});

test('slab height H is 3m at 10u/m', () => {
  assert.equal(constInBuildSvg('H'), 30);
});

test('stack uses tight seam not exploded gap', () => {
  assert.match(src, /var seam = [2-4]/);
  assert.doesNotMatch(src, /var gap = 52/);
});
