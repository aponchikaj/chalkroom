// Profiles, profile pictures, settings, public profiles and account deletion (B10).
import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type AvatarUploadRes, type MeRes, type ProfileRow, type PublicProfile, type UserSettings } from '@chalk/schema';
import { api, closeAll, createRoom, env, joinRoom, newUser, type TestUser } from './helpers';

const users: TestUser[] = [];
const user = async (name: string) => { const u = await newUser(name); users.push(u); return u; };
afterAll(() => closeAll(users));

// 1x1 PNG
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
const publicUrl = (path: string) => `${env.VITE_SUPABASE_URL}/storage/v1/object/public/avatars/${path}`;

async function uploadAvatar(u: TestUser, bytes = PNG, contentType = 'image/png') {
  const up = await api<AvatarUploadRes>(u, 'POST', '/me/avatar/upload-url', { contentType: 'image/png' });
  expect(up.status).toBe(201);
  const put = await u.sb.storage.from('avatars').uploadToSignedUrl(up.body.path, up.body.token, bytes, { contentType });
  return { path: up.body.path, error: put.error };
}

describe('PATCH /me', () => {
  it('updates username, display name, color and bio', async () => {
    const ana = await user('Ana');
    const name = `Ana_${crypto.randomUUID().slice(0, 6)}`;
    const r = await api<ProfileRow>(ana, 'PATCH', '/me', { username: name, displayName: 'Ana K', color: '#a8dc9f', bio: 'Learning Solana.' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ username: name, display_name: 'Ana K', color: '#a8dc9f', bio: 'Learning Solana.' });
  });

  it('returns 409 for a username taken in another case', async () => {
    const ana = await user('Ana');
    const gio = await user('Gio');
    const name = `taken_${crypto.randomUUID().slice(0, 6)}`;
    await api(ana, 'PATCH', '/me', { username: name });
    const r = await api(gio, 'PATCH', '/me', { username: name.toUpperCase() });
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/taken/);
  });

  it.each([
    ['an empty body', {}],
    ['a bad username', { username: 'no spaces' }],
    ['a bio over 280 characters', { bio: 'x'.repeat(281) }],
    ['a bad color', { color: 'blue' }],
  ])('returns 400 for %s', async (_c, body) => {
    const ana = await user('Ana');
    expect((await api(ana, 'PATCH', '/me', body)).status).toBe(400);
  });
});

describe('settings', () => {
  it('starts with the defaults, saves a subset, and GET /me includes them', async () => {
    const ana = await user('Ana');
    expect((await api<UserSettings>(ana, 'GET', '/me/settings')).body).toEqual(DEFAULT_SETTINGS);
    const r = await api<UserSettings>(ana, 'PATCH', '/me/settings', { theme: 'dark', voiceRate: 1.25, tutorVoice: false });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark', voiceRate: 1.25, tutorVoice: false });
    const again = await api<UserSettings>(ana, 'PATCH', '/me/settings', { language: 'ka' });
    expect(again.body).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark', voiceRate: 1.25, tutorVoice: false, language: 'ka' });
    expect((await api<MeRes>(ana, 'GET', '/me')).body.settings).toEqual(again.body);
  });

  it.each([
    ['an empty body', {}],
    ['a voice rate above 2', { voiceRate: 3 }],
    ['an unknown theme', { theme: 'neon' }],
    ['an unknown language', { language: 'fr' }],
  ])('returns 400 for %s', async (_c, body) => {
    const ana = await user('Ana');
    expect((await api(ana, 'PATCH', '/me/settings', body)).status).toBe(400);
  });
});

describe('profile picture', () => {
  it('uploads through a signed URL, commits, and replaces the old file', async () => {
    const ana = await user('Ana');
    const first = await uploadAvatar(ana);
    expect(first.error).toBeNull();
    const done = await api<MeRes>(ana, 'POST', '/me/avatar', { path: first.path });
    expect(done.status).toBe(200);
    expect(done.body.profile.avatar_path).toBe(first.path);
    expect(done.body.avatarUrl).toBe(publicUrl(first.path));
    expect((await fetch(publicUrl(first.path))).status).toBe(200);

    const second = await uploadAvatar(ana);
    await api(ana, 'POST', '/me/avatar', { path: second.path });
    expect((await fetch(publicUrl(first.path))).status).toBe(400); // old file removed
    expect((await fetch(publicUrl(second.path))).status).toBe(200);
  });

  it('refuses a GIF at Storage', async () => {
    const ana = await user('Ana');
    const gif = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), (c) => c.charCodeAt(0));
    expect((await uploadAvatar(ana, gif, 'image/gif')).error).toBeTruthy();
  });

  it('refuses committing another user\'s path or a missing file (400)', async () => {
    const ana = await user('Ana');
    const gio = await user('Gio');
    const mine = await uploadAvatar(ana);
    expect((await api(gio, 'POST', '/me/avatar', { path: mine.path })).status).toBe(400);
    expect((await api(gio, 'POST', '/me/avatar', { path: `${gio.id}/nothing.png` })).status).toBe(400);
  });

  it('DELETE /me/avatar clears it', async () => {
    const ana = await user('Ana');
    const up = await uploadAvatar(ana);
    await api(ana, 'POST', '/me/avatar', { path: up.path });
    expect((await api(ana, 'DELETE', '/me/avatar')).status).toBe(204);
    expect((await api<MeRes>(ana, 'GET', '/me')).body.avatarUrl).toBeNull();
    expect((await fetch(publicUrl(up.path))).status).toBe(400);
  });
});

describe('GET /users/:username', () => {
  it('returns the public profile, case-insensitively, without an email', async () => {
    const ana = await user('Ana');
    const gio = await user('Gio');
    const name = `Pub_${crypto.randomUUID().slice(0, 6)}`;
    await api(ana, 'PATCH', '/me', { username: name, bio: 'hi' });
    const r = await api<PublicProfile>(gio, 'GET', `/users/${name.toLowerCase()}`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ id: ana.id, username: name, display_name: 'Ana', color: ana.color, bio: 'hi', avatarUrl: null });
    expect(JSON.stringify(r.body)).not.toContain('@');
  });

  it('returns 404 for an unknown username', async () => {
    const gio = await user('Gio');
    expect((await api(gio, 'GET', '/users/nobody_here_123')).status).toBe(404);
  });
});

describe('DELETE /me', () => {
  it('returns 409 while the user hosts a room that has not ended', async () => {
    const ana = await user('Ana');
    await createRoom(ana);
    const r = await api(ana, 'DELETE', '/me');
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/end/);
  });

  it('keeps an ended class for its learners when the host deletes their account', async () => {
    const ana = await newUser('Ana');
    const gio = await user('Gio');
    const { room } = await createRoom(ana);
    await joinRoom(gio, room.invite_code);
    await api(ana, 'POST', `/rooms/${room.id}/host`, { action: 'end' });
    await new Promise((r) => setTimeout(r, 500));
    expect((await api(ana, 'DELETE', '/me')).status).toBe(204);
    const seen = (await gio.sb.from('rooms').select('id, host_id').eq('id', room.id)).data;
    expect(seen).toEqual([{ id: room.id, host_id: null }]);
  });

  it('a new avatar upload clears earlier uploads that were never committed', async () => {
    const ana = await user('Ana');
    await uploadAvatar(ana);
    await uploadAvatar(ana);
    const third = await uploadAvatar(ana);
    await api(ana, 'POST', '/me/avatar', { path: third.path });
    const admin = (await import('@supabase/supabase-js')).createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const left = (await admin.storage.from('avatars').list(ana.id)).data ?? [];
    expect(left.map((f) => `${ana.id}/${f.name}`)).toEqual([third.path]);
  });

  it('deletes the account, its picture and its data', async () => {
    const ana = await newUser('Ana');
    const up = await uploadAvatar(ana);
    await api(ana, 'POST', '/me/avatar', { path: up.path });
    const { room } = await createRoom(ana);
    await api(ana, 'POST', `/rooms/${room.id}/host`, { action: 'end' });
    await new Promise((r) => setTimeout(r, 500));
    expect((await api(ana, 'DELETE', '/me')).status).toBe(204);
    expect((await api(ana, 'GET', '/me')).status).toBe(401);
    expect((await fetch(publicUrl(up.path))).status).toBe(400);
  });
});
