// Screenshots of the dev preview (/dev/classroom) for design review.
// Usage: npm run dev:web (other terminal), then:
//   node scripts/shoot.mjs [state,state,...] [--as=nika] [--out=.impeccable/review] [--base=http://localhost:5173]
// Captures each state at desktop (1440x900) and mobile (390x844).
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const states = (args.find((a) => !a.startsWith('--')) ?? 'lobby,teaching,check,result,qa,thread,catchup,ended').split(',');
const as = opt('as', 'ana');
const out = opt('out', '.impeccable/review');
const base = opt('base', 'http://localhost:5173');
const executablePath = opt('chrome', process.env.CHROME_PATH ?? ({
  win32: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
}[process.platform] ?? '/usr/bin/google-chrome'));
const sizes = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath });
for (const [name, viewport] of Object.entries(sizes)) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: name === 'mobile' ? 2 : 1, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  for (const state of states) {
    await page.goto(`${base}/dev/classroom?state=${state}&as=${as}`, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: '.dev-switcher{display:none!important}' });
    await page.waitForTimeout(600);
    const file = `${out}/${state}-${as}-${name}.png`;
    await page.screenshot({ path: file });
    console.log(file);
  }
  if (errors.length) console.log(`console errors (${name}):\n  ${[...new Set(errors)].join('\n  ')}`);
  await page.close();
}
await browser.close();
