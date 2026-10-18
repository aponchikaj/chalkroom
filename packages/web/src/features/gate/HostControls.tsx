// A4 (Dev A) + lane C: host overrides. Start; while teaching, Pause / Resume the tutor for the
// whole class, Re-explain the selected figure, Slower, Skip (once the gate is open here), Hold /
// Resume the gate, End. Every one the class would notice posts a class notice (API lane C). The
// host rarely needs these (UX rule 5), so they stay quiet; on phones they fold into one Host menu.
// End asks once inline because it ends the class for everyone.
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ChevronUp, CircleStop, Pause, Play, RotateCcw, Settings2, SkipForward, Timer, Turtle } from 'lucide-react';
import type { StreamEvent } from '@chalk/schema';
import { mainPlayer, selectIsHost, useRoom } from '../../room/store';
import { api } from '../../lib/api';
import { Stamp } from '../../ui/Stamp';
import { hostApi, narrationPaused, type HostControlAction } from './hostApi';
import { useGateOpenHere } from './ReadyStrip';
import { ActivityControls } from '../activities/ActivityControls';
import './gate.css';

type GateAction = Parameters<typeof api.host>[1]['action'];
const ICON = { size: 16, strokeWidth: 2, 'aria-hidden': true } as const;
const PHONE = '(max-width: 760px)';

function usePhone() {
  return useSyncExternalStore(
    (fn) => { const m = matchMedia(PHONE); m.addEventListener('change', fn); return () => m.removeEventListener('change', fn); },
    () => matchMedia(PHONE).matches,
    () => false,
  );
}

/** Words for the selected figure: its text, or what kind of shape it is. */
function figureLabel(ids: string[]): string | undefined {
  const st = mainPlayer.state;
  const page = st.pages[mainPlayer.viewPage ?? st.current];
  const s = page?.shapes[ids[0]];
  if (!s) return undefined;
  const text = (s.text ?? '').replace(/\s+/g, ' ').trim();
  if (text) return text.length > 60 ? `${text.slice(0, 57).trimEnd()}...` : text;
  return ids.length > 1 ? `these ${ids.length} parts` : `this ${s.kind}`;
}

export function HostControls() {
  const room = useRoom((s) => s.room)!;
  const isHost = useRoom(selectIsHost);
  const paused = useRoom((s) => narrationPaused(s.mainEvents));
  const selection = useRoom((s) => s.selection);
  const gateOpen = useGateOpenHere();
  const phone = usePhone();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [slowerFor, setSlowerFor] = useState<number | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState('');
  if (!isHost || room.phase === 'ended') return null;

  const run = (key: string, p: () => Promise<unknown>, fail: string, after?: () => void) => {
    setBusy(key);
    p().then(() => { setError(''); after?.(); })
      .catch((e) => setError(`${fail} ${(e as Error).message || ''}`.trim()))
      .finally(() => setBusy(null));
  };
  const gate = (action: GateAction, fail: string, after?: () => void) =>
    run(action, () => api.host(room.id, { action }), fail, after);
  const control = (action: HostControlAction, fail: string, after?: () => void) =>
    run(action, () => hostApi.control(room.id, { action }), fail, after);

  if (room.phase === 'lobby') {
    return (
      <div className="host-controls" role="group" aria-label="Host controls">
        <button type="button" className="btn primary" disabled={!!busy} onClick={() => run('start', () => api.start(room.id), 'The class did not start. Press Start class again.')}>
          {busy === 'start' ? 'Starting' : 'Start class'}
        </button>
        {error && <p className="errata" role="alert">{error}</p>}
      </div>
    );
  }

  if (confirmEnd) {
    const keep = () => setConfirmEnd(false);
    const end = (
      <button type="button" className="btn danger" disabled={!!busy} autoFocus={!phone}
        onClick={() => gate('end', 'The class did not end. Try again.', keep)}>
        <CircleStop {...ICON} />{busy === 'end' ? 'Ending' : 'End class'}
      </button>
    );
    const stay = <button type="button" className="btn ghost" disabled={!!busy} autoFocus={phone} onClick={keep}>Keep teaching</button>;
    if (phone) return <EndConfirmSheet onKeep={keep} end={end} stay={stay} error={error} />;
    return (
      <div className="host-controls is-confirm" role="group" aria-label="Confirm end class">
        <p className="host-confirm-q">End the class for everyone?</p>
        {end}
        {stay}
        {error && <p className="errata" role="alert">{error}</p>}
      </div>
    );
  }

  const slowerSet = slowerFor === room.segment;
  const label = selection.length ? figureLabel(selection) : undefined;
  const selKey = selection.join(',');
  const items = (
    <>
      <button type="button" className={`btn small ${paused ? 'is-on' : ''}`} disabled={!!busy} aria-pressed={paused}
        title={paused ? 'The tutor is paused for everyone. Resume it.' : 'Pause the tutor for everyone'}
        onClick={() => control(paused ? 'resume' : 'pause', paused ? 'The tutor did not resume. Try again.' : 'The tutor did not pause. Try again.')}>
        {paused ? <Play {...ICON} /> : <Pause {...ICON} />}<span className="host-text">{paused ? 'Resume tutor' : 'Pause tutor'}</span>
      </button>
      {selection.length > 0 && (asked === selKey ? <Stamp tone="ink">Re-explain queued</Stamp> : (
        <button type="button" className="btn small" disabled={!!busy} title={`The tutor explains ${label ?? 'the selected figure'} again in the next Q&A`}
          onClick={() => run('reexplain', () => hostApi.reexplain(room.id, { shapeIds: selection.slice(0, 20), label }), 'Re-explain did not go through. Try again.', () => setAsked(selKey))}>
          <RotateCcw {...ICON} /><span className="host-text">Re-explain this</span>
        </button>
      ))}
      {slowerSet ? <Stamp tone="ink">Next part slower</Stamp> : (
        <button type="button" className="btn small" disabled={!!busy} title="The next part re-explains before it moves on"
          onClick={() => control('slower', 'Slower did not go through. Try again.', () => setSlowerFor(room.segment))}>
          <Turtle {...ICON} /><span className="host-text">Slower</span>
        </button>
      )}
      {room.phase === 'check' && gateOpen && <>
        <button type="button" className="btn small" disabled={!!busy} title="Move the class on without waiting for the gate"
          onClick={() => control('skip', 'Skip did not go through. Try again.')}>
          <SkipForward {...ICON} /><span className="host-text">Skip</span>
        </button>
        {room.gate_held
          ? <button type="button" className="btn small" disabled={!!busy} title="Let the gate count down again"
              onClick={() => gate('resume', 'The gate did not resume. Try again.')}>
              <Play {...ICON} /><span className="host-text">Resume gate</span>
            </button>
          : <button type="button" className="btn small" disabled={!!busy} title="Stop the gate timer until you resume it"
              onClick={() => gate('hold', 'The gate did not pause. Try again.')}>
              <Pause {...ICON} /><span className="host-text">Hold gate</span>
            </button>}
      </>}
      <button type="button" className="btn small ghost host-end" disabled={!!busy} title="End the class for everyone" onClick={() => { setError(''); setMenu(false); setConfirmEnd(true); }}>
        <CircleStop {...ICON} /><span className="host-text">End class</span>
      </button>
    </>
  );

  if (phone) {
    return (
      <div className="host-controls is-phone">
        <HostMenu open={menu} setOpen={setMenu} paused={paused}>{items}</HostMenu>
        {error && <p className="errata" role="alert">{error}</p>}
      </div>
    );
  }
  return (
    <div className="host-controls" role="group" aria-label="Host controls">
      <span className="host-label">Host</span>
      {items}
      {error && <p className="errata" role="alert">{error}</p>}
    </div>
  );
}

/** Phones: the end-class confirm as a modal sheet. A dim layer under it keeps teaching when
 *  tapped, Escape keeps teaching, and Tab stays inside the sheet. The rest of the page is inert
 *  while it is open, and focus goes back to the Host button when it closes. */
function EndConfirmSheet({ onKeep, end, stay, error }: { onKeep: () => void; end: ReactNode; stay: ReactNode; error: string }) {
  const sheet = useRef<HTMLDivElement>(null);
  const qId = useId();
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onKeep(); return; }
      if (e.key !== 'Tab' || !sheet.current) return;
      const f = [...sheet.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      if (!f.length) return;
      const i = f.indexOf(document.activeElement as HTMLButtonElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onKeep]);
  useEffect(() => {
    // make everything outside the sheet (and its dim layer) inert, level by level up to the root
    const made: HTMLElement[] = [];
    for (let el: HTMLElement | null = sheet.current; el && el.parentElement && el !== document.body; el = el.parentElement) {
      for (const sib of el.parentElement.children) {
        if (sib === el || !(sib instanceof HTMLElement) || sib.classList.contains('host-confirm-scrim') || sib.inert) continue;
        sib.inert = true; made.push(sib);
      }
    }
    return () => {
      made.forEach((m) => { m.inert = false; });
      // the sheet's opener, the Host menu, is closed by now: put focus back on its button
      requestAnimationFrame(() => {
        if (document.activeElement && document.activeElement !== document.body) return;
        document.querySelector<HTMLButtonElement>('.host-menu-btn')?.focus();
      });
    };
  }, []);
  return (
    <>
      <button type="button" className="host-confirm-scrim" aria-label="Keep teaching" tabIndex={-1} onClick={onKeep} />
      <div ref={sheet} className="host-controls is-confirm" role="alertdialog" aria-modal="true" aria-labelledby={qId}>
        <p className="host-confirm-q" id={qId}>End the class for everyone?</p>
        {end}
        {stay}
        {error && <p className="errata" role="alert">{error}</p>}
      </div>
    </>
  );
}

/** Phones: one Host button; the controls open in a sheet above the control bar. */
function HostMenu({ open, setOpen, paused, children }: { open: boolean; setOpen: (v: boolean) => void; paused: boolean; children: ReactNode }) {
  const btn = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const sheetId = useId();
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!sheet.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    window.addEventListener('keydown', key);
    window.addEventListener('pointerdown', away);
    sheet.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('pointerdown', away); };
  }, [open, setOpen]);
  return (
    <>
      <button ref={btn} type="button" className={`btn host-menu-btn${paused ? ' is-paused' : ''}`} aria-expanded={open} aria-controls={sheetId} onClick={() => setOpen(!open)}>
        <Settings2 {...ICON} /><span className="host-menu-word">Host</span>{paused && <span className="host-menu-flag">paused</span>}<ChevronUp {...ICON} className={open ? '' : 'flip'} />
      </button>
      {open && (
        <div ref={sheet} id={sheetId} className="host-sheet leaf hinge-in" role="group" aria-label="Host controls">
          <HostClock />
          <div className="host-sheet-items">{children}</div>
          <ActivityControls />
        </div>
      )}
    </>
  );
}

const EST_SEGMENT_MS = 3 * 60_000; // design: parts run 2 to 4 minutes
const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** The host's clock: time since the class started, and time in this part against the usual length. */
export function HostClock() {
  const started = useRoom((s) => s.room?.started_at ?? null);
  const segment = useRoom((s) => s.room?.segment ?? 0);
  const phase = useRoom((s) => s.room?.phase);
  const segStart = useRoom((s) => {
    for (let i = s.mainEvents.length - 1; i >= 0; i--) {
      const e = s.mainEvents[i];
      if (e.kind === 'segment_start' && (e as StreamEvent<'segment_start'>).data.segment === segment) return Date.parse(e.t);
    }
    return null;
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const since = started ? now - Date.parse(started) : NaN;
  if (!(since >= 0)) return null;
  const inPart = segStart != null && now >= segStart && phase === 'teaching' ? now - segStart : null;
  const left = inPart == null ? null : EST_SEGMENT_MS - inPart;
  return (
    <span className="host-clock" title="Time since the class started, and in this part (parts usually run about 3 minutes)">
      <Timer size={14} strokeWidth={2} aria-hidden />
      <span><span className="mono">{clock(since)}</span> in class</span>
      {left != null && <span className="host-clock-part">{left >= 0 ? <>about <span className="mono">{clock(left)}</span> left in this part</> : <>part running <span className="mono">{clock(-left)}</span> long</>}</span>}
    </span>
  );
}
