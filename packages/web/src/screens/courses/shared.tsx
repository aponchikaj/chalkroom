// Lane C: parts shared by Home (Start, Lobby, Courses) and the course page: a segmented choice,
// the public/private + start-time fields, star ratings, and opening a room.
import { useId } from 'react';
import { Star } from 'lucide-react';
import { api } from '../../lib/api';
import { navigate } from '../../lib/router';
import { joined } from '../../lib/profile';
import './courses.css';

/** A row of printed keys that behaves as one radio group. */
export function Seg<T extends string>({ label, value, options, onChange, name }: {
  label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void; name?: string;
}) {
  const id = useId();
  return (
    <fieldset className="seg-field">
      <legend className="field-label">{label}</legend>
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <label key={o.value} className={`seg-key${o.value === value ? ' on' : ''}`}>
            <input type="radio" name={name ?? id} value={o.value} checked={o.value === value} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export type Visibility = 'private' | 'public';
const VIS = [{ value: 'private', label: 'Private' }, { value: 'public', label: 'Public' }] as const;

/** "YYYY-MM-DDTHH:mm" in local time, for datetime-local min/value. */
export const localInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Public or private; a public class may carry a start time for the lobby. */
export function RoomOptions({ visibility, setVisibility, startsAt, setStartsAt }: {
  visibility: Visibility; setVisibility: (v: Visibility) => void; startsAt: string; setStartsAt: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="room-options">
      <Seg label="Who can join" value={visibility} options={VIS} onChange={setVisibility} />
      {visibility === 'public' && (
        <div className="field">
          <label className="field-label" htmlFor={`${id}-when`}>Starts at <span className="field-hint">optional</span></label>
          <input id={`${id}-when`} className="input" type="datetime-local" value={startsAt} min={localInput(new Date())}
            onChange={(e) => setStartsAt(e.target.value)} />
        </div>
      )}
      <p className="form-note">
        {visibility === 'public'
          ? 'Public classes are listed in the Lobby while seats are free, so anyone signed in can join.'
          : 'Only people with the invite code or link can join.'}
      </p>
    </div>
  );
}

/** The start time as ISO, or undefined; throws a plain-words error for a time in the past. */
export function startsAtIso(visibility: Visibility, local: string): string | undefined {
  if (visibility !== 'public' || !local) return undefined;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) throw new Error('That start time is not a date. Pick a day and time, or clear it.');
  if (d.getTime() < Date.now() - 60_000) throw new Error('That start time has passed. Pick a later time, or clear it to start when you are ready.');
  return d.toISOString();
}

/** Open a room and go into it. */
export async function openRoom(b: { title: string; courseId?: string; topicId?: string; visibility: Visibility; startsAt?: string }) {
  const { room } = await api.createRoom({ ...b, title: b.title.trim().slice(0, 80) });
  joined.add(room.invite_code);
  navigate(`/r/${room.invite_code}`);
}

/** Mean rating as printed figures: "4.3 (12)" or "No ratings yet". */
export function RatingText({ rating, ratings }: { rating: number | null; ratings: number }) {
  if (rating === null || !ratings) return <span className="rating-none">No ratings yet</span>;
  return (
    <span className="rating-text">
      <Star size={13} strokeWidth={2.5} aria-hidden className="rating-star" />
      <span className="mono">{rating.toFixed(1)}</span>
      <span className="rating-count">from <span className="mono">{ratings}</span> {ratings === 1 ? 'rating' : 'ratings'}</span>
    </span>
  );
}

/** Five star keys; `value` is my rating. */
export function StarInput({ value, onRate, busy }: { value: number | null; onRate: (n: number) => void; busy?: boolean }) {
  return (
    <div className="stars" role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} disabled={busy}
          className={`star-key${value !== null && n <= value ? ' on' : ''}`} aria-label={`${n} of 5`}
          onClick={() => onRate(n)}>
          <Star size={18} strokeWidth={2} aria-hidden />
        </button>
      ))}
    </div>
  );
}

/** Seats as punched holes plus "3/5" in figures. */
export function Seats({ taken, seats }: { taken: number; seats: number }) {
  return (
    <span className="seats" aria-label={`${taken} of ${seats} seats taken`}>
      <span className="seat-row" aria-hidden>{Array.from({ length: seats }, (_, i) => <i key={i} className={i < taken ? 'taken' : ''} />)}</span>
      <span className="mono">{taken}/{seats}</span>
    </span>
  );
}

const time = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

/** "Starts today 18:30", "Starts 21 Oct 09:00", "Starting soon". */
export function startWords(iso: string | null): { day: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const day = same(d, now) ? 'today' : same(d, tomorrow) ? 'tomorrow' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return { day, time: time(d) };
}
