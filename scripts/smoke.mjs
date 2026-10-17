// End-to-end smoke test against a running stack (Supabase + API in mock mode):
//   two anonymous users → create + join → both subscribe to the private room channel →
//   host starts → board events arrive in seq order → both answer the check and vote ready →
//   check_closed with the spread → next segment starts. Exercises RLS, realtime auth,
//   append_event, the broadcast triggers and the conductor's gate.
// Usage: npm run db:start && npm run env && npm run dev:api   (other terminal)  →  npm run smoke
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const API = env.VITE_API_URL ?? 'http://localhost:3001';
const step = (m) => console.log(`• ${m}`);
const fail = (m) => { console.error(`FAILED: ${m}`); process.exit(1); };
const waitRow = (u, pred, what, ms = 15000) => Promise.race([
  new Promise((resolve) => { const t = setInterval(() => { const hit = u.rows.find(pred); if (hit) { clearInterval(t); resolve(hit); } }, 100); }),
  timeout(ms, `${u.name}: ${what}`),
]);
const timeout = (ms, what) => new Promise((_, rej) => setTimeout(() => rej(new Error(`timed out waiting for ${what}`)), ms));

async function user(name, color) {
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  // accounts are required: a fresh email user (local email confirmations are off)
  const email = `${name.toLowerCase()}-${Math.random().toString(36).slice(2, 10)}@example.com`;
  const { data, error } = await sb.auth.signUp({ email, password: 'Test-password-123', options: { data: { display_name: name, color } } });
  if (error || !data.session) fail(`sign-up: ${error?.message ?? 'no session (are local email confirmations off?)'}`);
  const token = data.session.access_token;
  const call = async (method, path, body) => {
    const r = await fetch(`${API}${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) });
    if (!r.ok) fail(`${name} ${method} ${path} → ${r.status} ${await r.text()}`);
    return r.status === 204 ? null : r.json();
  };
  return { sb, token, id: data.user.id, name, color, call, events: [], rows: [] };
}

function subscribe(u, roomId) {
  return new Promise((resolve, reject) => {
    u.sb.realtime.setAuth(u.token);
    const ch = u.sb.channel(`room:${roomId}`, { config: { private: true } })
      .on('broadcast', { event: 'event' }, ({ payload }) => u.events.push(payload))
      .on('broadcast', { event: 'row' }, ({ payload }) => u.rows.push(payload))
      .subscribe((s, err) => { if (s === 'SUBSCRIBED') resolve(ch); else if (s === 'CHANNEL_ERROR') reject(new Error(`${u.name} channel: ${err?.message ?? s}`)); });
  });
}

const waitFor = (u, pred, what, ms = 30000) => Promise.race([
  new Promise((resolve) => { const t = setInterval(() => { const hit = u.events.find(pred); if (hit) { clearInterval(t); resolve(hit); } }, 100); }),
  timeout(ms, `${u.name}: ${what}`),
]);

try {
  const health = await fetch(`${API}/health`).then((r) => r.json()).catch(() => fail(`API not reachable at ${API}`));
  step(`API up (model: ${health.model})`);

  const ana = await user('Ana', '#f2d16b');
  const gio = await user('Gio', '#8fc7e8');
  const { room } = await ana.call('POST', '/rooms', { title: 'Solana PDAs', displayName: 'Ana', color: ana.color });
  step(`room ${room.invite_code} created`);
  await gio.call('POST', '/rooms/join', { inviteCode: room.invite_code, displayName: 'Gio', color: gio.color });
  step('Gio joined');

  // RLS: a stranger must not read the room
  const eve = await user('Eve', '#f4a6c8'); // a stranger
  const peek = await eve.sb.from('rooms').select('id').eq('id', room.id);
  if (peek.data?.length) fail('RLS: a non-member could read the room');
  step('RLS hides the room from non-members');

  const chA = await subscribe(ana, room.id);
  const chG = await subscribe(gio, room.id);
  step('both subscribed to the private channel');

  await ana.call('POST', `/rooms/${room.id}/start`, {});
  const check = await waitFor(gio, (e) => e.kind === 'check', 'the first check');
  const board = gio.events.filter((e) => e.kind === 'board');
  if (!board.length) fail('no board events before the check');
  if ('answer' in check.data.question) fail('the check leaked its answer');
  const seqs = gio.events.map((e) => e.seq);
  if (seqs.some((s, i) => s !== i + 1)) fail(`seq not gap-free/in order: ${seqs.join(',')}`);
  step(`segment 0 streamed: ${board.length} board events, seq 1..${seqs.at(-1)}`);

  await ana.call('POST', `/rooms/${room.id}/checks/${check.data.checkId}/answer`, { answer: 1 });
  await gio.call('POST', `/rooms/${room.id}/checks/${check.data.checkId}/answer`, { answer: 0 });
  await gio.call('POST', `/rooms/${room.id}/questions`, { text: 'Why can a PDA not sign?' });
  await ana.call('POST', `/rooms/${room.id}/questions`, { text: "Why can't a PDA sign transactions?" });
  if (!gio.rows.length) await new Promise((r) => setTimeout(r, 500));
  await ana.call('POST', `/rooms/${room.id}/ready`, { segment: 0 });
  await gio.call('POST', `/rooms/${room.id}/ready`, { segment: 0 });
  const closed = await waitFor(ana, (e) => e.kind === 'check_closed', 'check_closed');
  if (closed.data.spread.total !== 2 || closed.data.spread.correct !== 1) fail(`unexpected spread ${JSON.stringify(closed.data.spread)}`);
  step(`gate passed: ${closed.data.spread.correct}/${closed.data.spread.total} got it`);
  await waitRow(ana, (r) => r.table === 'clusters' && r.row.route === 'class' && r.row.asker_count === 2, 'a grouped class cluster');
  const qa = await waitFor(gio, (e) => e.kind === 'answer_cluster', 'the Q&A beat answer');
  if (!['Ana', 'Gio'].every((n) => qa.data.askers.includes(n))) fail(`Q&A credit missing an asker: ${qa.data.askers.join(', ')}`);
  step(`triage grouped 2 questions; Q&A credited ${qa.data.askers.join(' and ')}`);
  await waitFor(ana, (e) => e.kind === 'segment_start' && e.data.segment === 1, 'segment 1');
  step('segment 1 started');

  const thread = await gio.call('POST', `/rooms/${room.id}/threads`, { topic: 'bump seeds' });
  await gio.call('POST', `/threads/${thread.id}/messages`, { text: 'Why does it start at 255?' });
  await waitFor(gio, (e) => e.stream_id === thread.stream_id && e.kind === 'chat' && e.data.role === 'tutor' && e.seq >= 3, 'the thread tutor reply');
  step('thread opened; the thread tutor replied');
  const check2 = await waitFor(ana, (e) => e.kind === 'check' && e.data.segment === 1, 'the second check');
  await waitRow(ana, (r) => r.table === 'rooms' && r.row.phase === 'check' && r.row.segment === 1, 'the gate of segment 1');
  await ana.call('POST', `/rooms/${room.id}/ready`, { segment: 1 });
  await waitFor(ana, (e) => e.kind === 'check_closed' && e.data.checkId === check2.data.checkId, 'gate 2 without the thread owner');
  step('gate passed while Gio was in a thread');
  await gio.call('POST', `/threads/${thread.id}/close`, {});

  const tables = new Set(ana.rows.map((r) => r.table));
  for (const t of ['rooms', 'ready_votes', 'questions', 'check_answers']) if (!tables.has(t)) fail(`no "${t}" row broadcast received`);
  if (ana.rows.some((r) => r.table === 'check_answers' && 'answer' in r.row)) fail('check_answers broadcast leaked an answer');
  step(`row broadcasts received: ${[...tables].join(', ')}`);

  await ana.call('POST', `/rooms/${room.id}/host`, { action: 'end' });
  await waitFor(gio, (e) => e.kind === 'notice' && /ended/i.test(e.data.text), 'class end');
  step('host ended the class');
  await Promise.all([ana.sb.removeChannel(chA), gio.sb.removeChannel(chG)]);
  console.log('PASSED: smoke test');
  process.exit(0);
} catch (e) {
  fail(e.message);
}
