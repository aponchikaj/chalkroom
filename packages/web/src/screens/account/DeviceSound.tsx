// Lane V: the sound settings that belong to this device, not the account: which voice speaks
// (Natural, System, Off) and the sound effects switch. Stored in localStorage (lib/speaker.ts,
// lib/sfx.ts). The Natural voice is made on our server (lib/serverVoice.ts): nothing downloads.
import { useState } from 'react';
import { Play, Square } from 'lucide-react';
import { previewVoice, setVoiceMode, stopVoicePreview, useVoiceMode, type VoiceMode } from '../../lib/speaker';
import { useServerVoice } from '../../lib/serverVoice';
import { play, setSoundEffects, useSoundEffects } from '../../lib/sfx';
import { Errata, ICON, Switch } from './parts';
import './voice.css';

const MODES: { value: VoiceMode; label: string }[] = [
  { value: 'natural', label: 'Natural' },
  { value: 'system', label: 'System' },
  { value: 'off', label: 'Off' },
];

export function DeviceSound({ rate, tutorVoice }: { rate: number; tutorVoice: boolean }) {
  const mode = useVoiceMode((s) => s.mode);
  const engine = useServerVoice((s) => s.engine);
  const sfxOn = useSoundEffects((s) => s.on);
  // loading: pressed, the voice is not making sound yet; playing: it is, and the button stops it
  const [sample, setSample] = useState<'' | 'loading' | 'playing' | 'natural' | 'system'>('');

  // the server does not make the Natural voice right now: System speaks, Natural cannot be chosen
  const serverOff = engine === 'off';
  const shown: VoiceMode = mode === 'natural' && serverOff ? 'system' : mode;

  const choose = (m: VoiceMode) => { if (m !== 'natural' || !serverOff) setVoiceMode(m); };
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

  const hear = async () => {
    if (sample === 'playing') { stopVoicePreview(); return; }
    setSample('loading');
    const used = await previewVoice(shown === 'natural' ? 'natural' : 'system', rate, () => setSample('playing'));
    setSample(used);
  };

  const voiceNote = !tutorVoice
    ? 'Tutor voice is off for your account, so no voice plays. Turn it on above to choose one here.'
    : shown === 'natural' ? 'A natural voice made on our server. Works on phones too; nothing to download.'
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
          {tutorVoice && serverOff && <span className="acct-note" id="pref-natural-locked">The Natural voice is not available right now, so the system voice reads.</span>}
        </div>
        <div className="acct-pref-control voice-engine">
          <div className="acct-seg" role="radiogroup" aria-labelledby="pref-engine-label" aria-describedby="pref-engine-note" onKeyDown={onKey}>
            {MODES.map((m) => {
              const locked = m.value === 'natural' && serverOff;
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
