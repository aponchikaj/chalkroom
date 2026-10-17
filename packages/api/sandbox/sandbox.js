// API sandbox: several anonymous users in one tab, every endpoint as a form, and the room
// channel (events, rows, presence) as a live feed. Dev only: served when config.sandbox is on.
import { ENDPOINTS, fillPath } from './catalog.js';

const COLORS = ['#f2d16b', '#8fc7e8', '#a8dc9f', '#f4a6c8', '#f6b26b', '#c3a6f4'];
const NAMES = ['Ana', 'Gio', 'Nika', 'Eve', 'Luka', 'Mari'];
const CTX_KEYS = ['roomId', 'code', 'mainStreamId', 'phase', 'segment', 'checkId', 'questionId', 'threadId', 'blockId', 'blockVersion'];

const state = {
  cfg: null,
  users: [],
  active: null,
  ctx: Object.fromEntries(CTX_KEYS.map((k) => [k, k === 'segment' ? 0 : k === 'blockVersion' ? 1 : ''])),
  endpoint: ENDPOINTS[0],
  seen: new Set(),
  feed: [],
  history: [],
};

const $ = (sel) => document.querySelector(sel);
function el(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids) if (k !== null && k !== undefined) n.append(k);
  return n;
}
const json = (v) => JSON.stringify(v, null, 2);
const short = (id) => (id ? String(id).slice(0, 8) : '');

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

const PASSWORD = 'Test-password-123';

function client(n) {
  return window.supabase.createClient(state.cfg.supabaseUrl, state.cfg.anonKey, {
    auth: { persistSession: false, autoRefreshToken: true, storageKey: `sandbox-${n}-${Date.now()}` },
  });
}

/** Sign up a fresh email user (accounts are required; local email confirmations are off). */
async function addUser(name) {
  const n = state.users.length;
  name = name || NAMES[n % NAMES.length] + (n >= NAMES.length ? n : '');
  const color = COLORS[n % COLORS.length];
  const sb = client(n);
  const email = `${name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user'}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const { data, error } = await sb.auth.signUp({ email, password: PASSWORD, options: { data: { display_name: name, color } } });
  if (error || !data.session) return showResponse({ error: `sign-up failed: ${error?.message ?? 'no session (email confirmations on?)'}` });
  return remember({ name, color, email, sb, id: data.user.id, channel: null });
}

/** Log in an existing account (e.g. one made in the web app). */
async function loginUser(email, password) {
  const sb = client(state.users.length);
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return showResponse({ error: `log in failed: ${error.message}` });
  const p = await sb.from('profiles').select('display_name, color').eq('id', data.user.id).single();
  return remember({ name: p.data?.display_name ?? email, color: p.data?.color ?? COLORS[0], email, sb, id: data.user.id, channel: null });
}

function remember(user) {
  state.users.push(user);
  state.active = user;
  renderUsers();
  return user;
}

async function tokenOf(user) {
  const { data } = await user.sb.auth.getSession();
  return data.session?.access_token;
}

function renderUsers() {
  const list = $('#users');
  list.replaceChildren(...state.users.map((u) => el('li', { className: u === state.active ? 'active' : '' },
    el('span', { className: 'dot', style: `background:${u.color}` }),
    el('button', { textContent: u.name, title: 'make active', onclick: () => { state.active = u; renderUsers(); } }),
    el('span', { className: 'id', textContent: u.email ?? short(u.id), title: u.id }),
    el('span', { className: 'id', textContent: u.channel ? 'subscribed' : '' }),
    el('button', { textContent: 'copy token', onclick: async () => navigator.clipboard.writeText(await tokenOf(u)) }),
  )));
  const sel = $('#req-user');
  sel.replaceChildren(...state.users.map((u, i) => el('option', { value: i, textContent: u.name, selected: u === state.active })));
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

function renderCtx() {
  $('#ctx').replaceChildren(...CTX_KEYS.map((k) => el('label', {}, k,
    el('input', { value: state.ctx[k] ?? '', oninput: (e) => { state.ctx[k] = e.target.value; renderRequestLine(); } }))));
}

function setCtx(patch) {
  Object.assign(state.ctx, patch);
  renderCtx();
  renderRequestLine();
}

// ---------------------------------------------------------------------------
// Endpoints and requests
// ---------------------------------------------------------------------------

function renderEndpoints() {
  const groups = [...new Set(ENDPOINTS.map((e) => e.group))];
  $('#endpoints').replaceChildren(...groups.map((g) => el('div', { className: 'group' },
    el('div', { textContent: g }),
    ...ENDPOINTS.filter((e) => e.group === g).map((e) => el('button', {
      className: e === state.endpoint ? 'selected' : '',
      onclick: () => selectEndpoint(e),
    }, el('span', { className: 'm', textContent: e.method }), e.name,
    e.built === false ? el('span', { className: 'tag', textContent: `not built (${e.task})` }) : null)))));
}

function selectEndpoint(e) {
  state.endpoint = e;
  renderEndpoints();
  resetBody();
  $('#req-note').textContent = e.note ?? '';
  $('#req-noauth').checked = e.auth === false;
}

function resetBody() {
  const e = state.endpoint;
  const u = state.active ?? { name: 'Ana', color: COLORS[0] };
  $('#req-body').value = e.body ? json(e.body(u, state.ctx)) : '';
  $('#req-body').disabled = !e.body;
  renderRequestLine();
}

function renderRequestLine() {
  const { path, missing } = fillPath(state.endpoint.path, state.ctx);
  $('#req-line').textContent = `${state.endpoint.method} ${path}${missing.length ? `   (missing: ${missing.join(', ')})` : ''}`;
}

async function call(user, method, path, body, { auth = true } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (auth && user) headers.authorization = `Bearer ${await tokenOf(user)}`;
  const t0 = performance.now();
  const r = await fetch(path, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
  const ms = Math.round(performance.now() - t0);
  const text = await r.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch { /* plain text */ }
  return { status: r.status, ms, data };
}

async function send() {
  const e = state.endpoint;
  const { path, missing } = fillPath(e.path, state.ctx);
  if (missing.length) return showResponse({ error: `fill the context first: ${missing.join(', ')}` });
  let body;
  if (e.body) {
    try { body = JSON.parse($('#req-body').value || '{}'); } catch (err) { return showResponse({ error: `body is not JSON: ${err.message}` }); }
  }
  const user = state.users[Number($('#req-user').value)] ?? null;
  const auth = !$('#req-noauth').checked;
  if (auth && !user) return showResponse({ error: 'add a user first (or tick "no token")' });
  const res = await call(user, e.method, path, body, { auth });
  showResponse(res, `${e.method} ${path} as ${auth ? user.name : 'nobody'}`);
  record(e, path, user, auth, body, res);
  if (res.status < 300) await learn(e, user, res.data);
}

function showResponse(res, title = '') {
  const out = $('#response');
  out.className = res.status ? `s${String(res.status)[0]}` : 's4';
  out.textContent = res.status ? `${title}\n${res.status} in ${res.ms} ms\n\n${json(res.data)}` : json(res);
}

function record(e, path, user, auth, body, res) {
  const item = { e, path, user, auth, body, res };
  state.history.unshift(item);
  const li = el('li', { className: `s${String(res.status)[0]}`, onclick: () => showResponse(res, `${e.method} ${path}`) },
    `${res.status}  ${e.method} ${path}  (${auth ? user.name : 'no token'}, ${res.ms} ms)`);
  $('#history').prepend(li);
}

/** Pull ids out of responses into the context; subscribe members to the room channel. */
async function learn(e, user, data) {
  if (e.learn === 'room' && data?.room) {
    const r = data.room;
    setCtx({ roomId: r.id, code: r.invite_code, mainStreamId: r.main_stream_id, phase: r.phase, segment: r.segment });
    await subscribe(user, r.id);
  } else if (e.learn === 'question' && data?.id) setCtx({ questionId: data.id });
  else if (e.learn === 'thread' && data?.id) setCtx({ threadId: data.id });
}

// ---------------------------------------------------------------------------
// Realtime: events, rows, presence
// ---------------------------------------------------------------------------

async function subscribe(user, roomId) {
  if (user.channel) await user.sb.removeChannel(user.channel);
  user.sb.realtime.setAuth(await tokenOf(user));
  const ch = user.sb.channel(`room:${roomId}`, { config: { private: true, presence: { key: user.id } } });
  user.channel = ch;
  ch.on('broadcast', { event: 'event' }, ({ payload }) => onEvent(payload))
    .on('broadcast', { event: 'row' }, ({ payload }) => onRow(payload))
    .on('presence', { event: 'sync' }, () => renderPresence())
    .subscribe(async (status, err) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ userId: user.id, name: user.name, color: user.color, threadId: null, typing: false, onlineAt: new Date().toISOString() });
        renderUsers();
      } else if (status === 'CHANNEL_ERROR') pushFeed('error', `${user.name} channel`, { error: err?.message ?? status });
    });
}

function onEvent(ev) {
  const key = `e:${ev.stream_id}:${ev.seq}`;
  if (state.seen.has(key)) return;
  state.seen.add(key);
  if (ev.kind === 'check') setCtx({ checkId: ev.data.checkId, segment: ev.data.segment });
  if (ev.kind === 'segment_start') setCtx({ segment: ev.data.segment });
  const stream = ev.stream_id === state.ctx.mainStreamId ? 'main' : `stream ${short(ev.stream_id)}`;
  pushFeed('event', `${ev.kind}  #${ev.seq}  ${stream}  by ${ev.actor.length > 12 ? short(ev.actor) : ev.actor}`, ev);
}

function onRow(change) {
  const key = `r:${change.table}:${change.op}:${JSON.stringify(change.row)}`;
  if (state.seen.has(key)) return;
  state.seen.add(key);
  const r = change.row;
  if (change.table === 'rooms') setCtx({ phase: r.phase, segment: r.segment });
  if (change.table === 'note_blocks') setCtx({ blockId: r.id, blockVersion: r.version });
  if (change.table === 'threads' && r.owner_id === state.active?.id) setCtx({ threadId: r.id });
  const extra = r.status ? ` ${r.status}` : r.phase ? ` ${r.phase}` : '';
  pushFeed('row', `${change.table} ${change.op}${extra}`, change);
}

function pushFeed(type, label, data) {
  state.feed.unshift({ type, label, data, t: new Date().toLocaleTimeString() });
  renderFeed();
}

function renderFeed() {
  const showE = $('#f-events').checked, showR = $('#f-rows').checked, q = $('#f-text').value.toLowerCase();
  const items = state.feed.filter((f) => (f.type !== 'event' || showE) && (f.type !== 'row' || showR)
    && (!q || f.label.toLowerCase().includes(q) || JSON.stringify(f.data).toLowerCase().includes(q))).slice(0, 300);
  $('#feed').replaceChildren(...items.map((f) => {
    const li = el('li', {}, el('span', { className: 't', textContent: `${f.t}  ${f.type}  ` }), el('span', { className: 'k', textContent: f.label }), el('pre', { textContent: json(f.data) }));
    li.onclick = () => li.classList.toggle('open');
    return li;
  }));
}

function renderPresence() {
  const listener = state.users.find((u) => u.channel);
  if (!listener) return;
  const ps = listener.channel.presenceState();
  $('#presence-who').textContent = `seen by ${listener.name}`;
  $('#presence').replaceChildren(...Object.values(ps).map((v) => {
    const p = v[0];
    return el('li', {}, el('span', { className: 'dot', style: `background:${p.color}` }), `${p.name}  ${short(p.userId)}${p.threadId ? '  in a thread' : ''}`);
  }));
}

// ---------------------------------------------------------------------------
// Bulk actions and snapshot
// ---------------------------------------------------------------------------

async function bulk(kind) {
  const { roomId, code, checkId, segment } = state.ctx;
  const results = [];
  for (const u of state.users) {
    let res;
    if (kind === 'join') {
      if (u.channel) continue;
      res = await call(u, 'POST', '/rooms/join', { inviteCode: code, displayName: u.name, color: u.color });
      if (res.status < 300) await subscribe(u, res.data.room.id);
    } else if (kind === 'ready') res = await call(u, 'POST', `/rooms/${roomId}/ready`, { segment: Number(segment) });
    else if (kind === 'answer') {
      let answer;
      try { answer = JSON.parse($('#bulk-answer').value); } catch { answer = $('#bulk-answer').value; }
      res = await call(u, 'POST', `/rooms/${roomId}/checks/${checkId}/answer`, { answer });
    }
    results.push({ user: u.name, status: res.status, data: res.data });
  }
  showResponse({ status: 200, ms: 0, data: results }, `bulk ${kind}`);
}

const SNAPSHOT_TABLES = ['rooms', 'room_members', 'questions', 'clusters', 'threads', 'ready_votes', 'check_answers', 'reactions', 'note_blocks'];

async function snapshot() {
  const u = state.active, roomId = state.ctx.roomId;
  if (!u || !roomId) return showResponse({ error: 'needs an active user and a roomId' });
  const out = {};
  for (const t of SNAPSHOT_TABLES) {
    const r = await u.sb.from(t).select('*').eq(t === 'rooms' ? 'id' : 'room_id', roomId);
    out[t] = r.error ? { error: r.error.message } : r.data;
  }
  const ev = await u.sb.from('events').select('stream_id, seq, kind, actor').eq('room_id', roomId).order('seq');
  out.events = ev.error ? { error: ev.error.message } : ev.data;
  showResponse({ status: 200, ms: 0, data: out }, `snapshot as ${u.name} (what RLS lets this user read)`);
}

// ---------------------------------------------------------------------------

async function init() {
  try {
    state.cfg = await (await fetch('config.json')).json();
  } catch {
    $('#status').textContent = 'could not load config.json: is the API running with the sandbox on?';
    return;
  }
  if (!state.cfg.anonKey) {
    $('#status').textContent = 'VITE_SUPABASE_ANON_KEY is missing from the API env (run npm run env).';
    return;
  }
  $('#status').textContent = `Supabase ${state.cfg.supabaseUrl}  ·  model ${state.cfg.model}`;
  renderCtx();
  renderEndpoints();
  selectEndpoint(ENDPOINTS[0]);
  $('#add-user').onsubmit = async (e) => { e.preventDefault(); await addUser($('#user-name').value.trim()); $('#user-name').value = ''; resetBody(); };
  $('#login-user').onsubmit = async (e) => { e.preventDefault(); await loginUser($('#login-email').value.trim(), $('#login-password').value); resetBody(); };
  $('#send').onclick = send;
  $('#reset-body').onclick = resetBody;
  $('#req-user').onchange = (e) => { state.active = state.users[Number(e.target.value)]; renderUsers(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } });
  for (const b of document.querySelectorAll('[data-bulk]')) b.onclick = () => bulk(b.dataset.bulk);
  $('#snapshot').onclick = snapshot;
  for (const id of ['#f-events', '#f-rows', '#f-text']) $(id).oninput = renderFeed;
  $('#f-clear').onclick = () => { state.feed = []; renderFeed(); };
}

init();
