// Profiles and settings: created by the on_auth_user_created trigger at signup (profile) or on
// first save (settings); read and edited here. Account deletion lives here too.
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { z } from 'zod';
import type { Api, MeRes, ProfileRow, PublicProfile, UserSettings } from '@chalk/schema';
import { SupabaseService } from '../core/supabase.service';
import { forgetUser, type AuthUser } from '../core/auth.guard';
import { config } from '../config';
import { usernameProblem } from './username';
import { settingsFromRow, settingsPatchToRow, type SettingsRow } from './settings';

/** Public URL of an object in the public `avatars` bucket. */
export const avatarUrl = (path: string | null) => (path ? `${config.supabaseUrl}/storage/v1/object/public/avatars/${path}` : null);

@Injectable()
export class ProfilesService {
  constructor(private supa: SupabaseService) {}

  private get db() { return this.supa.db; }

  async get(userId: string): Promise<ProfileRow> {
    const r = await this.db.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (r.error) throw new Error(r.error.message);
    if (!r.data) throw new NotFoundException('profile not found');
    return r.data as ProfileRow;
  }

  async me(user: AuthUser): Promise<MeRes> {
    const [profile, auth, settings] = await Promise.all([this.get(user.id), this.db.auth.admin.getUserById(user.id), this.settings(user.id)]);
    return {
      profile,
      avatarUrl: avatarUrl(profile.avatar_path),
      email: auth.data.user?.email ?? null,
      settings,
      // second factors arrive with B11; until then none can be on
      security: { totp: false, email2fa: false, aal: 'aal1', mfaPassed: true },
    };
  }

  async update(userId: string, b: z.infer<typeof Api.updateProfile>): Promise<ProfileRow> {
    if (b.username !== undefined) {
      const why = usernameProblem(b.username);
      if (why) throw new BadRequestException(`username: ${why}`);
    }
    const patch = Object.fromEntries(Object.entries({ username: b.username, display_name: b.displayName, color: b.color, bio: b.bio }).filter(([, v]) => v !== undefined));
    const r = await this.db.from('profiles').update(patch).eq('id', userId).select('*').single();
    if (r.error?.code === '23505') throw new ConflictException('that username is taken');
    if (r.error) throw new BadRequestException(r.error.message);
    return r.data as ProfileRow;
  }

  async settings(userId: string): Promise<UserSettings> {
    const r = await this.db.from('user_settings').select('*').eq('user_id', userId).maybeSingle();
    if (r.error) throw new Error(r.error.message);
    return settingsFromRow(r.data as SettingsRow | null);
  }

  async updateSettings(userId: string, patch: Partial<UserSettings>): Promise<UserSettings> {
    const r = await this.db.from('user_settings').upsert({ user_id: userId, ...settingsPatchToRow(patch) }).select('*').single();
    if (r.error) throw new BadRequestException(r.error.message);
    return settingsFromRow(r.data as SettingsRow);
  }

  /** GET /users/:username (citext: matches in any case). Never includes the email. */
  async publicProfile(username: string): Promise<PublicProfile> {
    const r = await this.db.from('profiles').select('id, username, display_name, color, bio, avatar_path').eq('username', username).maybeSingle();
    if (r.error) throw new Error(r.error.message);
    if (!r.data) throw new NotFoundException('no user with that username');
    const { avatar_path, ...rest } = r.data as ProfileRow;
    return { ...rest, avatarUrl: avatarUrl(avatar_path) };
  }

  /** Deletes the account and everything it owns. Refused while the user hosts a room that has not ended. */
  async deleteAccount(userId: string): Promise<void> {
    const live = await this.db.from('rooms').select('id').eq('host_id', userId).neq('phase', 'ended').limit(1);
    if (live.data?.length) throw new ConflictException('end the classes you host before deleting your account');
    const files = await this.db.storage.from('avatars').list(userId);
    if (files.data?.length) await this.db.storage.from('avatars').remove(files.data.map((f) => `${userId}/${f.name}`));
    const r = await this.db.auth.admin.deleteUser(userId);
    if (r.error) throw new Error(r.error.message);
    forgetUser(userId);
  }
}
