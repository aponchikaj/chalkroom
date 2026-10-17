// Profile pictures. Files never pass through the API: the client uploads to a signed URL and the
// `avatars` bucket enforces type (png, jpeg, webp) and size (2 MiB). Commit then checks the file
// is in the caller's own folder, points the profile at it, and removes the previous picture.
import { BadRequestException, Injectable } from '@nestjs/common';
import type { AvatarUploadRes, ProfileRow } from '@chalk/schema';
import { SupabaseService } from '../core/supabase.service';

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as const;
export type AvatarContentType = keyof typeof EXT;

@Injectable()
export class AvatarsService {
  constructor(private supa: SupabaseService) {}

  private get bucket() { return this.supa.db.storage.from('avatars'); }

  async uploadUrl(userId: string, contentType: AvatarContentType): Promise<AvatarUploadRes> {
    // uploads that were never committed would pile up: keep only the current picture
    const [listed, profile] = await Promise.all([this.bucket.list(userId), this.supa.db.from('profiles').select('avatar_path').eq('id', userId).single()]);
    const current = profile.data?.avatar_path as string | null;
    const stale = (listed.data ?? []).map((f) => `${userId}/${f.name}`).filter((p) => p !== current);
    if (stale.length) await this.bucket.remove(stale);
    const path = `${userId}/${crypto.randomUUID()}.${EXT[contentType]}`;
    const r = await this.bucket.createSignedUploadUrl(path);
    if (r.error) throw new Error(r.error.message);
    return { path, token: r.data.token, signedUrl: r.data.signedUrl };
  }

  async commit(userId: string, path: string): Promise<ProfileRow> {
    const [folder, file, ...rest] = path.split('/');
    if (folder !== userId || !file || rest.length) throw new BadRequestException('that upload is not yours');
    const listed = await this.bucket.list(userId, { search: file });
    if (!listed.data?.some((o) => o.name === file)) throw new BadRequestException('upload not found: upload the file first');
    const before = await this.supa.db.from('profiles').select('avatar_path').eq('id', userId).single();
    const r = await this.supa.db.from('profiles').update({ avatar_path: path }).eq('id', userId).select('*').single();
    if (r.error) throw new Error(r.error.message);
    const old = before.data?.avatar_path as string | null;
    if (old && old !== path) await this.bucket.remove([old]);
    return r.data as ProfileRow;
  }

  async clear(userId: string): Promise<void> {
    const before = await this.supa.db.from('profiles').select('avatar_path').eq('id', userId).single();
    await this.supa.db.from('profiles').update({ avatar_path: null }).eq('id', userId);
    const old = before.data?.avatar_path as string | null;
    if (old) await this.bucket.remove([old]);
  }
}
