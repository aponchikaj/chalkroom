// Service-role Supabase client. Bypasses RLS: every write in the app goes through here.
import { Injectable } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

@Injectable()
export class SupabaseService {
  readonly db: SupabaseClient = createClient(config.supabaseUrl, config.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Unwrap a supabase-js result or throw with its message. */
export function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  if (r.data === null) throw new Error(`${what}: no data`);
  return r.data;
}
