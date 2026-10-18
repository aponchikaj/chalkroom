// Lane V: the sound settings that belong to this device, not the account: which voice speaks
// (Natural, System, Off), the opt-in Natural voice download, and the sound effects switch.
// Stored in localStorage (lib/speaker.ts, lib/kokoro.ts, lib/sfx.ts); nothing goes to the server.
import { useState } from 'react';
import { Download, Play, Square, Trash2 } from 'lucide-react';
import { downloadNaturalVoice, naturalKeepsUp, naturalSupport, removeNaturalVoice, useNaturalVoice } from '../../lib/kokoro';
import { previewVoice, setVoiceMode, stopVoicePreview, useVoiceMode, type VoiceMode } from '../../lib/speaker';
import { play, setSoundEffects, useSoundEffects } from '../../lib/sfx';
import { Done, Errata, ICON, Switch } from './parts';
import './voice.css';

const MODES: { value: VoiceMode; label: string }[] = [
  { value: 'natural', label: 'Natural' },
  { value: 'system', label: 'System' },
  { value: 'off', label: 'Off' },
];

export function DeviceSound({ rate, tutorVoice }: { rate: number; tutorVoice: boolean }) {
  const mode = useVoiceMode((s) => s.mode);
  const { status, progress, error, rtf } = useNaturalVoice();
  const keepsUp = naturalKeepsUp(rtf);
  const sfxOn = useSoundEffects((s) => s.on);
  const support = naturalSupport();
  // loading: pressed, the voice is not making sound yet; playing: it is, and the button stops it
  const [sample, setSample] = useState<'' | 'loading' | 'playing' | 'natural' | 'system'>('');
  const [removing, setRemoving] = useState(false);

  const ready = status === 'ready';
  const downloading = status === 'downloading';
  // Natural is chosen but not here (removed, or the browser cleared it): System speaks
  const shown: VoiceMode = mode === 'natural' && !ready ? 'system' : mode;
  const pct = Math.round(progress * 100);

  const choose = (m: VoiceMode) => { if (m !== 'natural' || ready) setVoiceMode(m); };
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    // the locked Natural radio takes focus (so its note is read) but is not chosen
    const at = MODES.findIndex((m) => m.value === (document.activeElement as HTMLElement | null)?.dataset.mode);
    const i = at >= 0 ? at : MODES.findIndex((m) => m.value === shown);
    const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
    const next = MODES[(i + step + MODES.length) % MODES.length].value;
    choose(next);
    (e.currentTarget.querySelector(`[data-mode="${next}"]`) as HTMLElement | null)?.focus();
  };

  const download = async () => {
    try {
      await downloadNaturalVoice();
      setVoiceMode('natural');
    } catch { /* the store holds the error line */ }
  };
  const remove = async () => {
    setRemoving(true);
    await removeNaturalVoice();
    if (mode === 'natural') setVoiceMode('system');
    setRemoving(false);
  };
  const hear = async () => {
    if (sample === 'playing') { stopVoicePreview(); return; }
    setSample('loading');
    const used = await previewVoice(shown === 'natural' ? 'natural' : 'system', rate, () => setSample('playing'));
    setSample(used);
  };

  const voiceNote = !tutorVoice
    ? 'Tutor voice is off for your account, so no voice plays. Turn it on above to choose one here.'
    : shown === 'natural' && !keepsUp ? 'This computer makes the Natural voice more slowly than a lesson plays, so classes use the system voice. Hear it to compare.'
    : shown === 'natural' ? 'The Natural voice reads the lesson. Any sentence it is not ready for is read by the system voice.'
    : shown === 'system' ? 'Your browser\'s built-in voice. It works everywhere and downloads nothing.'
    : 'No voice on this device. The board keeps its pace and the captions carry the lesson.';

  return (
    <>
      <h3 className="acct-group">Sound on this device</h3>
      <p className="acct-note voice-device-note">These stay in this browser and do not follow your account.</p>

      <div className="acct-pref acct-pref-wide">
        <div className="acct-pref-text">
          <span className="acct-pref-title" id="pref-engine-label">Voice</span>
          <span className="acct-note" id="pref-engine-note" aria-live="polite">{voiceNote}</span>
          {tutorVoice && !ready && <span className="acct-note" id="pref-natural-locked">Download the Natural voice below to choose it.</span>}
        </div>
        <div className="acct-pref-control voice-engine">
          <div className="acct-seg" role="radiogroup" aria-labelledby="pref-engine-label" aria-describedby="pref-engine-note" onKeyDown={onKey}>
            {MODES.map((m) => {
              const locked = m.value === 'natural' && !ready;
              return (
                <button key={m.value} type="button" role="radio" data-mode={m.value}
                  aria-checked={shown === m.value} tabIndex={shown === m.value ? 0 : -1}
                  className="acct-seg-btn" disabled={!tutorVoice}
                  aria-disabled={locked || undefined}
                  aria-describedby={locked ? 'pref-natural-locked' : undefined}
                  onClick={() => choose(m.value)}>
                  {m.label}
                </button>
              );
            })}
          </div>
          <button type="button" className="btn small" onClick={() => void hear()}
            disabled={!tutorVoice || shown === 'off' || sample === 'loading'} aria-live="polite">
            {sample === 'playing' ? <Square {...ICON} aria-hidden /> : sample === 'loading' ? null : <Play {...ICON} aria-hidden />}
            {sample === 'playing' ? 'Stop' : sample === 'loading' ? 'Loading the voice' : 'Hear it'}
          </button>
        </div>
      </div>
      {sample === 'system' && shown === 'natural' && (
        <Errata onDismiss={() => setSample('')}>The Natural voice could not play just now, so you heard the system voice. Classes do the same.</Errata>
      )}

      <section className={`voice-improve${ready ? ' is-ready' : ''}`} aria-labelledby="voice-improve-title">
        <div className="voice-improve-text">
          <h4 className="acct-pref-title" id="voice-improve-title">Improve your voice</h4>
          <p className="acct-note voice-improve-copy" id="voice-improve-copy">
            Downloads a more natural voice to this browser once (about {support.mb} MB).
            Classes then use it automatically. Nothing downloads unless you choose this.
          </p>
          {!support.ok && <p className="acct-note">{support.reason}</p>}
        </div>

        {downloading ? (
          <div className="voice-progress-wrap">
            <div className="voice-progress" role="progressbar" aria-labelledby="voice-improve-title"
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={pct ? `${pct} percent downloaded` : 'Starting the download'}>
              <span className="voice-progress-fill" style={{ ['--p' as string]: progress }} />
            </div>
            <span className="acct-note voice-progress-label" aria-hidden>
              {pct < 100 ? (pct ? <><span className="mono">{pct}%</span> downloaded</> : 'Starting the download') : 'Getting the voice ready'}
            </span>
          </div>
        ) : ready ? (
          <div className="voice-improve-actions">
            <Done>The Natural voice is on this device.</Done>
            <button type="button" className="btn small danger" onClick={() => void remove()} disabled={removing}>
              <Trash2 {...ICON} aria-hidden /> {removing ? 'Removing' : 'Remove'}
            </button>
          </div>
        ) : (
          <div className="voice-improve-actions">
            <button type="button" className="btn primary" onClick={() => void download()} disabled={!support.ok}
              aria-describedby="voice-improve-copy">
              <Download {...ICON} aria-hidden /> Download
            </button>
          </div>
        )}
        {status === 'error' && <Errata>{error}</Errata>}
      </section>

      <div className="acct-pref">
        <div className="acct-pref-text">
          <span className="acct-pref-title" id="pref-sfx-label">Sound effects</span>
          <span className="acct-note" id="pref-sfx-note">Very quiet page turns, pencil strokes and a soft bell when a check opens. Silent with fewer animations.</span>
        </div>
        <div className="acct-pref-control">
          <Switch id="pref-sfx" labelledBy="pref-sfx-label" describedBy="pref-sfx-note" checked={sfxOn}
            onChange={(v) => { setSoundEffects(v); if (v) play('page-turn', { preview: true }); }} />
        </div>
      </div>
    </>
  );
}
