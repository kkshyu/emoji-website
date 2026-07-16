import { chromium } from 'playwright';

const baseUrl = process.env.PUBLIC_BASE_URL || 'http://127.0.0.1:8096';
const partnerTargets = ['Instructors', 'Hosts', 'Community leaders', 'Companies', 'COMMONS', 'LOUNGE'];
const cases = [
  ['/en/partner', 1280, '.terms-row .k,.floor .lv span', partnerTargets],
  ['/en/partner', 320, '.terms-row .k,.floor .lv span', partnerTargets],
  ['/en/system', 320, '.system-table th,.system-table tbody td:first-child', [
    'Plan', 'Single day · 4 hours', 'Single day · 12 hours', 'Monthly',
    'Quarterly', 'Founding member', 'Condition',
  ]],
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 320, height: 900 } });
const failures = [];
let checkedWords = 0;

try {
  for (const [path, width, selector, targets] of cases) {
    await page.setViewportSize({ width, height: 900 });
    const response = await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded' });
    if (response?.status() !== 200) {
      failures.push(`${path} ${width}px returned HTTP ${response?.status() ?? 'none'}`);
      continue;
    }
    await page.evaluate(() => document.fonts.ready);

    const result = await page.evaluate(({ selector, targets }) => {
      const elements = [...document.querySelectorAll(selector)];
      const words = [];
      for (const exactText of targets) {
        const element = elements.find((candidate) => candidate.textContent.trim() === exactText);
        const node = element && [...element.childNodes].find((child) => child.nodeType === Node.TEXT_NODE);
        if (!element || !node) {
          words.push({ exactText, missing: true });
          continue;
        }
        for (const word of exactText.match(/[A-Za-z]+/g) || []) {
          const start = node.data.indexOf(word);
          const range = document.createRange();
          range.setStart(node, start);
          range.setEnd(node, start + word.length);
          const tops = [...range.getClientRects()].map((rect) => Math.round(rect.top * 2) / 2);
          words.push({
            exactText,
            word,
            lines: new Set(tops).size,
            overflowWrap: getComputedStyle(element).overflowWrap,
          });
        }
      }
      return {
        words,
        documentOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      };
    }, { selector, targets });

    if (result.documentOverflow > 1) {
      failures.push(`${path} ${width}px document overflow ${result.documentOverflow}px`);
    }
    for (const word of result.words) {
      if (word.missing) {
        failures.push(`${path} ${width}px missing "${word.exactText}"`);
      } else if (++checkedWords && word.lines !== 1) {
        failures.push(`${path} ${width}px "${word.word}" spans ${word.lines} lines (overflow-wrap: ${word.overflowWrap})`);
      }
    }
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`FAIL: ${failures.length} public word-wrap regressions across ${cases.length} renders`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`PASS: ${checkedWords} English words stay intact across ${cases.length} renders`);
}
