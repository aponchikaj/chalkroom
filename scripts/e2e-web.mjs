// Browser end-to-end run of a whole class against the real stack (web + API + local Supabase):
// Ana hosts, Nika and Gio join; questions get triaged, Nika gets a thread, the class ends with
// notes. Each step is logged and screenshotted; console errors and failed API calls are listed.
// Usage: stack running (npm run db:start, npm run dev), then: node scripts/e2e-web.mjs [--headed]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.WEB_URL ?? 'http://localhost:5173';
const OUT = '.impeccable/e2e';
const CHROME = process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: !process.argv.includes('--headed') });
const problems = [];
let shot = 0;
const log = (m) => console.log(`- ${m}`);

async function person(name, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${name} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`${name} console: ${m.text().slice(0, 300)}`); });
  page.on('response', async (r) => {
    if (r.url().includes(':3001') && r.status() >= 400) problems.push(`${name} ${r.request().method()} ${new URL(r.url()).pathname} -> ${r.status()} ${(await r.text().catch(() => '')).slice(0, 200)}`);
  });
  return { name, page };
}

const snap = async (p, label) => { await p.page.screenshot({ path: `${OUT}/${String(++shot).padStart(2, '0')}-${p.name}-${label}.png` }); };

async function step(label, fn, who = []) {
  try {
    await fn();
    log(`ok   ${label}`);
  } catch (e) {
    log(`FAIL ${label}: ${String(e.message).split('\n')[0]}`);
    problems.push(`step failed: ${label}: ${String(e.message).split('\n')[0]}`);
    for (const p of who) await snap(p, `fail-${label.replace(/\W+/g, '-').slice(0, 30)}`).catch(() => {});
  }
}

const ana = await person('ana');
const nika = await person('nika');
const gio = await person('gio', { width: 390, height: 844 }); // the phone in the demo
let code = '';

await step('Ana creates a class', async () => {
  await ana.page.goto(BASE);
  await ana.page.getByPlaceholder('A topic, e.g. Solana PDAs').fill('Solana PDAs');
  await ana.page.getByPlaceholder('What the class calls you').first().fill('Ana');
  await ana.page.getByRole('button', { name: /start a class/i }).last().click();
  await ana.page.waitForURL(/\/r\/[A-Z0-9]+/, { timeout: 15000 });
  code = /\/r\/([A-Z0-9]+)/.exec(ana.page.url())[1];
  await ana.page.getByText(code).first().waitFor({ timeout: 15000 });
  await snap(ana, 'lobby');
  log(`     code ${code}`);
}, [ana]);

for (const [p, name] of [[nika, 'Nika'], [gio, 'Gio']]) {
  await step(`${name} joins`, async () => {
    await p.page.goto(`${BASE}/r/${code}`);
    await p.page.getByPlaceholder('What the class calls you').fill(name);
    await p.page.getByRole('button', { name: /join muted/i }).click();
    await p.page.locator('.live').waitFor({ timeout: 15000 });
  }, [p]);
}
await snap(ana, 'lobby-full');

await step('Ana starts the class', async () => {
  await ana.page.getByRole('button', { name: /start class/i }).click();
  await ana.page.locator('.phase-teaching, .phase-check').waitFor({ timeout: 20000 });
}, [ana]);

await step('Questions while the tutor teaches', async () => {
  const ask = async (p, text) => {
    const input = p.page.getByRole('textbox', { name: /ask a question/i });
    await input.fill(text);
    await input.press('Enter');
    await p.page.waitForTimeout(400);
  };
  await ask(gio, 'Why can a PDA not sign transactions?');
  await ask(nika, 'why cant a PDA sign for itself');
  // Nika keeps digging into one subtopic; triage offers a thread on her third question.
  // Separate batches (triage debounces 4 s), so earlier questions are in her history.
  await ask(nika, 'What is a bump seed?');
  await ana.page.waitForTimeout(6000);
  await ask(nika, 'Why does the bump seed start at 255?');
  await ana.page.waitForTimeout(6000);
  await ask(nika, 'How is the bump seed chosen exactly?');
  await ana.page.waitForTimeout(7000); // triage debounce + model
  await snap(ana, 'rail-after-triage');
  await snap(nika, 'rail-after-triage');
}, [ana, nika]);

await step('Check: everyone answers', async () => {
  for (const p of [ana, nika, gio]) {
    await p.page.getByText('Who can sign for a PDA?').first().waitFor({ timeout: 45000 });
    await p.page.getByText('Only the program that derived it').first().click();
    await p.page.getByRole('button', { name: /^submit$/i }).click();
  }
  await snap(ana, 'check-sent');
}, [ana, nika, gio]);

await step('Nika accepts the thread offer', async () => {
  await nika.page.getByRole('button', { name: /open thread/i }).first().click({ timeout: 30000 });
  await nika.page.locator('.thread-layer').waitFor({ timeout: 15000 });
  const box = nika.page.locator('.thread-layer textarea');
  await box.fill('So the program stores the bump to avoid searching again?');
  await box.press('Enter');
  await nika.page.waitForTimeout(4000);
  await snap(nika, 'thread');
  await snap(ana, 'sees-nika-in-thread');
}, [nika, ana]);

await step('Ready gate (Nika excused while in her thread)', async () => {
  for (const p of [ana, gio]) await p.page.getByRole('button', { name: /i'm ready/i }).click({ timeout: 15000 });
  await ana.page.locator('.phase-qa, .phase-teaching').waitFor({ timeout: 30000 });
  await snap(ana, 'after-gate');
  await snap(gio, 'after-gate');
}, [ana, gio]);

await step('Nika comes back and sees the catch-up', async () => {
  await nika.page.waitForTimeout(8000);
  await nika.page.getByRole('button', { name: /back to class/i }).click();
  await nika.page.waitForTimeout(3000);
  await snap(nika, 'catch-up');
}, [nika]);

await step('Ana mutes Gio, then lets him ask again', async () => {
  await ana.page.getByRole('button', { name: /^Gio: mute or remove/ }).click();
  await ana.page.getByRole('menuitem', { name: /mute questions/i }).click();
  await gio.page.getByPlaceholder('The host muted your questions for now.').waitFor({ timeout: 10000 });
  await snap(gio, 'muted');
  await ana.page.getByRole('button', { name: /^Gio: mute or remove/ }).click();
  await ana.page.getByRole('menuitem', { name: /let them ask/i }).click();
  await gio.page.getByRole('textbox', { name: /ask a question/i }).and(gio.page.locator(':enabled')).waitFor({ timeout: 10000 });
}, [ana, gio]);

await step('Ana removes Nika', async () => {
  await ana.page.getByRole('button', { name: /^Nika: mute or remove/ }).click();
  await ana.page.getByRole('menuitem', { name: /remove from class/i }).click();
  await ana.page.getByRole('button', { name: /^remove$/i }).click();
  await nika.page.getByText('You were removed from this class').waitFor({ timeout: 15000 });
  await snap(nika, 'removed');
}, [ana, nika]);

await step('Ana ends the class', async () => {
  await ana.page.getByRole('button', { name: /^end/i }).first().click();
  await ana.page.getByRole('button', { name: /end (the )?class|yes, end|end for everyone/i }).first().click({ timeout: 5000 }).catch(() => {});
  await ana.page.locator('.phase-ended').waitFor({ timeout: 30000 });
  await ana.page.waitForTimeout(4000);
  await snap(ana, 'recap');
  await gio.page.locator('.phase-ended').waitFor({ timeout: 15000 });
  await snap(gio, 'recap');
}, [ana, gio]);

await step('Notes tab after class', async () => {
  await ana.page.getByRole('tab', { name: /notes/i }).click();
  await ana.page.waitForTimeout(1500);
  await snap(ana, 'notes');
}, [ana]);

await browser.close();
console.log(problems.length ? `\nPROBLEMS (${problems.length}):\n  ${[...new Set(problems)].join('\n  ')}` : '\nno problems recorded');
console.log(`screenshots: ${OUT}`);
