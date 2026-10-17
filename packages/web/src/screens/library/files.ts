// Lane L: files made on this device: a calendar invite (.ics, RFC 5545), a Google Calendar
// link, notes as Markdown and flashcards as an Anki CSV. Pure text builders plus one download helper.
import type { CardRow, ClusterRow, NoteBlockRow, QuestionRow } from '@chalk/schema';

const CRLF = '\r\n';

/** 2026-10-25T16:00:00.000Z -> 20261025T160000Z (UTC, the form both .ics and Google use). */
export function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** TEXT value escaping (RFC 5545 3.3.11): backslash, semicolon, comma and line breaks. */
export function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold a content line at 75 octets (RFC 5545 3.1), never inside a UTF-8 character. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const parts: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    // the first line holds 75 octets; continuation lines start with a space, so 74 more
    const limit = parts.length ? 74 : 75;
    if (bytes + n > limit) { parts.push(cur); cur = ''; bytes = 0; }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join(`${CRLF} `);
}

export interface CalendarEvent { uid: string; title: string; start: Date; minutes?: number; url: string; description?: string }

const endOf = (e: CalendarEvent) => new Date(e.start.getTime() + (e.minutes ?? 60) * 60_000);

/** A one-event calendar file: CRLF line ends, folded lines, escaped text. */
export function buildIcs(e: CalendarEvent, now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Chalkroom Live//Next session//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(e.start)}`,
    `DTEND:${icsDate(endOf(e))}`,
    `SUMMARY:${icsText(e.title)}`,
    `DESCRIPTION:${icsText(e.description ?? `Join the class: ${e.url}`)}`,
    `URL:${e.url}`,
    `LOCATION:${icsText(e.url)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join(CRLF) + CRLF;
}

/** Google Calendar's "add event" page, prefilled. */
export function googleCalendarUrl(e: CalendarEvent): string {
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${icsDate(e.start)}/${icsDate(endOf(e))}`,
    details: e.description ?? `Join the class: ${e.url}`,
    location: e.url,
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** One CSV field, always quoted, inner quotes doubled. */
export const csvField = (s: string) => `"${s.replace(/"/g, '""')}"`;

/**
 * Flashcards for Anki's "Import File": comma separated, plain text, front then back. The header
 * lines tell Anki 2.1.55+ the format; the BOM keeps non-Latin text intact in Excel and Anki.
 */
export function cardsCsv(cards: Pick<CardRow, 'front' | 'back' | 'status'>[]): string {
  const rows = cards.filter((c) => c.status !== 'suspended').map((c) => `${csvField(c.front.trim())},${csvField(c.back.trim())}`);
  return '\uFEFF' + ['#separator:Comma', '#html:false', '#columns:Front,Back', ...rows].join(CRLF) + CRLF;
}

/** Notes as one Markdown file: the class title, the date, then every block in order. */
export function notesMarkdown(title: string, date: string | null, notes: Pick<NoteBlockRow, 'idx' | 'markdown'>[]): string {
  const blocks = [...notes].sort((a, b) => a.idx - b.idx).map((n) => n.markdown.trim()).filter(Boolean);
  const head = [`# ${title}`, ...(date ? [`Chalkroom Live class, ${date}`] : [])].join('\n\n');
  return [head, ...blocks].join('\n\n') + '\n';
}

/** A safe file name from a class title. */
export function fileStem(title: string): string {
  return title.normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60) || 'class';
}

/** Hand the learner a file to save. */
export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Kudos for one class (same rule as the API's GET /me/kudos): my questions answered for the class
 * that others shared, and how many people that was.
 */
export function classKudos(me: string, questions: Pick<QuestionRow, 'author_id' | 'cluster_id' | 'votes'>[], clusters: Record<string, Pick<ClusterRow, 'route' | 'answered' | 'asker_count'>>) {
  let questionsHelped = 0;
  let peopleHelped = 0;
  for (const q of questions) {
    if (q.author_id !== me || !q.cluster_id) continue;
    const c = clusters[q.cluster_id];
    if (!c?.answered || (c.route !== 'class' && c.route !== 'inline')) continue;
    const others = Math.max(0, c.asker_count - 1) + Math.max(0, q.votes);
    if (others <= 0) continue;
    questionsHelped++;
    peopleHelped += others;
  }
  return { questionsHelped, peopleHelped };
}
