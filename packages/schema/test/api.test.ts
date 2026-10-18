import { describe, it, expect } from 'vitest';
import { Api } from '../src';

describe('Api.updateCourse', () => {
  it('refuses an edit with nothing to change', () => {
    expect(Api.updateCourse.safeParse({}).success).toBe(false);
    expect(Api.updateCourse.safeParse({ title: 'New' }).success).toBe(true);
  });
});
