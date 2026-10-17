// A6 (Dev A): pre-join mic test. Optional: asks for the microphone only when pressed, shows a
// stepped level meter, and says plainly what to do when the browser blocks it. Questions can
// always be typed, so a failed test never blocks joining.
import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';

const BARS = 12;
type State = 'idle' | 'asking' | 'live' | 'blocked' | 'missing' | 'failed';

const COPY: Record<Exclude<State, 'idle' | 'asking' | 'live'>, string> = {
  blocked: 'The browser blocked the microphone. Allow it from the icon in the address bar, then test again. You can still type questions.',
  missing: 'No microphone found. Plug one in and test again, or type your questions in class.',
  failed: 'The microphone did not start. Close other apps that use it and test again, or type your questions in class.',
};

export function MicTest() {
  const [state, setState] = useState<State>('idle');
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState(false);
  const stop = useRef<() => void>(() => {});

  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; stop.current(); }; }, []);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setState('failed'); return; }
    setState('asking');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) { stream.getTracks().forEach((tr) => tr.stop()); return; }
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      // sample at ~12 Hz: the meter steps, it does not glide
      const t = window.setInterval(() => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        const rms = Math.sqrt(sum / buf.length);
        const l = Math.min(1, rms * 5);
        setLevel(l);
        if (l > 0.25) setHeard(true);
      }, 80);
      stop.current = () => {
        clearInterval(t);
        stream.getTracks().forEach((tr) => tr.stop());
        void ctx.close();
        stop.current = () => {};
      };
      setState('live');
    } catch (e) {
      if (!alive.current) return;
      const n = (e as Error).name;
      setState(n === 'NotAllowedError' || n === 'SecurityError' ? 'blocked' : n === 'NotFoundError' || n === 'OverconstrainedError' ? 'missing' : 'failed');
    }
  };
  const end = () => { stop.current(); setState('idle'); setLevel(0); };

  const lit = Math.round(level * BARS);
  return (
    <div className="field mictest">
      <span className="field-label">Microphone <span className="field-hint">optional, for asking out loud</span></span>
      <div className="mictest-row">
        {state === 'live'
          ? <button type="button" className="btn small" onClick={end}><MicOff size={16} aria-hidden /> Stop test</button>
          : <button type="button" className="btn small" onClick={start} disabled={state === 'asking'}><Mic size={16} aria-hidden /> {state === 'asking' ? 'Waiting for permission' : 'Test microphone'}</button>}
        <span className={`meter ${state === 'live' ? 'on' : ''}`} role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={BARS} aria-valuenow={lit}>
          {Array.from({ length: BARS }, (_, i) => <i key={i} className={i < lit ? 'lit' : ''} />)}
        </span>
      </div>
      <p className="mictest-status" role="status">
        {state === 'live' ? (heard ? 'We hear you. The microphone works.' : 'Say something. The bars move when we hear you.')
          : state === 'idle' || state === 'asking' ? 'The browser asks for permission first. Nothing is recorded.'
          : <span className="errata">{COPY[state]}</span>}
      </p>
    </div>
  );
}
