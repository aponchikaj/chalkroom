// AS: Profile: picture, display name, username, colour and bio. The picture saves on its own
// (signed upload straight to Storage, then commit); the rest saves with one button.
import { useEffect, useRef, useState } from 'react';
import { ImageUp, Trash2 } from 'lucide-react';
import { AvatarType, DisplayName, MEMBER_COLORS, Username, type MeRes } from '@chalk/schema';
import { api, ApiError } from '../../lib/api';
import { refreshMe } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { Done, Errata, ICON, Portrait, say } from './parts';

const COLOR_NAMES: Record<string, string> = {
  '#f2d16b': 'Straw', '#8fc7e8': 'Sky', '#a8dc9f': 'Mint', '#f4a6c8': 'Rose', '#f6b26b': 'Apricot', '#c3a6f4': 'Lilac',
};
const MAX_BYTES = 2 * 1024 * 1024;
const BIO_MAX = 280;

export function ProfileSection({ me }: { me: MeRes }) {
  return (
    <section className="acct-section" aria-labelledby="acct-profile-title">
      <h2 id="acct-profile-title">Profile</h2>
      <p className="acct-lede">What the people in your classes see next to your questions and on the binding.</p>
      <AvatarBlock me={me} />
      <DetailsForm me={me} />
    </section>
  );
}

function AvatarBlock({ me }: { me: MeRes }) {
  const p = me.profile;
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<'' | 'upload' | 'remove'>('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const choose = (f: File | undefined) => {
    setError(''); setDone('');
    if (!f) return;
    if (!AvatarType.safeParse(f.type).success) { setError('Use a PNG, JPEG or WebP picture.'); return; }
    if (f.size > MAX_BYTES) { setError(`That picture is ${(f.size / 1024 / 1024).toFixed(1)} MB. The limit is 2 MB.`); return; }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };
  const cancel = () => { setFile(null); setPreview(null); if (input.current) input.current.value = ''; };

  const upload = async () => {
    if (!file) return;
    setBusy('upload'); setError(''); setDone('');
    try {
      const contentType = AvatarType.parse(file.type);
      const { path, token } = await api.avatarUploadUrl({ contentType });
      const up = await supabase.storage.from('avatars').uploadToSignedUrl(path, token, file, { contentType });
      if (up.error) throw new Error(up.error.message);
      await api.avatarCommit({ path });
      await refreshMe();
      cancel();
      setDone('Picture saved.');
    } catch (e) {
      setError(say(e, 'The picture did not upload. Try again.'));
    } finally { setBusy(''); }
  };

  const remove = async () => {
    setBusy('remove'); setError(''); setDone('');
    try {
      await api.avatarDelete();
      await refreshMe();
      setDone('Picture removed. Your initial shows instead.');
    } catch (e) { setError(say(e)); } finally { setBusy(''); }
  };

  return (
    <div className="acct-block acct-avatar" role="group" aria-labelledby="acct-avatar-title">
      <Portrait name={p.display_name} color={p.color} src={preview ?? me.avatarUrl} size={96} />
      <div className="acct-avatar-side">
        <h3 id="acct-avatar-title" className="field-label">Picture</h3>
        <p className="acct-note">{preview ? 'Preview. Nothing is saved until you press Use this picture.' : me.avatarUrl ? 'Shown in your punch on the binding.' : 'No picture yet: your initial shows in your colour.'}</p>
        <input ref={input} id="acct-avatar-file" className="sr-only" type="file" tabIndex={-1} accept="image/png,image/jpeg,image/webp"
          onChange={(e) => choose(e.target.files?.[0])} />
        <div className="acct-actions">
          {file ? (
            <>
              <button type="button" className="btn primary" onClick={upload} disabled={!!busy}>{busy === 'upload' ? 'Uploading' : 'Use this picture'}</button>
              <button type="button" className="btn" onClick={cancel} disabled={!!busy}>Cancel</button>
            </>
          ) : (
            <>
              <label htmlFor="acct-avatar-file" className="btn acct-file-btn" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}>
                <ImageUp {...ICON} aria-hidden />{me.avatarUrl ? 'Choose another' : 'Choose a picture'}
              </label>
              {me.avatarUrl && (
                <button type="button" className="btn ghost" onClick={remove} disabled={!!busy}>
                  <Trash2 {...ICON} aria-hidden />{busy === 'remove' ? 'Removing' : 'Remove'}
                </button>
              )}
            </>
          )}
        </div>
        <p className="acct-hint">PNG, JPEG or WebP, up to 2 MB.</p>
        {error && <Errata onDismiss={() => setError('')}>{error}</Errata>}
        {done && <Done>{done}</Done>}
      </div>
    </div>
  );
}

function DetailsForm({ me }: { me: MeRes }) {
  const p = me.profile;
  const [base, setBase] = useState({ displayName: p.display_name, username: p.username, color: p.color, bio: p.bio ?? '' });
  const [v, setV] = useState(base);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [taken, setTaken] = useState('');
  const [saved, setSaved] = useState(false);
  const group = useRef<HTMLDivElement>(null);

  const nameOk = DisplayName.safeParse(v.displayName).success;
  const userCheck = Username.safeParse(v.username);
  const userOk = userCheck.success;
  const changed = (Object.keys(v) as (keyof typeof v)[]).filter((k) => (k === 'bio' ? v[k] !== base[k] : v[k].trim() !== base[k].trim()));
  const dirty = changed.length > 0;
  const valid = nameOk && userOk && v.bio.length <= BIO_MAX;

  const edit = (patch: Partial<typeof v>) => { setV({ ...v, ...patch }); setSaved(false); setError(''); if ('username' in patch) setTaken(''); };
  const at = Math.max(0, MEMBER_COLORS.indexOf(v.color as (typeof MEMBER_COLORS)[number]));
  const pick = (i: number) => {
    const c = MEMBER_COLORS[(i + MEMBER_COLORS.length) % MEMBER_COLORS.length];
    edit({ color: c });
    group.current?.querySelector<HTMLButtonElement>(`[data-c="${c}"]`)?.focus();
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty || !valid) return;
    setBusy(true); setError(''); setTaken('');
    const body: Record<string, string> = {};
    for (const k of changed) body[k] = k === 'bio' ? v.bio : v[k].trim();
    try {
      const row = await api.updateProfile(body);
      const next = { displayName: row.display_name, username: row.username, color: row.color, bio: row.bio ?? '' };
      setBase(next); setV(next); setSaved(true);
      await refreshMe();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setTaken('That username is taken.');
      else setError(say(err, 'Your profile did not save. Try again.'));
    } finally { setBusy(false); }
  };

  const userError = taken || (!userOk && v.username.trim() ? 'Use 3 to 24 letters, digits or _.' : '');

  return (
    <form className="acct-block acct-form" onSubmit={save} noValidate aria-labelledby="acct-details-title">
      <h3 id="acct-details-title" className="sr-only">Profile details</h3>
      <div className="field">
        <label className="field-label" htmlFor="acct-name">Display name</label>
        <input id="acct-name" className="input" value={v.displayName} maxLength={32} autoComplete="nickname" required
          aria-invalid={!nameOk} aria-describedby={!nameOk ? 'acct-name-err' : undefined} onChange={(e) => edit({ displayName: e.target.value })} />
        {!nameOk && <span id="acct-name-err" className="error-text">Your name needs 1 to 32 characters.</span>}
      </div>
      <div className="field">
        <label className="field-label" htmlFor="acct-username">Username <span className="field-hint">3 to 24 letters, digits or _</span></label>
        <div className="acct-prefixed">
          <span className="acct-prefix" aria-hidden>@</span>
          <input id="acct-username" className="input" value={v.username} maxLength={24} autoComplete="username" spellCheck={false} autoCapitalize="none"
            aria-invalid={!!userError} aria-describedby={userError ? 'acct-username-err' : undefined} onChange={(e) => edit({ username: e.target.value })} />
        </div>
        {userError && <span id="acct-username-err" className="error-text" role={taken ? 'alert' : undefined}>{userError}</span>}
      </div>
      <div className="field">
        <span className="field-label" id="acct-color">Colour <span className="field-hint">{COLOR_NAMES[v.color] ?? ''}</span></span>
        <div className="swatches" role="radiogroup" aria-labelledby="acct-color" ref={group}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); pick(at + 1); }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); pick(at - 1); }
          }}>
          {MEMBER_COLORS.map((c, i) => (
            <button key={c} type="button" role="radio" data-c={c} aria-checked={v.color === c} aria-label={COLOR_NAMES[c] ?? c}
              tabIndex={i === at ? 0 : -1} className="swatch" style={{ ['--c' as string]: c }} onClick={() => edit({ color: c })} />
          ))}
        </div>
      </div>
      <div className="field">
        <div className="acct-label-row">
          <label className="field-label" htmlFor="acct-bio">Bio</label>
          <span className={`mono acct-count${v.bio.length > BIO_MAX ? ' over' : ''}`} aria-live="polite">{v.bio.length}/{BIO_MAX}</span>
        </div>
        <textarea id="acct-bio" className="textarea" rows={3} value={v.bio} placeholder="A line about you, what you are learning"
          aria-invalid={v.bio.length > BIO_MAX} onChange={(e) => edit({ bio: e.target.value })} />
      </div>
      {error && <Errata onDismiss={() => setError('')}>{error}</Errata>}
      <div className="acct-actions">
        <button className="btn primary" disabled={busy || !dirty || !valid}>{busy ? 'Saving' : 'Save profile'}</button>
        {saved && !dirty ? <Done>Saved. Your classes see the new profile.</Done>
          : dirty ? <span className="acct-note">Unsaved changes</span> : <span className="acct-note">No changes</span>}
      </div>
    </form>
  );
}
