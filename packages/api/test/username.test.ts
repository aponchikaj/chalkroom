import { describe, it, expect } from 'vitest';
import { usernameProblem } from '../src/accounts/username';

describe('usernameProblem', () => {
  it.each(['ana_k', 'AnaK', 'a_1', 'x'.repeat(24)])('accepts %s', (u) => {
    expect(usernameProblem(u)).toBeNull();
  });

  it.each([
    ['ab', 'too short'],
    ['x'.repeat(25), 'too long'],
    ['ana k', 'letters'],
    ['ana-k', 'letters'],
    ['ანა', 'letters'],
  ])('rejects %s (%s)', (u, why) => {
    expect(usernameProblem(u)).toContain(why);
  });
});
