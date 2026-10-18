// Helpers for the API end-to-end suite: real anonymous users, real HTTP, real realtime.
// Runs against the local stack (npm run db:start && npm run env); see vitest.e2e.config.ts.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { CreateRoomRes, JoinRoomRes, RowChange, StreamEvent } from '@chalk/schema';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function readEnv(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/)
    .filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
}

export const env: Record<string, string | undefined> = { ...readEnv(`${ROOT}.env`), ...readEnv(`${ROOT}.env.local`), ...process.env };
export const API = process.env.E2E_API_URL ?? env.E2E_API_URL ?? env.VITE_API_URL ?? 'http://localhost:3001';

const COLORS = ['#f2d16b', '#8fc7e8', '#a8dc9f', '#f4a6c8', '#f6b26b', '#c3a6f4'];
let made = 0;

export interface TestUser {
  name: string;
  color: string;
  email: string;
  id: string;
  token: string;
  sb: SupabaseClient;
  events: StreamEvent[];
  rows: RowChange[];
  channel?: RealtimeChannel;
}

export const TEST_PASSWORD = 'Test-password-123';

/** A fresh email account (accounts are required). Local email confirmations are off, so signup returns a session. */
export async function newUser(name = 'User'): Promise<TestUser> {
  const sb = createClient(env.VITE_SUPABASE_URL!, env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const color = COLORS[made++ % COLORS.length];
  const email = `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const { data, error } = await sb.auth.signUp({ email, password: TEST_PASSWORD, options: { data: { display_name: name, color } } });
  if (error || !data.session || !data.user) throw new Error(`sign-up: ${error?.message ?? 'no session (are local email confirmations off?)'}`);
  return { name, color, email, id: data.user.id, token: data.session.access_token, sb, events: [], rows: [] };
}

export interface ApiResult<T = any> { status: number; body: T }

/** One HTTP call. Never throws on a status: tests assert on it. `token` overrides the user's. */
export async function api<T = any>(u: TestUser | null, method: string, path: string, body?: unknown, token?: string): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const bearer = token ?? u?.token;
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  const r = await fetch(`${API}${path}`, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
  const text = await r.text();
  let parsed: unknown = text;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  return { status: r.status, body: parsed as T };
}

export async function createRoom(host: TestUser, title = 'Solana PDAs'): Promise<CreateRoomRes> {
  const r = await api<CreateRoomRes>(host, 'POST', '/rooms', { title, displayName: host.name, color: host.color });
  if (r.status !== 201) throw new Error(`create room: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

export async function joinRoom(u: TestUser, inviteCode: string): Promise<JoinRoomRes> {
  const r = await api<JoinRoomRes>(u, 'POST', '/rooms/join', { inviteCode, displayName: u.name, color: u.color });
  // 201 for a new member, 200 for one coming back
  if (r.status !== 201 && r.status !== 200) throw new Error(`join room: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

/** Subscribe to the private room channel and track presence, like the web client does. */
export function subscribe(u: TestUser, roomId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    u.sb.realtime.setAuth(u.token);
    const ch = u.sb.channel(`room:${roomId}`, { config: { private: true, presence: { key: u.id } } });
    u.channel = ch;
    ch.on('broadcast', { event: 'event' }, ({ payload }) => u.events.push(payload as StreamEvent))
      .on('broadcast', { event: 'row' }, ({ payload }) => u.rows.push(payload as RowChange))
      .subscribe(async (status, err) => {
        if (status === 'SUBSCRIBED') {
          await ch.track({ userId: u.id, name: u.name, color: u.color, threadId: null, typing: false, onlineAt: new Date().toISOString() });
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(`${u.name} channel: ${err?.message ?? status}`));
      });
  });
}

/** Resolve with the first item matching `pred`, polling `list()`; reject after `ms`. */
export function waitFor<T>(list: () => T[], pred: (x: T) => boolean, what: string, ms = 15_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = setInterval(() => {
      const hit = list().find(pred);
      if (hit) { clearInterval(tick); resolve(hit); }
      else if (Date.now() - t0 > ms) { clearInterval(tick); reject(new Error(`timed out after ${ms} ms waiting for ${what}`)); }
    }, 50);
  });
}

export const waitEvent = (u: TestUser, pred: (e: StreamEvent) => boolean, what: string, ms?: number) => waitFor(() => u.events, pred, `${u.name}: ${what}`, ms);
export const waitRow = (u: TestUser, pred: (r: RowChange) => boolean, what: string, ms?: number) => waitFor(() => u.rows, pred, `${u.name}: ${what}`, ms);

/** The room is at the check of `segment`: ready votes are accepted now. */
export const atCheck = (u: TestUser, segment: number) =>
  waitRow(u, (r) => r.table === 'rooms' && r.row.phase === 'check' && r.row.segment === segment, `the check of segment ${segment}`);

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function closeAll(users: TestUser[]) {
  await Promise.all(users.map((u) => (u.channel ? u.sb.removeChannel(u.channel) : undefined)));
}
