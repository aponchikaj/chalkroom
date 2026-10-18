// packages/api/test/host-notice.test.ts (lane C): the class notices host controls post.
import { describe, it, expect } from 'vitest';
import { StreamEventData } from '@chalk/schema';
import { hostNotice } from '../src/host/host-notice';

describe('hostNotice', () => {
  it('names the host and carries the control for every action', () => {
    for (const c of ['pause', 'resume', 'slower', 'skip', 'reexplain', 'pin'] as const) {
      const n = hostNotice(c, 'Ana', 'Finding the bump');
      expect(n.control).toBe(c);
      expect(n.text.startsWith('Ana ')).toBe(true);
      expect(() => StreamEventData.notice.parse(n)).not.toThrow();
    }
  });
  it('quotes and clips what was pinned, and falls back without a name', () => {
    expect(hostNotice('pin', 'Ana', 'Why 255?').text).toBe('Ana pinned "Why 255?" to the next Q&A.');
    expect(hostNotice('pin', 'Ana', 'x'.repeat(200)).text.length).toBeLessThan(130);
    expect(hostNotice('reexplain', '  ').text).toBe('The host asked the tutor to re-explain a figure in the next Q&A.');
  });
  it('keeps older notices valid (control is optional)', () => {
    expect(StreamEventData.notice.parse({ text: 'Class ended.' })).toEqual({ text: 'Class ended.', level: 'info' });
  });
});
