// Accounts (B9): profile from the signup trigger, GET /me, rooms that default to the profile,
// and the accounts-required switch (a second API started with REQUIRE_ACCOUNT=1).
import { spawn, type ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { CreateRoomRes, JoinRoomRes, MeRes } from '@chalk/schema';
import { ROOT, api, createRoom, env, newUser, sleep } from './helpers';

describe('GET /me', () => {
  it('returns the profile the signup trigger created, with the email', async () => {
    const ana = await newUser('Ana');
    const r = await api<MeRes>(ana, 'GET', '/me');
    expect(r.status).toBe(200);
    expect(r.body.profile).toMatchObject({ id: ana.id, display_name: 'Ana', color: ana.color, bio: '', avatar_path: null });
    expect(r.body.profile.username).toMatch(/^ana[a-z0-9_]*$/);
    expect(r.body.email).toBe(ana.email);
    expect(r.body.avatarUrl).toBeNull();
    expect(r.body.security).toEqual({ totp: false, email2fa: false, aal: 'aal1', mfaPassed: true });
  });

  it('returns 401 without a token', async () => {
    expect((await api(null, 'GET', '/me')).status).toBe(401);
  });
});

describe('rooms default to the profile', () => {
  it('creates a room without a display name or color', async () => {
    const ana = await newUser('Ana');
    const r = await api<CreateRoomRes>(ana, 'POST', '/rooms', { title: 'No name sent' });
    expect(r.status).toBe(201);
    const m = await ana.sb.from('room_members').select('display_name, color').eq('room_id', r.body.room.id);
    expect(m.data).toEqual([{ display_name: 'Ana', color: ana.color }]);
  });

  it('joins with the profile name, and a body name still wins for that room', async () => {
    const host = await newUser('Host');
    const gio = await newUser('Gio');
    const { room } = await createRoom(host);
    const plain = await api<JoinRoomRes>(gio, 'POST', '/rooms/join', { inviteCode: room.invite_code });
    expect(plain.status).toBe(201);
    expect(plain.body.member).toMatchObject({ display_name: 'Gio', color: gio.color });
    const named = await api<JoinRoomRes>(gio, 'POST', '/rooms/join', { inviteCode: room.invite_code, displayName: 'Giorgi' });
    expect(named.body.member.display_name).toBe('Giorgi');
    // the profile itself is not changed by a room nickname
    expect((await api<MeRes>(gio, 'GET', '/me')).body.profile.display_name).toBe('Gio');
  });
});

describe('REQUIRE_ACCOUNT=1', () => {
  const PORT = 3102;
  const url = `http://localhost:${PORT}`;
  let child: ChildProcess;

  beforeAll(async () => {
    child = spawn('npm', ['run', 'start', '-w', '@chalk/api'], {
      cwd: ROOT, detached: true, stdio: ['ignore', 'ignore', 'inherit'],
      // RESUME_ROOMS=0: this instance must not drive rooms the main API runs
      env: { ...process.env, MODEL: 'mock', API_PORT: String(PORT), REQUIRE_ACCOUNT: '1', SANDBOX: '0', RESUME_ROOMS: '0' },
    });
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${url}/health`)).ok) return; } catch { /* starting */ }
      await sleep(500);
    }
    throw new Error('second API did not start');
  });
  afterAll(() => { if (child?.pid) try { process.kill(-child.pid, 'SIGTERM'); } catch { /* gone */ } });

  const call = (token: string, path: string, body: unknown) =>
    fetch(`${url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });

  it('refuses anonymous sessions with 403', async () => {
    const anon = createClient(env.VITE_SUPABASE_URL!, env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data } = await anon.auth.signInAnonymously();
    const r = await call(data.session!.access_token, '/rooms', { title: 'x' });
    expect(r.status).toBe(403);
    expect(((await r.json()) as { message: string }).message).toMatch(/account is required/);
  });

  it('lets account holders through', async () => {
    const ana = await newUser('Ana');
    expect((await call(ana.token, '/rooms', { title: 'x' })).status).toBe(201);
  });
});
