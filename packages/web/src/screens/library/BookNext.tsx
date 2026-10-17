// Lane L: "Book the next session" (host): pick a date and time, the API makes the group's next
// room (same course, the syllabus continuing), then the invite link and calendar invites.
import { useEffect, useId, useState } from 'react';
import { CalendarPlus, Check, Copy, Download, ExternalLink, TriangleAlert } from 'lucide-react';
import type { RoomRow } from '@chalk/schema';
import { api } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { buildIcs, download, fileStem, googleCalendarUrl, type CalendarEvent } from './files';
import './library.css';

const ICON = { size: 16, strokeWidth: 2, 'aria-hidden': true } as const;
const pad = (n: number) => String(n).padStart(2, '0');
/** A Date as the value of <input type="datetime-local"> (local time, minutes). */
const localValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** One week after this class, at the same hour (6 pm when that was at night); never in the past. */
function defaultStart(room: RoomRow): Date {
  const base = new Date(room.started_at ?? room.starts_at ?? Date.now());
  const d = new Date(base.getTime() + 7 * 86_400_000);
  if (d.getHours() < 8 || d.getHours() > 21) d.setHours(18);
  d.setMinutes(0, 0, 0);
  while (d.getTime() < Date.now() + 3_600_000) d.setTime(d.getTime() + 7 * 86_400_000);
  return d;
}

export const whenWords = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

const inviteOf = (r: RoomRow) => `${location.origin}/r/${r.invite_code}`;
const eventOf = (r: RoomRow): CalendarEvent => ({
  uid: `${r.id}@chalkroom.live`, title: r.title, start: new Date(r.starts_at ?? Date.now()), url: inviteOf(r),
  description: `Chalkroom Live class. Join with the invite link: ${inviteOf(r)}`,
});

type Mode = { k: 'closed' } | { k: 'form' } | { k: 'booked'; next: RoomRow };

export function BookNext({ room, variant = 'recap' }: { room: RoomRow; variant?: 'recap' | 'shelf' }) {
  const [mode, setMode] = useState<Mode>({ k: 'closed' });
  const [when, setWhen] = useState(() => localValue(defaultStart(room)));
  const [title, setTitle] = useState(room.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const id = useId();

  // already booked: show that session (the host is its member, so RLS lets them read it)
  useEffect(() => {
    if (!room.next_room_id) return;
    let live = true;
    void supabase.from('rooms').select('*').eq('id', room.next_room_id).maybeSingle().then((r) => {
      if (live && r.data && (r.data as RoomRow).phase !== 'ended') setMode({ k: 'booked', next: r.data as RoomRow });
    });
    return () => { live = false; };
  }, [room.next_room_id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const start = new Date(when);
    if (Number.isNaN(start.getTime())) { setError('Pick a date and a time.'); return; }
    if (start.getTime() < Date.now()) { setError('Pick a time that is still ahead.'); return; }
    setBusy(true);
    setError(null);
    try {
      const next = await api.nextSession(room.id, { startsAt: start.toISOString(), title: title.trim() || undefined });
      setMode({ k: 'booked', next });
    } catch (err) {
      setError((err as Error).message || 'Could not book the session.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  };

  const cls = `booknext booknext-${variant}`;

  if (mode.k === 'closed') {
    return (
      <div className={cls}>
        <button type="button" className="btn" onClick={() => setMode({ k: 'form' })}>
          <CalendarPlus {...ICON} />Book the next session
        </button>
      </div>
    );
  }

  if (mode.k === 'form') {
    return (
      <form className={`${cls} booknext-open step-in`} onSubmit={submit} aria-labelledby={`${id}-h`}>
        <h3 id={`${id}-h`} className="booknext-h">Book the next session</h3>
        <p className="booknext-lede">{room.course_id ? 'Same group, same course: the syllabus continues where this class stopped.' : 'Same group, same subject: a new class the group joins with one link.'}</p>
        <div className="booknext-fields">
          <label className="booknext-field">
            <span>Starts</span>
            <input className="input mono" type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} />
          </label>
          <label className="booknext-field grow">
            <span>Title</span>
            <input className="input" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
        </div>
        {error && <p className="errata" role="alert"><TriangleAlert {...ICON} />{error}</p>}
        <div className="booknext-actions">
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Booking' : 'Book it'}</button>
          <button type="button" className="btn ghost" onClick={() => { setMode({ k: 'closed' }); setError(null); }}>Cancel</button>
        </div>
      </form>
    );
  }

  const next = mode.next;
  const url = inviteOf(next);
  const ev = eventOf(next);
  return (
    <section className={`${cls} booknext-open step-in`} aria-labelledby={`${id}-b`}>
      <h3 id={`${id}-b`} className="booknext-h">Next session: {next.starts_at ? whenWords(next.starts_at) : 'not set'}</h3>
      <p className="booknext-lede">Send the group this link. It opens the new class on its day.</p>
      <div className="booknext-link">
        <input className="input" readOnly value={url} aria-label="Invite link to the next session" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn" onClick={() => void copy(url)}>
          {copied ? <><Check {...ICON} />Copied</> : <><Copy {...ICON} />Copy link</>}
        </button>
      </div>
      <div className="booknext-actions">
        <span className="booknext-cal">Add to calendar</span>
        <button type="button" className="btn small" onClick={() => download(`${fileStem(next.title)}.ics`, buildIcs(ev), 'text/calendar;charset=utf-8')}>
          <Download {...ICON} />Calendar file (.ics)
        </button>
        <a className="btn small" href={googleCalendarUrl(ev)} target="_blank" rel="noreferrer">
          <ExternalLink {...ICON} />Google Calendar
        </a>
        <button type="button" className="btn ghost small" onClick={() => {
          setWhen(localValue(new Date(next.starts_at ?? Date.now()))); setTitle(next.title); setMode({ k: 'form' });
        }}>Move it</button>
      </div>
    </section>
  );
}
