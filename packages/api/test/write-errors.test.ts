// Database failures are reported, not swallowed: a write that failed never answers 2xx, and a
// server-side failure is a 500 (a plain Error), not a 400 that blames the request.
import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, HttpException, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';

vi.hoisted(() => {
  process.env.SUPABASE_URL ??= 'http://127.0.0.1:1';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test';
});
const { ProfilesService } = await import('../src/accounts/profiles.service');
const { AvatarsService } = await import('../src/accounts/avatars.service');
const { RoomsService } = await import('../src/rooms/rooms.service');
const { SourcesService } = await import('../src/rag/sources.service');
const { AuthGuard } = await import('../src/core/auth.guard');

type Op = 'select' | 'insert' | 'update' | 'upsert' | 'delete';
type Answer = { data: unknown; error: { message: string; code?: string } | null };
/** Every query resolves to answer(table, op); storage calls resolve to `storage`. */
function fakeSupa(answer: (table: string, op: Op) => Answer, storage: Answer = { data: [], error: null }) {
  const db = {
    from(table: string) {
      let op: Op = 'select';
      const b: Record<string, unknown> = {};
      for (const k of ['select', 'eq', 'neq', 'in', 'is', 'not', 'match', 'order', 'limit', 'single', 'maybeSingle', 'or']) b[k] = () => b;
      for (const k of ['insert', 'update', 'upsert', 'delete'] as const) b[k] = () => { op = k; return b; };
      b.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(answer(table, op)).then(ok, bad);
      return b;
    },
    storage: { from: () => ({ remove: async () => storage, list: async () => storage }) },
    auth: { getUser: async () => answer('auth', 'select') },
    rpc: async () => ({ data: [{ totp_verified: false, email_2fa: false, session_passed_email: false }], error: null }),
  };
  return { db } as never;
}
const ok = (data: unknown = null): Answer => ({ data, error: null });
const fail = (code: string, message = 'boom'): Answer => ({ data: null, error: { code, message } });
const isServerError = (e: unknown) => e instanceof Error && !(e instanceof HttpException);

describe('PATCH /me and /me/settings: which failures are the request\'s fault', () => {
  it('a broken rule is 400, a missing profile 404, anything else a server error', async () => {
    const svc = (code: string) => new ProfilesService(fakeSupa(() => fail(code)));
    await expect(svc('23514').update('u', { bio: 'x' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc('PGRST116').update('u', { bio: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    const e = await svc('08006').update('u', { bio: 'x' }).catch((x) => x);
    expect(isServerError(e)).toBe(true);
  });

  it('settings: a broken rule is 400, anything else a server error', async () => {
    const svc = (code: string) => new ProfilesService(fakeSupa(() => fail(code)));
    await expect(svc('23514').updateSettings('u', { theme: 'dark' })).rejects.toBeInstanceOf(BadRequestException);
    expect(isServerError(await svc('08006').updateSettings('u', { theme: 'dark' }).catch((x) => x))).toBe(true);
  });
});

describe('writes that failed do not answer 2xx', () => {
  const rooms = (answer: (t: string, op: Op) => Answer) => new RoomsService(fakeSupa(answer), {} as never, {} as never);

  it('leave', async () => {
    const e = await rooms((t, op) => (t === 'room_members' && op === 'update' ? fail('08006') : ok())).leave('r', 'u').catch((x) => x);
    expect(isServerError(e)).toBe(true);
  });

  it('reactions', async () => {
    const member = { room_id: 'r', user_id: 'u', banned: false };
    const svc = rooms((t, op) => {
      if (t === 'room_members') return ok(member);
      if (t === 'rooms') return ok({ id: 'r', phase: 'check' });
      if (t === 'reactions' && op === 'upsert') return fail('08006');
      return ok(null);
    });
    expect(isServerError(await svc.react('r', 'u', 'pda', 'got_it').catch((x) => x))).toBe(true);
  });

  it('DELETE /me/avatar', async () => {
    const svc = new AvatarsService(fakeSupa((t, op) => (t === 'profiles' && op === 'update' ? fail('08006') : ok({ avatar_path: null }))));
    expect(isServerError(await svc.clear('u').catch((x) => x))).toBe(true);
  });

  it('DELETE /sources/:id', async () => {
    const source = { id: 's', kind: 'url', created_by: 'u', room_id: null, course_id: null, uri: 'https://x' };
    const svc = new SourcesService(fakeSupa((t, op) => (op === 'delete' ? fail('08006') : ok(source))), {} as never, {} as never);
    expect(isServerError(await svc.remove('s', 'u').catch((x) => x))).toBe(true);
  });
});

describe('auth guard', () => {
  const ctx = (token: string) => ({
    switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: `Bearer ${token}` } }) }),
    getHandler: () => undefined, getClass: () => undefined,
  }) as never;
  const reflector = { getAllAndOverride: () => false } as never;

  it('answers 503 (keep the session) when Supabase Auth is down', async () => {
    const guard = new AuthGuard(fakeSupa(() => ({ data: { user: null }, error: { message: 'fetch failed', status: 0, name: 'AuthRetryableFetchError' } as never })), reflector);
    await expect(guard.canActivate(ctx('down-1'))).rejects.toBeInstanceOf(ServiceUnavailableException);
    const g5 = new AuthGuard(fakeSupa(() => ({ data: { user: null }, error: { message: 'bad gateway', status: 502 } as never })), reflector);
    await expect(g5.canActivate(ctx('down-2'))).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('still answers 401 for a token Supabase refuses', async () => {
    const guard = new AuthGuard(fakeSupa(() => ({ data: { user: null }, error: { message: 'invalid JWT', status: 403 } as never })), reflector);
    await expect(guard.canActivate(ctx('bad-1'))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

