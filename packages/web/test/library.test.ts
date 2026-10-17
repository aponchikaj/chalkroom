// packages/web/test/library.test.ts (lane L): calendar invite, Anki CSV, Markdown export, kudos.
import { describe, it, expect } from 'vitest';
import { buildIcs, cardsCsv, classKudos, csvField, foldLine, googleCalendarUrl, icsText, notesMarkdown } from '../src/screens/library/files';

const ev = { uid: 'room-1@chalkroom.live', title: 'Solana PDAs, part 2', start: new Date('2026-10-25T16:00:00Z'), url: 'http://localhost:5173/r/ABC234' };

describe('buildIcs', () => {
  const ics = buildIcs(ev, new Date('2026-10-18T09:30:00Z'));
  it('is one VEVENT with CRLF line ends and a one hour default', () => {
    expect(ics.split('\r\n').filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/\n/);
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics).toContain('DTSTART:20261025T160000Z\r\n');
    expect(ics).toContain('DTEND:20261025T170000Z\r\n');
    expect(ics).toContain('DTSTAMP:20261018T093000Z\r\n');
    expect(ics).toContain('SUMMARY:Solana PDAs\\, part 2\r\n');
    expect(ics).toContain('URL:http://localhost:5173/r/ABC234\r\n');
  });
  it('folds long lines at 75 octets without splitting a character', () => {
    const long = buildIcs({ ...ev, title: 'ქართული '.repeat(20) });
    for (const line of long.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    const unfolded = long.replace(/\r\n /g, '');
    expect(unfolded).toContain(`SUMMARY:${'ქართული '.repeat(20)}`);
    expect(foldLine('x'.repeat(75))).toBe('x'.repeat(75));
    expect(foldLine('x'.repeat(76))).toBe(`${'x'.repeat(75)}\r\n x`);
  });
  it('escapes text values', () => {
    expect(icsText('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne');
  });
});

describe('googleCalendarUrl', () => {
  it('prefills title, dates and details', () => {
    const u = new URL(googleCalendarUrl(ev));
    expect(u.origin + u.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(u.searchParams.get('action')).toBe('TEMPLATE');
    expect(u.searchParams.get('text')).toBe('Solana PDAs, part 2');
    expect(u.searchParams.get('dates')).toBe('20261025T160000Z/20261025T170000Z');
    expect(u.searchParams.get('details')).toContain('/r/ABC234');
  });
});

describe('cardsCsv', () => {
  it('quotes every field, doubles quotes, starts with a BOM, skips suspended cards', () => {
    const csv = cardsCsv([
      { front: 'What is a "PDA"?', back: 'An address, no key,\nderived from seeds', status: 'active' },
      { front: 'Hidden', back: 'x', status: 'suspended' },
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split('\r\n');
    expect(lines.slice(0, 3)).toEqual(['#separator:Comma', '#html:false', '#columns:Front,Back']);
    expect(csv).toContain('"What is a ""PDA""?","An address, no key,\nderived from seeds"\r\n');
    expect(csv).not.toContain('Hidden');
    expect(csvField('a"b')).toBe('"a""b"');
  });
});

describe('notesMarkdown', () => {
  it('puts the title first and the blocks in idx order', () => {
    const md = notesMarkdown('PDAs', '18 October 2026', [{ idx: 1, markdown: '## Two' }, { idx: 0, markdown: '## One\n\nText' }, { idx: 2, markdown: '  ' }]);
    expect(md).toBe('# PDAs\n\nChalkroom Live class, 18 October 2026\n\n## One\n\nText\n\n## Two\n');
  });
});

describe('classKudos', () => {
  it('counts others who shared my answered question', () => {
    const k = classKudos('me', [
      { author_id: 'me', cluster_id: 'a', votes: 1 },
      { author_id: 'me', cluster_id: 'b', votes: 0 },
      { author_id: 'you', cluster_id: 'a', votes: 0 },
    ], { a: { route: 'class', answered: true, asker_count: 3 }, b: { route: 'class', answered: true, asker_count: 1 } });
    expect(k).toEqual({ questionsHelped: 1, peopleHelped: 3 });
  });
});
