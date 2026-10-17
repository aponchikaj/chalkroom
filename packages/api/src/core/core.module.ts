import { Global, Module } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { EventsService } from './events.service';
import { AuthGuard } from './auth.guard';

@Global()
@Module({ providers: [SupabaseService, EventsService, AuthGuard], exports: [SupabaseService, EventsService, AuthGuard] })
export class CoreModule {}
