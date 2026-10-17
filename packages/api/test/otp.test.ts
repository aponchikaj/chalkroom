import { describe, it, expect } from 'vitest';
import { OTP, checkCode, hashCode, newCode } from '../src/security/otp';
import { mfaPassed } from '../src/security/mfa';

const secret = 'test-secret';
const good = hashCode(secret, 'u1', 'login', '123456');
const row = (over: Partial<{ code_hash: string; expires_at: string; attempts: number; consumed_at: string | null }> = {}) =>
  ({ code_hash: good, expires_at: new Date(10_000).toISOString(), attempts: 0, consumed_at: null, ...over });

describe('email codes', () => {
  it('are 6 digits, including leading zeros', () => {
    for (let i = 0; i < 200; i++) expect(newCode()).toMatch(/^\d{6}$/);
  });

  it('hash to 64 hex characters, bound to user and purpose', () => {
    expect(good).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCode(secret, 'u2', 'login', '123456')).not.toBe(good);
    expect(hashCode(secret, 'u1', 'enable', '123456')).not.toBe(good);
    expect(hashCode('other', 'u1', 'login', '123456')).not.toBe(good);
  });

  it('accept the right code once, in time, before the attempts run out', () => {
    expect(checkCode(row(), good, 5_000)).toBe('ok');
    expect(checkCode(row(), hashCode(secret, 'u1', 'login', '000000'), 5_000)).toBe('wrong');
    expect(checkCode(row({ consumed_at: new Date(1).toISOString() }), good, 5_000)).toBe('used');
    expect(checkCode(row(), good, 10_001)).toBe('expired');
    expect(checkCode(row({ attempts: OTP.maxAttempts }), good, 5_000)).toBe('locked');
    expect(checkCode(null, good, 0)).toBe('missing');
  });

  it('use 10 minutes, 5 attempts and 5 sends per hour', () => {
    expect(OTP).toEqual({ ttlMs: 600_000, maxAttempts: 5, maxSendsPerHour: 5 });
  });
});

describe('mfaPassed (mirrors mfa_satisfied() in the database)', () => {
  const base = { aal: 'aal1' as const, totpVerified: false, email2fa: false, sessionPassedEmail: false };
  it('passes when no second factor is on', () => expect(mfaPassed(base)).toBe(true));
  it('blocks an aal1 session once TOTP is verified', () => expect(mfaPassed({ ...base, totpVerified: true })).toBe(false));
  it('blocks an aal1 session once email 2FA is on', () => expect(mfaPassed({ ...base, email2fa: true })).toBe(false));
  it('passes an aal2 session', () => expect(mfaPassed({ ...base, totpVerified: true, aal: 'aal2' })).toBe(true));
  it('passes a session that verified an email code', () => expect(mfaPassed({ ...base, email2fa: true, sessionPassedEmail: true })).toBe(true));
});
