// Two-factor authentication (B11): email codes (read back from Mailpit) and an authenticator app
// (TOTP codes generated here from the secret Supabase returns on enroll).
import { createHmac } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { MeRes, TwoFactorState } from '@chalk/schema';
import { TEST_PASSWORD, api, closeAll, createRoom, env, newUser, sleep, type TestUser } from './helpers';

const MAILPIT = env.MAILPIT_URL ?? 'http://127.0.0.1:55424';
const users: TestUser[] = [];
const user = async (name: string) => { const u = await newUser(name); users.push(u); return u; };
afterAll(() => closeAll(users));

/** The newest 6-digit code mailed to `to` (skipping codes already used). */
async function mailedCode(to: string, skip: string[] = []): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const s = (await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)).json()) as { messages?: { ID: string }[] };
    for (const m of s.messages ?? []) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as { Text: string };
      const code = /\b(\d{6})\b/.exec(msg.Text)?.[1];
      if (code && !skip.includes(code)) return code;
    }
    await sleep(150);
  }
  throw new Error(`no code mailed to ${to}`);
}

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits) from a base32 secret. */
function totp(secret: string, t = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(t / 30_000)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

/** A second login of the same account: a new, aal1 session. */
async function newSession(u: TestUser): Promise<TestUser> {
  const sb = createClient(env.VITE_SUPABASE_URL!, env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email: u.email, password: TEST_PASSWORD });
  if (error || !data.session) throw new Error(`login: ${error?.message}`);
  return { ...u, sb, token: data.session.access_token, events: [], rows: [] };
}

async function enableEmail2fa(u: TestUser) {
  expect((await api(u, 'POST', '/me/2fa/email/send', { purpose: 'enable' })).status).toBe(202);
  const r = await api<TwoFactorState>(u, 'POST', '/me/2fa/email/verify', { purpose: 'enable', code: await mailedCode(u.email) });
  expect(r.status).toBe(200);
  return r.body;
}

describe('GET /me/2fa', () => {
  it('starts with no second factor', async () => {
    const ana = await user('Ana');
    expect((await api<TwoFactorState>(ana, 'GET', '/me/2fa')).body).toEqual({ totp: false, email2fa: false, aal: 'aal1', mfaPassed: true });
  });
});

describe('email codes', () => {
  it('turn on email 2FA; a new login is locked until its own code', async () => {
    const ana = await user('Ana');
    expect(await enableEmail2fa(ana)).toEqual({ totp: false, email2fa: true, aal: 'aal1', mfaPassed: true });
    const { room } = await createRoom(ana); // the enabling session still works

    const later = await newSession(ana);
    const blocked = await api(later, 'POST', '/rooms', { title: 'x' });
    expect(blocked.status).toBe(401);
    expect(blocked.body.code).toBe('mfa_required');
    expect((await later.sb.from('rooms').select('id').eq('id', room.id)).data).toEqual([]); // RLS too
    const me = await api<MeRes>(later, 'GET', '/me'); // allowed, to show the 2FA step
    expect(me.status).toBe(200);
    expect(me.body.security.mfaPassed).toBe(false);

    const first = await mailedCode(ana.email);
    expect((await api(later, 'POST', '/me/2fa/email/send', { purpose: 'login' })).status).toBe(202);
    const ok = await api<TwoFactorState>(later, 'POST', '/me/2fa/email/verify', { purpose: 'login', code: await mailedCode(ana.email, [first]) });
    expect(ok.body.mfaPassed).toBe(true);
    expect((await api(later, 'POST', '/rooms', { title: 'x' })).status).toBe(201);
    expect((await later.sb.from('rooms').select('id').eq('id', room.id)).data).toEqual([{ id: room.id }]);
  });

  it('count wrong codes and lock after 5', async () => {
    const ana = await user('Ana');
    await api(ana, 'POST', '/me/2fa/email/send', { purpose: 'enable' });
    const code = await mailedCode(ana.email);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const r = await api(ana, 'POST', '/me/2fa/email/verify', { purpose: 'enable', code: wrong });
      expect(r.status).toBe(400);
    }
    const locked = await api(ana, 'POST', '/me/2fa/email/verify', { purpose: 'enable', code });
    expect(locked.status).toBe(429);
  });

  it('refuse a code meant for another purpose, and a reused code', async () => {
    const ana = await user('Ana');
    await api(ana, 'POST', '/me/2fa/email/send', { purpose: 'enable' });
    const code = await mailedCode(ana.email);
    expect((await api(ana, 'POST', '/me/2fa/email/verify', { purpose: 'disable', code })).status).toBe(400);
    expect((await api(ana, 'POST', '/me/2fa/email/verify', { purpose: 'enable', code })).status).toBe(200);
    expect((await api(ana, 'POST', '/me/2fa/email/verify', { purpose: 'enable', code })).status).toBe(400);
  });

  it('refuse enabling twice or disabling when off (409), and rate limit sends (429)', async () => {
    const ana = await user('Ana');
    expect((await api(ana, 'POST', '/me/2fa/email/send', { purpose: 'disable' })).status).toBe(409);
    await enableEmail2fa(ana);
    expect((await api(ana, 'POST', '/me/2fa/email/send', { purpose: 'enable' })).status).toBe(409);
    for (let i = 0; i < 4; i++) expect((await api(ana, 'POST', '/me/2fa/email/send', { purpose: 'login' })).status).toBe(202);
    expect((await api(ana, 'POST', '/me/2fa/email/send', { purpose: 'login' })).status).toBe(429);
  });

  it('turn email 2FA off; new logins are free again', async () => {
    const gio = await user('Gio');
    await enableEmail2fa(gio);
    const used = await mailedCode(gio.email);
    await api(gio, 'POST', '/me/2fa/email/send', { purpose: 'disable' });
    const off = await api<TwoFactorState>(gio, 'POST', '/me/2fa/email/verify', { purpose: 'disable', code: await mailedCode(gio.email, [used]) });
    expect(off.body).toMatchObject({ email2fa: false, mfaPassed: true });
    expect((await api(await newSession(gio), 'POST', '/rooms', { title: 'x' })).status).toBe(201);
  });

  it('validate the body (400)', async () => {
    const ana = await user('Ana');
    expect((await api(ana, 'POST', '/me/2fa/email/send', { purpose: 'hack' })).status).toBe(400);
    expect((await api(ana, 'POST', '/me/2fa/email/verify', { purpose: 'login', code: '12ab56' })).status).toBe(400);
  });
});

describe('authenticator app (TOTP)', () => {
  it('after verifying a factor, aal1 tokens are locked and the aal2 token works', async () => {
    const ana = await user('Ana');
    const en = await ana.sb.auth.mfa.enroll({ factorType: 'totp' });
    expect(en.error).toBeNull();
    const ch = await ana.sb.auth.mfa.challenge({ factorId: en.data!.id });
    const v = await ana.sb.auth.mfa.verify({ factorId: en.data!.id, challengeId: ch.data!.id, code: totp(en.data!.totp.secret) });
    expect(v.error).toBeNull();

    const old = await api(ana, 'POST', '/rooms', { title: 'x' });
    expect(old.status).toBe(401);
    expect(old.body.code).toBe('mfa_required');
    const aal2 = { ...ana, token: v.data!.access_token };
    expect((await api(aal2, 'POST', '/rooms', { title: 'x' })).status).toBe(201);
    expect((await api<TwoFactorState>(aal2, 'GET', '/me/2fa')).body).toEqual({ totp: true, email2fa: false, aal: 'aal2', mfaPassed: true });
  });
});
