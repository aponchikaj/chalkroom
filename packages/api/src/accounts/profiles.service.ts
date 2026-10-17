// Profiles: created by the on_auth_user_created trigger at signup; read and edited here.
import { Injectable, NotFoundException } from '@nestjs/common';
import type { MeRes, ProfileRow } from '@chalk/schema';
import { SupabaseService } from '../core/supabase.service';
import type { AuthUser } from '../core/auth.guard';
import { config } from '../config';

/** Public URL of an object in the public `avatars` bucket. */
export const avatarUrl = (path: string | null) => (path ? `${config.supabaseUrl}/storage/v1/object/public/avatars/${path}` : null);

@Injectable()
export class ProfilesService {
  constructor(private supa: SupabaseService) {}

  async get(userId: string): Promise<ProfileRow> {
    const r = await this.supa.db.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (r.error) throw new Error(r.error.message);
    if (!r.data) throw new NotFoundException('profile not found');
    return r.data as ProfileRow;
  }

  async me(user: AuthUser): Promise<MeRes> {
    const [profile, auth] = await Promise.all([this.get(user.id), this.supa.db.auth.admin.getUserById(user.id)]);
    return {
      profile,
      avatarUrl: avatarUrl(profile.avatar_path),
      email: auth.data.user?.email ?? null,
      // second factors arrive with B11; until then none can be on
      security: { totp: false, email2fa: false, aal: 'aal1', mfaPassed: true },
    };
  }
}
