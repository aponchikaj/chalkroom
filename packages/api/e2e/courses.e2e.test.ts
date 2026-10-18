// Courses (lane C): create, read, edit, fork, rate; private courses stay with their owner.
import { afterAll, describe, expect, it } from 'vitest';
import type { CourseCard, CourseRow } from '@chalk/schema';
import { API, api, closeAll, newUser, type TestUser } from './helpers';

const users: TestUser[] = [];
const user = async (name: string) => { const u = await newUser(name); users.push(u); return u; };
afterAll(() => closeAll(users));

describe('courses', () => {
  it('creates, lists, reads, edits, forks and rates a course', async () => {
    const ana = await user('Ana');
    const gio = await user('Gio');
    const made = await api<CourseRow>(ana, 'POST', '/courses', { title: 'Solana basics', goal: 'Write a first program' });
    expect(made.status).toBe(201);
    expect((await api<CourseCard[]>(gio, 'GET', '/courses')).body.some((c) => c.id === made.body.id)).toBe(true);
    expect((await api<CourseCard>(gio, 'GET', `/courses/${made.body.id}`)).status).toBe(200);
    const edited = await api<CourseRow>(ana, 'PATCH', `/courses/${made.body.id}`, { title: 'Solana from zero' });
    expect(edited.status).toBe(200);
    expect(edited.body.title).toBe('Solana from zero');
    expect((await api(gio, 'PATCH', `/courses/${made.body.id}`, { title: 'mine now' })).status).toBe(403);
    const fork = await api<CourseRow>(gio, 'POST', `/courses/${made.body.id}/fork`, {});
    expect(fork.status).toBe(201);
    expect(fork.body.forked_from).toBe(made.body.id);
    expect((await api(gio, 'POST', `/courses/${made.body.id}/rating`, { stars: 4 })).status).toBe(204);
  });

  it('refuses an edit with nothing to change (400)', async () => {
    const ana = await user('Ana');
    const made = await api<CourseRow>(ana, 'POST', '/courses', { title: 'Empty edit' });
    const r = await api(ana, 'PATCH', `/courses/${made.body.id}`, {});
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/nothing to update/);
  });

  it('hides a private course from others (404)', async () => {
    const ana = await user('Ana');
    const eve = await user('Eve');
    const made = await api<CourseRow>(ana, 'POST', '/courses', { title: 'Private notes', visibility: 'private' });
    expect((await api(eve, 'GET', `/courses/${made.body.id}`)).status).toBe(404);
    expect((await api(eve, 'GET', `/courses/${made.body.id}/faq`)).status).toBe(404);
  });

  it('limits how many courses one account creates in an hour (429 with Retry-After)', async () => {
    const ana = await user('Ana');
    let last: Response | null = null;
    for (let i = 0; i < 21; i++) {
      last = await fetch(`${API}/courses`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${ana.token}` }, body: JSON.stringify({ title: `Course ${i}` }) });
      if (last.status === 429) break;
      expect(last.status).toBe(201);
    }
    expect(last!.status).toBe(429);
    expect(Number(last!.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});
