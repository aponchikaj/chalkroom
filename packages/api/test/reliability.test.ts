import { describe, it, expect } from 'vitest';
import { spammers } from '../src/triage/triage-plan';

describe('spammers', () => {
  it('lists authors with 3 or more flagged questions', () => {
    expect(spammers(['a', 'b', 'a', 'a', 'b', 'c'], 3)).toEqual(['a']);
    expect(spammers([], 3)).toEqual([]);
  });
});
