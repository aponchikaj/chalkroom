// Email 2FA codes: 6 digits, stored only as an HMAC bound to user and purpose, valid 10
// minutes, 5 attempts, single use. Pure (no DB, no config): the secret is passed in.
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const OTP = { ttlMs: 10 * 60_000, maxAttempts: 5, maxSendsPerHour: 5 } as const;

export type OtpCheck = 'ok' | 'missing' | 'used' | 'expired' | 'locked' | 'wrong';

export interface OtpRow { code_hash: string; expires_at: string; attempts: number; consumed_at: string | null }

export const newCode = () => randomInt(0, 1_000_000).toString().padStart(6, '0');

export function hashCode(secret: string, userId: string, purpose: string, code: string): string {
  return createHmac('sha256', secret).update(`${userId}:${purpose}:${code}`).digest('hex');
}

/** Compare in constant time; order of checks: used, expired, locked, then the code itself. */
export function checkCode(row: OtpRow | null, candidateHash: string, now: number): OtpCheck {
  if (!row) return 'missing';
  if (row.consumed_at) return 'used';
  if (Date.parse(row.expires_at) < now) return 'expired';
  if (row.attempts >= OTP.maxAttempts) return 'locked';
  const a = Buffer.from(row.code_hash, 'hex');
  const b = Buffer.from(candidateHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b) ? 'ok' : 'wrong';
}
