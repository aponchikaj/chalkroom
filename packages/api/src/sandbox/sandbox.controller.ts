// Dev console settings for packages/api/sandbox (mounted only when config.sandbox is on).
// The anon key is public by design; the service key is never exposed.
import { Controller, Get } from '@nestjs/common';
import { config } from '../config';

@Controller('sandbox')
export class SandboxController {
  @Get('config.json')
  settings() {
    return { supabaseUrl: process.env.VITE_SUPABASE_URL ?? config.supabaseUrl, anonKey: process.env.VITE_SUPABASE_ANON_KEY ?? null, model: config.model };
  }
}
