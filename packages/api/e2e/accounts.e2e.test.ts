// Accounts (B9): profile from the signup trigger, GET /me, rooms that default to the profile,
// and accounts being required (no anonymous sign-in, password rules).
import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { CreateRoomRes, JoinRoomRes, MeRes } from '@chalk/schema';
import { api, createRoom, env, newUser } from './helpers';

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

describe('accounts are required', () => {
  it('refuses anonymous sign-in', async () => {
    const anon = createClient(env.VITE_SUPABASE_URL!, env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data, error } = await anon.auth.signInAnonymously();
    expect(data.session).toBeNull();
    expect(error?.message).toMatch(/anonymous/i);
  });

  it('enforces the password rules on signup', async () => {
    const sb = createClient(env.VITE_SUPABASE_URL!, env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    for (const password of ['short1A', 'alllowercase123', 'NoDigitsHereAtAll']) {
      const { error } = await sb.auth.signUp({ email: `weak-${crypto.randomUUID().slice(0, 8)}@example.com`, password });
      expect(error, password).toBeTruthy();
    }
  });
});
