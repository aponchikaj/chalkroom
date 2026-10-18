// AS: Preferences: how the tutor plays on your devices, captions, motion and email. English only.
// Every change applies at once and saves on its own; a failed save puts the old value back.
import { useEffect, useRef, useState } from 'react';
import type { UserSettings } from '@chalk/schema';
import { setPlainType, usePlainType, usePreferences } from '../../lib/preferences';
import { Done, Errata, Switch, say } from './parts';
import { DeviceSound } from './DeviceSound';

const RATE_MIN = 0.5;
const RATE_MAX = 2;
const fmtRate = (r: number) => `${r.toFixed(2)}x`;

export function PreferencesSection() {
  const { settings, loaded, error: loadError, update, reload } = usePreferences();
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'' | 'saving' | 'saved'>('');
  const [rate, setRate] = useState(settings.voiceRate);
  const rateTimer = useRef<number | undefined>(undefined);
  const pending = useRef(0);
  const plainType = usePlainType((s) => s.on);

  useEffect(() => { if (!loaded) void reload(); }, [loaded, reload]);
  useEffect(() => { setRate(settings.voiceRate); }, [settings.voiceRate]);
  useEffect(() => () => window.clearTimeout(rateTimer.current), []);

  const change = async (patch: Partial<UserSettings>) => {
    setError(''); setStatus('saving');
    pending.current++;
    try {
      await update(patch);
      if (--pending.current === 0) setStatus('saved');
    } catch (e) {
      pending.current--;
      setStatus('');
      setError(`${say(e, 'That change did not save.')} The setting is back to what it was.`);
    }
  };

  const onRate = (r: number) => {
    setRate(r);
    window.clearTimeout(rateTimer.current);
    rateTimer.current = window.setTimeout(() => { void change({ voiceRate: r }); }, 350);
  };

  if (!loaded && !loadError) return <PrefsSkeleton />;

  const row = (id: string, title: string, note: string, control: React.ReactNode) => (
    <div className="acct-pref">
      <div className="acct-pref-text">
        <span className="acct-pref-title" id={`${id}-label`}>{title}</span>
        <span className="acct-note" id={`${id}-note`}>{note}</span>
      </div>
      <div className="acct-pref-control">{control}</div>
    </div>
  );

  return (
    <section className="acct-section" aria-labelledby="acct-prefs-title">
      <h2 id="acct-prefs-title">Preferences</h2>
      <p className="acct-lede">Saved to your account, so they follow you to every device you sign in on.</p>
      <div className="acct-status" aria-live="polite">
        {status === 'saving' && <span className="acct-note">Saving</span>}
        {status === 'saved' && <Done>Saved. Applies right away.</Done>}
      </div>
      {loadError && !loaded && (
        <Errata>Could not load your saved preferences, so these are the ones on this device. <button type="button" className="text-link" onClick={() => void reload()}>Try again</button></Errata>
      )}
      {error && <Errata onDismiss={() => setError('')}>{error}</Errata>}

      <h3 className="acct-group">The tutor</h3>
      {row('pref-voice', 'Tutor voice', 'The tutor reads its lines aloud on this device. Off, you follow the captions.',
        <Switch id="pref-voice" labelledBy="pref-voice-label" describedBy="pref-voice-note" checked={settings.tutorVoice} onChange={(v) => change({ tutorVoice: v })} />)}
      <div className="acct-pref acct-pref-wide">
        <div className="acct-pref-text">
          <label className="acct-pref-title" htmlFor="pref-rate">Voice speed</label>
          <span className="acct-note" id="pref-rate-note">How fast the tutor talks. Catch-up replays still run at double this.</span>
        </div>
        <div className="acct-pref-control acct-rate">
          <input id="pref-rate" type="range" className="acct-range" min={RATE_MIN} max={RATE_MAX} step={0.25} value={rate}
            aria-describedby="pref-rate-note" aria-valuetext={`${fmtRate(rate)} speed`} disabled={!settings.tutorVoice}
            onChange={(e) => onRate(Number(e.target.value))} />
          <output htmlFor="pref-rate" className="mono acct-rate-value">{fmtRate(rate)}</output>
        </div>
      </div>
      {row('pref-captions', 'Captions', 'The tutor\'s lines printed under the board.',
        <Switch id="pref-captions" labelledBy="pref-captions-label" describedBy="pref-captions-note" checked={settings.captions} onChange={(v) => change({ captions: v })} />)}

      <DeviceSound rate={rate} tutorVoice={settings.tutorVoice} />

      <h3 className="acct-group">The page</h3>
      {row('pref-motion', 'Fewer animations', 'Figures and leaves appear at once instead of plotting on step by step.',
        <Switch id="pref-motion" labelledBy="pref-motion-label" describedBy="pref-motion-note" checked={settings.reducedMotion} onChange={(v) => change({ reducedMotion: v })} />)}
      {row('pref-type', 'Plain type', 'The board, notes and headings in plain printed letters instead of handwriting. Easier to read, and kinder to dyslexia. This device only.',
        <Switch id="pref-type" labelledBy="pref-type-label" describedBy="pref-type-note" checked={plainType} onChange={setPlainType} />)}
      {row('pref-theme', 'Theme', 'Light. Chalkroom is printed on light paper; there is no dark theme to choose.',
        <span className="acct-fixed">Light</span>)}
      <h3 className="acct-group">Email</h3>
      {row('pref-mail', 'Email notifications', 'Class notes after a class and security notices. Sign-in codes are always sent.',
        <Switch id="pref-mail" labelledBy="pref-mail-label" describedBy="pref-mail-note" checked={settings.emailNotifications} onChange={(v) => change({ emailNotifications: v })} />)}
    </section>
  );
}

function PrefsSkeleton() {
  return (
    <section className="acct-section" aria-busy="true" aria-labelledby="acct-prefs-title">
      <h2 id="acct-prefs-title">Preferences</h2>
      <p className="acct-note" role="status">Loading your preferences</p>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="acct-pref" aria-hidden>
          <div className="acct-pref-text"><span className="acct-sk acct-sk-title" /><span className="acct-sk acct-sk-meta" /></div>
          <span className="acct-sk acct-sk-switch" />
        </div>
      ))}
    </section>
  );
}
