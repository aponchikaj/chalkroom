// Latency benchmark against a running stack (local Supabase + API). Prints a Markdown table of
// p50 / p95 / max in milliseconds for each route and for the key moments of a class.
// Usage: npm run bench            (API must run: npm run dev:api; mock tutor for stable numbers)
//        BENCH_N=50 npm run bench (samples per route, default 20)
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(readFileSync(process.env.SMOKE_ENV ?? '.env', 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const API = env.VITE_API_URL ?? 'http://localhost:3001';
const N = Number(process.env.BENCH_N ?? 20);
const rows = [];

const pct = (xs, p) => xs[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))];
function record(name, samples, note = '') {
  const s = [...samples].sort((a, b) => a - b);
  rows.push({ name, n: s.length, p50: pct(s, 50), p95: pct(s, 95), max: s.at(-1), note });
}
const ms = (t0) => Math.round(performance.now() - t0);

async function signUp(name) {
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const t0 = performance.now();
  const { data, error } = await sb.auth.signUp({ email: `${name}-${Math.random().toString(36).slice(2, 10)}@example.com`, password: 'Test-password-123', options: { data: { display_name: name } } });
  if (error) throw new Error(error.message);
  return { sb, id: data.user.id, token: data.session.access_token, name, t: ms(t0), events: [] };
}
async function call(u, method, path, body) {
  const t0 = performance.now();
  const r = await fetch(`${API}${path}`, { method, headers: { 'content-type': 'application/json', ...(u ? { authorization: `Bearer ${u.token}` } : {}) }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
  const t = ms(t0);
  const text = await r.text();
  if (r.status >= 400) throw new Error(`${method} ${path} -> ${r.status} ${text}`);
  return { t, body: text ? JSON.parse(text) : null };
}
async function times(fn) { const out = []; for (let i = 0; i < N; i++) out.push(await fn(i)); return out; }
function subscribe(u, roomId) {
  return new Promise((resolve) => {
    u.sb.realtime.setAuth(u.token);
    const ch = u.sb.channel(`room:${roomId}`, { config: { private: true, presence: { key: u.id } } })
      .on('broadcast', { event: 'event' }, ({ payload }) => u.events.push({ ...payload, at: performance.now() }))
      .subscribe(async (s) => { if (s === 'SUBSCRIBED') { await ch.track({ userId: u.id, name: u.name }); resolve(ch); } });
  });
}
const until = (u, pred, max = 30000) => new Promise((resolve, reject) => {
  const t0 = Date.now();
  const tick = setInterval(() => { const hit = u.events.find(pred); if (hit) { clearInterval(tick); resolve(hit); } else if (Date.now() - t0 > max) { clearInterval(tick); reject(new Error('timeout')); } }, 5);
});

const health = await fetch(`${API}/health`).then((r) => r.json()).catch(() => null);
if (!health) { console.error(`API not reachable at ${API}`); process.exit(1); }

// accounts
const signups = [];
for (let i = 0; i < Math.min(N, 10); i++) signups.push((await signUp('bench')).t);
record('Sign up (Supabase Auth)', signups, 'email + password, confirmations off locally');
const ana = await signUp('Ana');
const gio = await signUp('Gio');

record('GET /health', await times(async () => (await call(null, 'GET', '/health')).t));
record('GET /me', await times(async () => (await call(ana, 'GET', '/me')).t), 'profile + settings + email');
record('PATCH /me/settings', await times(async (i) => (await call(ana, 'PATCH', '/me/settings', { voiceRate: 1 + (i % 2) / 4 })).t));
record('PATCH /me', await times(async (i) => (await call(ana, 'PATCH', '/me', { bio: `bench ${i}` })).t));

// rooms
const created = [];
const createTimes = await times(async () => { const r = await call(ana, 'POST', '/rooms', { title: 'Bench' }); created.push(r.body.room); return r.t; });
record('POST /rooms', createTimes, 'room + main stream + host member');
record('GET /rooms/code/:code', await times(async (i) => (await call(null, 'GET', `/rooms/code/${created[i].invite_code}`)).t));
record('POST /rooms/join', await times(async (i) => (await call(gio, 'POST', '/rooms/join', { inviteCode: created[i].invite_code })).t));
const asks = [];
for (let i = 0; i < Math.min(N, 6); i++) asks.push((await call(gio, 'POST', `/rooms/${created[i].id}/questions`, { text: `q ${i}` })).t);
record('POST /rooms/:id/questions', asks, 'max 6 samples: rate limit is 6/min per user');

// a class (mock tutor)
const room = created[0];
await Promise.all([subscribe(ana, room.id), subscribe(gio, room.id)]);
const t0 = performance.now();
await call(ana, 'POST', `/rooms/${room.id}/start`);
const firstBoard = await until(gio, (e) => e.kind === 'board');
const check = await until(gio, (e) => e.kind === 'check');
record('Start -> first board event (realtime)', [Math.round(firstBoard.at - t0)], `model: ${health.model}`);
record('Start -> check of segment 0', [Math.round(check.at - t0)], 'whole first segment');
await call(ana, 'POST', `/rooms/${room.id}/checks/${check.data.checkId}/answer`, { answer: 1 });
await call(gio, 'POST', `/rooms/${room.id}/checks/${check.data.checkId}/answer`, { answer: 0 });
await new Promise((r) => setTimeout(r, 300)); // phase reaches check
await call(ana, 'POST', `/rooms/${room.id}/ready`, { segment: 0 });
const tReady = performance.now();
await call(gio, 'POST', `/rooms/${room.id}/ready`, { segment: 0 });
const closed = await until(gio, (e) => e.kind === 'check_closed');
record('Last ready vote -> check_closed (realtime)', [Math.round(closed.at - tReady)], 'gate pass + spread');
const next = await until(gio, (e) => e.kind === 'segment_start' && e.data.segment === 1);
record('Last ready vote -> next segment starts', [Math.round(next.at - tReady)], 'includes the Q&A beat');
const nextBoard = await until(gio, (e) => e.kind === 'board' && e.at > next.at);
record('Next segment start -> its first board event', [Math.round(nextBoard.at - next.at)], 'pipelined: written during the gate');
await call(ana, 'POST', `/rooms/${room.id}/host`, { action: 'end' });

for (const r of created) await call(ana, 'POST', `/rooms/${r.id}/host`, { action: 'end' }).catch(() => undefined);

console.log(`\nAPI ${API}, model ${health.model}, ${N} samples per route, ${new Date().toISOString()}\n`);
console.log('| Measure | n | p50 ms | p95 ms | max ms | Note |\n|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.name} | ${r.n} | ${r.p50} | ${r.p95} | ${r.max} | ${r.note} |`);
process.exit(0);
