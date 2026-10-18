// A7 (Dev A): the lobby leaf over the board while people arrive: the invite code at display
// scale, a QR code, Copy link, a share line for Discord / Telegram, what the class will cover
// (the plan's objectives once written; before Start, the topic, goal and course outline) and who
// is here.
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useShallow } from 'zustand/react/shallow';
import { Check, Copy, Share2 } from 'lucide-react';
import { selectActiveMembers, selectPresentMembers, selectIsHost, useRoom } from '../../room/store';
import { Punch } from '../../ui/Punch';
import './lobby.css';
import { nameFor } from '../../lib/text';
import { api } from '../../lib/api';

const ICON = { size: 16, strokeWidth: 2 } as const;

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function LobbyLeaf() {
  const room = useRoom((s) => s.room)!;
  const isHost = useRoom(selectIsHost);
  const me = useRoom((s) => s.me);
  const members = useRoom(useShallow(selectActiveMembers));
  const presence = useRoom((s) => s.presence);
  const here = useRoom((s) => selectPresentMembers(s).length);
  const host = members.find((m) => m.user_id === room.host_id);
  const url = `${location.origin}/r/${room.invite_code}`;
  const shareText = `Join my Chalkroom Live class "${room.title}": ${url} (code ${room.invite_code})`;
  const [qr, setQr] = useState('');
  const [done, setDone] = useState<'' | 'link' | 'share' | 'failed'>('');
  const timer = useRef<number>(0);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { margin: 0, width: 360, color: { dark: '#1b1a17', light: '#fbf8f1' } })
      .then((d) => { if (alive) setQr(d); }).catch(() => { if (alive) setQr(''); });
    return () => { alive = false; };
  }, [url]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const flash = (v: typeof done) => {
    setDone(v);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDone(''), 2400);
  };
  const copyLink = async () => flash((await copy(url)) ? 'link' : 'failed');
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: room.title, text: shareText, url }); return; } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    flash((await copy(shareText)) ? 'share' : 'failed');
  };
  const open = Math.max(0, room.seats - members.length);

  return (
    <div className="board-overlay lobby-overlay">
      <section className="lobby leaf hinge-in" aria-label="Invite people">
        <div className="lobby-main">
          <h2 className="lobby-title display-hand">{room.title}</h2>
          <p className="lobby-lede">
            {isHost ? 'Share the code or the QR code. Up to five people in one class.' : `You are in. ${host ? host.display_name : 'The host'} starts the class when everyone is here.`}
          </p>
          <div className="lobby-code">
            <span className="lobby-code-label">Invite code</span>
            <code className="lobby-code-value" aria-label={`Invite code ${room.invite_code.split('').join(' ')}`}>{room.invite_code}</code>
          </div>
          <div className="lobby-actions">
            <button className="btn" onClick={copyLink}>
              {done === 'link' ? <Check {...ICON} aria-hidden /> : <Copy {...ICON} aria-hidden />}
              {done === 'link' ? 'Link copied' : 'Copy link'}
            </button>
            <button className="btn" onClick={share}>
              {done === 'share' ? <Check {...ICON} aria-hidden /> : <Share2 {...ICON} aria-hidden />}
              {done === 'share' ? 'Invite text copied' : 'Share invite'}
            </button>
          </div>
          <p className="lobby-share-line" role="status">
            {done === 'failed' ? <span className="error-text">Copy did not work here. Select the link below and copy it by hand.</span>
              : done === 'share' ? 'Paste it into Discord or Telegram.'
              : 'Share invite opens your phone\'s share sheet, or copies a ready line for Discord or Telegram.'}
          </p>
          <p className="lobby-url mono">{url}</p>
        </div>

        <Objectives />

        <figure className="lobby-qr">
          {qr ? <img src={qr} alt={`QR code that opens ${url}`} width={180} height={180} /> : <span className="lobby-qr-blank">QR code unavailable. Use the link.</span>}
          <figcaption>Scan with a phone camera to join</figcaption>
        </figure>

        <div className="lobby-people">
          <h3 className="section-title">Here now, <span className="mono">{here}/{room.seats}</span></h3>
          <ul>
            {members.map((m) => (
              <li key={m.user_id} className="step-in">
                <Punch name={m.display_name} color={m.color} me={m.user_id === me} host={m.user_id === room.host_id} present={!!presence[m.user_id]} />
                <span>{nameFor(m.user_id, m.display_name, me)}</span>
              </li>
            ))}
            {Array.from({ length: open }, (_, i) => (
              <li key={`open${i}`} className="lobby-open"><span className="binding-ring" aria-hidden /><span>Open seat</span></li>
            ))}
          </ul>
          <p className="lobby-next">
            {isHost ? 'Press Start class in the bar below when everyone is here.' : 'Waiting for the host to start. The board fills in on its own.'}
          </p>
        </div>
      </section>
    </div>
  );
}

/** Up to six lines of a course syllabus: its headings, else its list items. */
export function syllabusOutline(md: string): string[] {
  const lines = md.split(/\r?\n/).map((l) => l.trim());
  const clean = (l: string) => l.replace(/^(#{1,6}|[-*+]|\d+[.)])\s+/, '').replace(/[*_`]/g, '').trim();
  const heads = lines.filter((l) => /^#{2,4}\s+\S/.test(l)).map(clean);
  const items = lines.filter((l) => /^([-*+]|\d+[.)])\s+\S/.test(l)).map(clean);
  return (heads.length >= 2 ? heads : items).filter(Boolean).slice(0, 6);
}

/** What the class will cover. Once the tutor wrote the plan (at Start), its parts and
 *  objectives; before that, what is already known: the topic, the host's goal, and the course
 *  outline for a class run from a course. Always shown, so the lobby never hides what is coming. */
function Objectives() {
  const plan = useRoom((s) => s.room?.lesson_plan ?? null);
  const goal = useRoom((s) => s.room?.goal?.trim() ?? '');
  const title = useRoom((s) => s.room?.title ?? '');
  const courseId = useRoom((s) => s.room?.course_id ?? null);
  const [course, setCourse] = useState<{ goal: string; outline: string[] } | null>(null);
  useEffect(() => {
    if (!courseId || plan) return;
    let alive = true;
    api.course(courseId)
      .then((c) => { if (alive) setCourse({ goal: c.goal.trim(), outline: syllabusOutline(c.syllabus_md ?? '') }); })
      .catch(() => { /* a private course or a blip: the topic and goal still show */ });
    return () => { alive = false; };
  }, [courseId, plan]);

  if (plan) {
    return (
      <section className="lobby-goals" aria-labelledby="lobby-goals-title">
        <h3 id="lobby-goals-title" className="section-title">By the end of this class you can</h3>
        <ol className="lobby-goal-list">
          {plan.segments.map((seg, i) => (
            <li key={i}><span className="lobby-goal-part">{seg.title}</span><span className="lobby-goal-obj">{seg.objective}</span></li>
          ))}
        </ol>
      </section>
    );
  }
  const aim = goal || course?.goal || '';
  return (
    <section className="lobby-goals" aria-labelledby="lobby-goals-title">
      <h3 id="lobby-goals-title" className="section-title">What this class covers</h3>
      <p className="lobby-goal-text">
        {aim && aim !== title ? aim : `A live lesson on ${title}, in short parts. Each part ends with a quick check, and the class moves on together.`}
      </p>
      {course && course.outline.length > 0 && (
        <ol className="lobby-goal-list lobby-outline">
          {course.outline.map((line, i) => <li key={i}><span className="lobby-goal-obj">{line}</span></li>)}
        </ol>
      )}
      <p className="lobby-goal-note">The tutor writes the lesson plan, part by part, when the host starts the class.</p>
    </section>
  );
}
