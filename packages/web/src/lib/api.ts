// REST client for the NestJS API. Request bodies are typed by @chalk/schema's Api contracts.
import type { z } from 'zod';
import type {
  Api, AvatarUploadRes, CourseCard, CourseRow, FaqRow, KudosRes, LobbyRoom, ReplayCard, ReplayRes, RoomRow, CardReviewRow, CreateRoomRes, JoinRoomRes, MeRes, NoteBlockRow, ProfileRow, PublicProfile, QuestionRow, RoomPreview, SourceRow,
  SourceUploadRes, ThreadRow, TtsEngine, TtsRes, TwoFactorState, UserSettings,
} from '@chalk/schema';
import { ensureSession, supabase } from './supabase';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';

type In<K extends keyof typeof Api> = z.input<(typeof Api)[K]>;

export class ApiError extends Error {
  /** machine code from the API body, e.g. "mfa_required" */
  constructor(public status: number, message: string, public code?: string) { super(message); }
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
    throw new ApiError(r.status, Array.isArray(j.message) ? j.message.join('; ') : j.message ?? r.statusText, j.code);
  }
  return (r.status === 204 ? undefined : await r.json()) as T;
}

export const api = {
  health: () => call<{ ok: boolean; model: string; tts?: TtsEngine }>('GET', '/health', undefined, false),
  // server voice (lib/serverVoice.ts)
  tts: (b: In<'tts'>) => call<TtsRes>('POST', '/tts', b),
  ttsStatus: (key: string) => call<TtsRes>('GET', `/tts/${key}`),
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
  moderate: (roomId: string, b: In<'moderate'>) => call<void>('POST', `/rooms/${roomId}/moderate`, b),
  reviewCard: (cardId: string, b: In<'reviewCard'>) => call<CardReviewRow>('POST', `/cards/${cardId}/review`, b),
  // account (B9-B11)
  me: () => call<MeRes>('GET', '/me'),
  updateProfile: (b: In<'updateProfile'>) => call<ProfileRow>('PATCH', '/me', b),
  deleteAccount: () => call<void>('DELETE', '/me'),
  settings: () => call<UserSettings>('GET', '/me/settings'),
  updateSettings: (b: In<'updateSettings'>) => call<UserSettings>('PATCH', '/me/settings', b),
  avatarUploadUrl: (b: In<'avatarUploadUrl'>) => call<AvatarUploadRes>('POST', '/me/avatar/upload-url', b),
  avatarCommit: (b: In<'avatarCommit'>) => call<MeRes>('POST', '/me/avatar', b),
  avatarDelete: () => call<void>('DELETE', '/me/avatar'),
  twoFactor: () => call<TwoFactorState>('GET', '/me/2fa'),
  // class materials (B12)
  sources: (roomId: string) => call<SourceRow[]>('GET', `/rooms/${roomId}/sources`),
  addSourceUrl: (roomId: string, b: In<'addSourceUrl'>) => call<SourceRow>('POST', `/rooms/${roomId}/sources/url`, b),
  sourceUploadUrl: (roomId: string, b: In<'sourceUploadUrl'>) => call<SourceUploadRes>('POST', `/rooms/${roomId}/sources/upload-url`, b),
  addSourceFile: (roomId: string, b: In<'addSourceFile'>) => call<SourceRow>('POST', `/rooms/${roomId}/sources`, b),
  deleteSource: (sourceId: string) => call<void>('DELETE', `/sources/${sourceId}`),
  // courses and lobby (lane C)
  courses: (query?: string) => call<CourseCard[]>('GET', `/courses${query ? `?q=${encodeURIComponent(query)}` : ''}`),
  course: (courseId: string) => call<CourseCard>('GET', `/courses/${courseId}`),
  courseFaq: (courseId: string) => call<FaqRow[]>('GET', `/courses/${courseId}/faq`),
  createCourse: (b: In<'createCourse'>) => call<CourseRow>('POST', '/courses', b),
  updateCourse: (courseId: string, b: In<'updateCourse'>) => call<CourseRow>('PATCH', `/courses/${courseId}`, b),
  forkCourse: (courseId: string, b: In<'forkCourse'>) => call<CourseRow>('POST', `/courses/${courseId}/fork`, b),
  rateCourse: (courseId: string, b: In<'rateCourse'>) => call<void>('POST', `/courses/${courseId}/rating`, b),
  lobby: () => call<LobbyRoom[]>('GET', '/lobby'),
  // live activities (lane M)
  startDuel: (roomId: string, b: In<'startDuel'>) => call<{ duelId: string }>('POST', `/rooms/${roomId}/duel`, b),
  duelAnswer: (roomId: string, b: In<'duelAnswer'>) => call<void>('POST', `/rooms/${roomId}/duel/answer`, b),
  startTeachback: (roomId: string, b: In<'startTeachback'>) => call<{ teachbackId: string }>('POST', `/rooms/${roomId}/teachback`, b),
  teachbackVolunteer: (roomId: string, b: In<'teachbackVolunteer'>) => call<void>('POST', `/rooms/${roomId}/teachback/volunteer`, b),
  teachbackExplain: (roomId: string, b: In<'teachbackExplain'>) => call<void>('POST', `/rooms/${roomId}/teachback/explain`, b),
  // library (lane L)
  replays: () => call<ReplayCard[]>('GET', '/replays'),
  replay: (roomId: string) => call<ReplayRes>('GET', `/rooms/${roomId}/replay`),
  nextSession: (roomId: string, b: In<'nextSession'>) => call<RoomRow>('POST', `/rooms/${roomId}/next`, b),
  kudos: () => call<KudosRes>('GET', '/me/kudos'),
  // questions and threads (lane Q)
  unmerge: (questionId: string) => call<QuestionRow>('POST', `/questions/${questionId}/unmerge`, {}),
  joinThread: (threadId: string) => call<ThreadRow>('POST', `/threads/${threadId}/join`, {}),
  editNote: (roomId: string, blockId: string, b: In<'editNote'>) => call<NoteBlockRow>('PUT', `/rooms/${roomId}/notes/${blockId}`, b),
  publicProfile: (username: string) => call<PublicProfile>('GET', `/users/${encodeURIComponent(username)}`),
};
