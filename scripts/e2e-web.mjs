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

// accounts are required: everyone signs up (local email confirmation is off)
const stamp = Date.now().toString(36);
const PASSWORD = 'Test-password-123';
async function fillSignup(p, name) {
  await p.page.getByLabel('Display name').fill(name);
  await p.page.getByLabel('Email').fill(`${name.toLowerCase()}-${stamp}@example.com`);
  await p.page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await p.page.getByRole('button', { name: /create (my )?account|sign up/i }).click();
}

await step('Ana signs up and creates a class', async () => {
  await ana.page.goto(`${BASE}/signup`);
  await fillSignup(ana, 'Ana');
  await ana.page.getByPlaceholder('A topic, e.g. Solana PDAs').waitFor({ timeout: 15000 });
  await ana.page.getByPlaceholder('A topic, e.g. Solana PDAs').fill('Solana PDAs');
  await ana.page.getByRole('button', { name: /start a class/i }).last().click();
  await ana.page.waitForURL(/\/r\/[A-Z0-9]+/, { timeout: 15000 });
  code = /\/r\/([A-Z0-9]+)/.exec(ana.page.url())[1];
  await ana.page.getByText(code).first().waitFor({ timeout: 15000 });
  await snap(ana, 'lobby');
  log(`     code ${code}`);
}, [ana]);

// Nika and Gio come in by the class link (the QR code): the gate asks them to log in, they
// create an account and land back on the class
for (const [p, name] of [[nika, 'Nika'], [gio, 'Gio']]) {
  await step(`${name} opens the class link, signs up and joins`, async () => {
    await p.page.goto(`${BASE}/r/${code}`);
    await p.page.getByText(/log in to join/i).first().waitFor({ timeout: 15000 });
    if (name === 'Gio') await snap(p, 'gate');
    await p.page.getByRole('button', { name: /create an account/i }).click();
    await fillSignup(p, name);
    await p.page.getByRole('button', { name: /join muted/i }).click({ timeout: 15000 });
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

await step('Class page: Ana studies the deck', async () => {
  await ana.page.getByRole('button', { name: /open class page/i }).click();
  await ana.page.waitForURL(/\/c\/[0-9a-f-]{36}/, { timeout: 10000 });
  await ana.page.getByRole('tab', { name: /flashcards/i }).click();
  await ana.page.keyboard.press('Space');
  await ana.page.waitForTimeout(300);
  await snap(ana, 'card-revealed');
  const reviewed = ana.page.waitForResponse((r) => /\/cards\/.+\/review/.test(r.url()) && r.status() < 300, { timeout: 10000 });
  await ana.page.keyboard.press('3'); // Good
  await reviewed;
  for (const tab of ['notes', 'questions', 'materials', 'checks']) {
    await ana.page.getByRole('tab', { name: new RegExp(tab, 'i') }).click();
    await ana.page.waitForTimeout(300);
    await snap(ana, `shelf-${tab}`);
  }
}, [ana]);

await step('Class page: Ana adds a document to the materials', async () => {
  await ana.page.getByRole('tab', { name: /materials/i }).click();
  const md = '# PDA cheat sheet\n\nA PDA is derived from seeds and the program id. It has no private key.\n';
  await ana.page.locator('input[type=file]').first().setInputFiles({ name: 'pda-cheat-sheet.md', mimeType: 'text/markdown', buffer: Buffer.from(md) });
  await ana.page.getByText(/^ready$/i).first().waitFor({ timeout: 45000 }); // the API reads it (free, local)
  await snap(ana, 'materials');
}, [ana]);

// the code the API emailed (Mailpit catches local mail)
async function mailedCode(to, after) {
  for (let i = 0; i < 30; i++) {
    const list = await fetch(`http://127.0.0.1:55424/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`).then((r) => r.json()).catch(() => ({ messages: [] }));
    const msg = (list.messages ?? []).find((m) => Date.parse(m.Created) >= after);
    if (msg) {
      const full = await fetch(`http://127.0.0.1:55424/api/v1/message/${msg.ID}`).then((r) => r.json());
      const code = /\b(\d{6})\b/.exec(`${full.Text} ${full.HTML}`)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no code mailed to ${to}`);
}

await step('Account: Ana sets a preference and turns on email codes', async () => {
  const anaEmail = `ana-${stamp}@example.com`;
  await ana.page.goto(`${BASE}/account#preferences`);
  await ana.page.getByLabel('Voice speed').fill('1.25').catch(() => {});
  await ana.page.goto(`${BASE}/account#security`);
  const sent = Date.now() - 2000;
  await ana.page.getByRole('button', { name: /^turn on$/i }).last().click();
  await ana.page.getByLabel('Code from the email').fill(await mailedCode(anaEmail, sent));
  await ana.page.getByRole('button', { name: /^turn on$/i }).click();
  await ana.page.getByText(/email codes on/i).first().waitFor({ timeout: 10000 });
  await snap(ana, 'security');
}, [ana]);

await step('Login with a second factor: Ana logs out and back in with an email code', async () => {
  const anaEmail = `ana-${stamp}@example.com`;
  await ana.page.goto(`${BASE}/account#account`);
  await ana.page.getByRole('button', { name: /log out/i }).first().click();
  await ana.page.goto(`${BASE}/login`);
  await ana.page.getByLabel('Email').fill(anaEmail);
  await ana.page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await ana.page.getByRole('button', { name: /^log in/i }).click();
  await ana.page.getByRole('button', { name: /email me a code/i }).click({ timeout: 15000 });
  const sent = Date.now() - 2000;
  await snap(ana, 'second-factor');
  await ana.page.getByLabel('6-digit code').fill(await mailedCode(anaEmail, sent));
  await ana.page.getByPlaceholder('A topic, e.g. Solana PDAs').or(ana.page.getByRole('tab', { name: /your classes/i })).first().waitFor({ timeout: 15000 });
}, [ana]);

await step('Home: the class is under Your classes, and Gio rejoins a live one', async () => {
  await ana.page.goto(`${BASE}/#classes`);
  await ana.page.getByRole('tabpanel').getByText('Solana PDAs').first().waitFor({ timeout: 10000 });
  await snap(ana, 'your-classes');
  // Gio starts a second class of his own; it shows as waiting, and Rejoin brings him back in
  await gio.page.goto(`${BASE}/#start`);
  await gio.page.getByPlaceholder('A topic, e.g. Solana PDAs').fill('Rust ownership');
  await gio.page.getByRole('button', { name: /start a class/i }).last().click();
  await gio.page.waitForURL(/\/r\/[A-Z0-9]+/, { timeout: 15000 });
  await gio.page.goto(`${BASE}/#classes`);
  await gio.page.getByText('Rust ownership').first().waitFor({ timeout: 10000 });
  await snap(gio, 'your-classes');
  await gio.page.getByText(/^rejoin/i).first().click();
  await gio.page.locator('.live').waitFor({ timeout: 15000 });
}, [ana, gio]);

await browser.close();
console.log(problems.length ? `\nPROBLEMS (${problems.length}):\n  ${[...new Set(problems)].join('\n  ')}` : '\nno problems recorded');
console.log(`screenshots: ${OUT}`);
