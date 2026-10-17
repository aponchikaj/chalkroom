// REST client for the NestJS API. Request bodies are typed by @chalk/schema's Api contracts.
import type { z } from 'zod';
import type { Api, CreateRoomRes, JoinRoomRes, NoteBlockRow, QuestionRow, RoomPreview, ThreadRow } from '@chalk/schema';
import { ensureSession, supabase } from './supabase';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';

type In<K extends keyof typeof Api> = z.input<(typeof Api)[K]>;

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function call<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (auth) {
    await ensureSession();
    const { data } = await supabase.auth.getSession();
    headers.authorization = `Bearer ${data.session?.access_token}`;
  }
  const r = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new ApiError(r.status, Array.isArray(j.message) ? j.message.join('; ') : j.message ?? r.statusText);
  }
  return (r.status === 204 ? undefined : await r.json()) as T;
}

export const api = {
  health: () => call<{ ok: boolean; model: string }>('GET', '/health', undefined, false),
  preview: (code: string) => call<RoomPreview>('GET', `/rooms/code/${encodeURIComponent(code)}`, undefined, false),
  createRoom: (b: In<'createRoom'>) => call<CreateRoomRes>('POST', '/rooms', b),
  joinRoom: (b: In<'joinRoom'>) => call<JoinRoomRes>('POST', '/rooms/join', b),
  leave: (roomId: string) => call<void>('POST', `/rooms/${roomId}/leave`, {}),
  start: (roomId: string) => call<{ ok: true }>('POST', `/rooms/${roomId}/start`, {}),
  ready: (roomId: string, b: In<'ready'>) => call<void>('POST', `/rooms/${roomId}/ready`, b),
  host: (roomId: string, b: In<'host'>) => call<{ ok: true }>('POST', `/rooms/${roomId}/host`, b),
  answerCheck: (roomId: string, checkId: string, b: In<'checkAnswer'>) => call<void>('POST', `/rooms/${roomId}/checks/${checkId}/answer`, b),
  react: (roomId: string, b: In<'react'>) => call<void>('POST', `/rooms/${roomId}/reactions`, b),
  ask: (roomId: string, b: In<'ask'>) => call<QuestionRow>('POST', `/rooms/${roomId}/questions`, b),
  vote: (questionId: string) => call<void>('POST', `/questions/${questionId}/vote`, {}),
  openThread: (roomId: string, b: In<'openThread'>) => call<ThreadRow>('POST', `/rooms/${roomId}/threads`, b),
  threadMessage: (threadId: string, b: In<'threadMessage'>) => call<void>('POST', `/threads/${threadId}/messages`, b),
  closeThread: (threadId: string) => call<void>('POST', `/threads/${threadId}/close`, {}),
  shareThread: (threadId: string, b: In<'shareThread'>) => call<void>('POST', `/threads/${threadId}/share`, b),
  editNote: (roomId: string, blockId: string, b: In<'editNote'>) => call<NoteBlockRow>('PUT', `/rooms/${roomId}/notes/${blockId}`, b),
};
