// scripts/test-space-content.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  resolveFloorMarkdown,
  resolveSpaceImage,
  FLOORS,
  LANGS,
  spaceBodyKey,
  spaceImageKey,
  SPACE_SEED,
  missingSpaceSeedKeys,
} = require('../lib/space-content.js');

test('spaceBodyKey builds lang keys', () => {
  assert.equal(spaceBodyKey(1, 'zh'), 'space_1f_zh');
  assert.equal(spaceBodyKey(4, 'ja'), 'space_4f_ja');
});

test('resolveFloorMarkdown prefers lang key over legacy', () => {
  const c = { space_1f: '舊', space_1f_zh: '新' };
  assert.equal(resolveFloorMarkdown(c, 1, 'zh'), '新');
});

test('resolveFloorMarkdown falls back to legacy for zh only', () => {
  const c = { space_2f: 'legacy2' };
  assert.equal(resolveFloorMarkdown(c, 2, 'zh'), 'legacy2');
  assert.equal(resolveFloorMarkdown(c, 2, 'en'), '');
});

test('resolveSpaceImage returns trimmed url or empty', () => {
  assert.equal(resolveSpaceImage({ space_1f_image: ' /x.webp ' }, 1), '/x.webp');
  assert.equal(resolveSpaceImage({}, 1), '');
  assert.equal(resolveSpaceImage({ space_hero_image: 'https://cdn/h.jpg' }, 'hero'), 'https://cdn/h.jpg');
});

test('SPACE_SEED covers all floors and langs', () => {
  for (const f of FLOORS) {
    for (const lang of LANGS) {
      assert.ok(SPACE_SEED[spaceBodyKey(f, lang)], `${f} ${lang}`);
      assert.doesNotMatch(SPACE_SEED[spaceBodyKey(f, lang)], /旅館|hotel|住宿|過夜|lodging|宿泊|入住|共居|居住/i);
    }
  }
});

test('missingSpaceSeedKeys lists absent keys only', () => {
  const existing = { space_1f_zh: 'x' };
  const miss = missingSpaceSeedKeys(existing);
  assert.ok(miss.includes('space_1f_en'));
  assert.ok(!miss.includes('space_1f_zh'));
});
