// Service-role Supabase client. Bypasses RLS: every write in the app goes through here.
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

@Injectable()
export class SupabaseService {
  readonly db: SupabaseClient = createClient(config.supabaseUrl, config.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** A failed write: the request's fault when it broke a row rule (check, not null, type, length:
 *  400) or named a row that is not there (404); anything else is the server's (500). */
export function requestOrServerError(e: { message: string; code?: string }, what: string): Error {
  if (e.code && ['23514', '23502', '22P02', '22001', '22003'].includes(e.code)) return new BadRequestException(`${what}: ${e.message}`);
  if (e.code === 'PGRST116') return new NotFoundException(`${what} not found`);
  return new Error(`${what}: ${e.message}`);
}

/** PostgREST answers at most max_rows rows per request (supabase/config.toml: 1000). */
export const MAX_ROWS = 1000;

/** Every row of a query, one range at a time. `page(from, to)` must order the rows. */
export async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, what: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += MAX_ROWS) {
    const r = await page(from, from + MAX_ROWS - 1);
    if (r.error) throw new Error(`${what}: ${r.error.message}`);
    out.push(...(r.data ?? []));
    if ((r.data?.length ?? 0) < MAX_ROWS) return out;
  }
}

/** Unwrap a supabase-js result or throw with its message. */
export function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  if (r.data === null) throw new Error(`${what}: no data`);
  return r.data;
}
