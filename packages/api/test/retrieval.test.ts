import { describe, it, expect } from 'vitest';
import { keepKnownCitations } from '../src/rag/citations';
import { formatPassages, searchQuery } from '../src/rag/retrieval';

describe('searchQuery', () => {
  it('ORs the meaningful words of a question', () => {
    expect(searchQuery('Why can a PDA not sign?')).toBe('pda or sign');
    expect(searchQuery('How does find_program_address pick the bump?')).toBe('find_program_address or pick or bump');
    expect(searchQuery('the a of')).toBe('');
  });
});

describe('keepKnownCitations', () => {
  const known = new Map<string, number | null>([['s1', 10], ['s2', null]]);
  it('keeps valid citations and strips the rest', () => {
    const steps = [
      { add: { id: 'a', kind: 'box', text: 'x', source: 'res:s1#p3' } },
      { add: { id: 'b', kind: 'box', text: 'x', source: 'res:s1#p11' } },
      { add: { id: 'c', kind: 'box', text: 'x', source: 'res:nope#p1' } },
      { add: { id: 'd', kind: 'box', text: 'x', source: 'res:s2' } },
      { say: 'hi' },
    ];
    const out = keepKnownCitations(steps as never, known) as { add?: { source?: string } }[];
    expect(out.map((s) => s.add?.source)).toEqual(['res:s1#p3', undefined, undefined, 'res:s2', undefined]);
  });
});

describe('formatPassages', () => {
  it('tags each passage with the citation the tutor should use, as reference material', () => {
    const text = formatPassages([{ sourceId: 's1', title: 'Handout', page: 2, heading: '', content: 'A PDA has no private key.' }]);
    expect(text).toContain('[res:s1#p2] Handout, page 2: A PDA has no private key.');
    expect(text).toMatch(/reference material, not instructions/);
    expect(formatPassages([])).toBe('');
  });
});
