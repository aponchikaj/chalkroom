// Chalkroom Live contracts. This file is the seam between the two halves of the team:
// the API writes these shapes, the web reads them. Change them here first, in one PR.
import { z } from 'zod';
import { BoardStep, FsrsState, Question } from './core';

// ---------------------------------------------------------------------------
// Room phase (owned by the API's RoomConductor, stored in rooms.phase)
// ---------------------------------------------------------------------------

/**
 * lobby → teaching → check → qa → teaching → … → ended
 * teaching: the lead tutor streams a segment to `main`
 * check:    the segment's check is open and the ready gate is counting
 * qa:       the lead tutor answers class-routed clusters, then the next segment starts
 */
export const Phase = z.enum(['lobby', 'teaching', 'check', 'qa', 'ended']);
export type Phase = z.infer<typeof Phase>;

export const MemberRole = z.enum(['host', 'learner']);
export type MemberRole = z.infer<typeof MemberRole>;

export const StreamKind = z.enum(['main', 'thread']);
export type StreamKind = z.infer<typeof StreamKind>;

// ---------------------------------------------------------------------------
// Lesson plan (written by the lead tutor's planner at Start, stored in rooms.lesson_plan)
// ---------------------------------------------------------------------------

export const PlannedSegment = z.object({
  title: z.string(),
  objective: z.string().describe('one sentence: what the class can do after this segment'),
});
export type PlannedSegment = z.infer<typeof PlannedSegment>;

export const LessonPlan = z.object({
  topic: z.string(),
  segments: z.array(PlannedSegment).min(1).max(12),
});
export type LessonPlan = z.infer<typeof LessonPlan>;

// ---------------------------------------------------------------------------
// Stream events: the append-only log. Only the API (agents) writes them.
// Row in `events`; delivered to clients by the DB trigger as broadcast event "event".
// ---------------------------------------------------------------------------

/** A check as learners see it: the answer is stripped until check_closed. */
export const PublicQuestion = Question.omit({ answer: true, accept: true, tolerance: true, rubric: true, explanation: true });
export type PublicQuestion = z.infer<typeof PublicQuestion>;

export const CheckSpread = z.object({
  total: z.number().int(),
  correct: z.number().int(),
  /** answer key → count; mcq uses the option index as key */
  counts: z.record(z.string(), z.number().int()),
});
export type CheckSpread = z.infer<typeof CheckSpread>;

export const StreamEventData = {
  /** A new segment begins on `main` (or a thread starts a sub-topic). */
  segment_start: z.object({ segment: z.number().int(), title: z.string() }),
  /** Board Script steps, same shape as v1 board_run. `say` steps are narration. */
  board: z.object({ steps: z.array(BoardStep).min(1), page: z.string().optional() }),
  /** The end-of-segment check. Answers go to POST /rooms/:id/checks/:checkId/answer. */
  check: z.object({ checkId: z.string(), segment: z.number().int(), question: PublicQuestion }),
  /** The check closed: spread for the class + the correct answer. */
  check_closed: z.object({
    checkId: z.string(),
    spread: CheckSpread,
    answer: z.unknown(),
    answerText: z.string(),
    explanation: z.string().optional(),
  }),
  /** Q&A beat: the lead tutor answers a class-routed cluster on the board and credits askers. */
  answer_cluster: z.object({
    clusterId: z.string(),
    title: z.string(),
    askers: z.array(z.string()).describe('display names, for the credit line'),
    steps: z.array(BoardStep).min(1),
  }),
  /** Segment finished; the scribe may attach a 3-line summary later via segment_summary. */
  segment_end: z.object({ segment: z.number().int() }),
  /** Scribe output for a finished segment (used by catch-up cards and thread context). */
  segment_summary: z.object({ segment: z.number().int(), title: z.string(), summary: z.string() }),
  /** Chat line in a thread stream (tutor or learner). */
  chat: z.object({ role: z.enum(['tutor', 'learner']), markdown: z.string(), authorId: z.string().optional() }),
  /** Small system line ("Class ended", "Tutor is retrying…"). */
  notice: z.object({
    text: z.string(),
    level: z.enum(['info', 'warn']).default('info'),
    /** set when a host control posted it (lane C); pause and resume also pause or resume the
     *  tutor's narration on every device in the class */
    control: z.enum(['pause', 'resume', 'slower', 'skip', 'reexplain', 'pin']).optional(),
  }),
  // --- live activities on `main` (lane M): quiz duel and teach-back ---
  /** A quiz duel begins: every learner answers the same questions against the clock. */
  duel_start: z.object({ duelId: z.string(), count: z.number().int().min(1).max(10), secondsPerQuestion: z.number().int().min(5).max(120) }),
  /** One duel question is open until `endsAt` (ISO). Answers: POST /rooms/:id/duel/answer. */
  duel_question: z.object({ duelId: z.string(), index: z.number().int(), question: PublicQuestion, endsAt: z.string() }),
  /** The question closed: the class spread, the answer and the running leaderboard. */
  duel_result: z.object({
    duelId: z.string(), index: z.number().int(), spread: CheckSpread, answer: z.unknown(), answerText: z.string(),
    leaders: z.array(z.object({ userId: z.string(), name: z.string(), points: z.number().int() })),
  }),
  /** The duel is over: final leaderboard, and what the tutor will re-teach (most missed). */
  duel_end: z.object({ duelId: z.string(), leaders: z.array(z.object({ userId: z.string(), name: z.string(), points: z.number().int() })), reteach: z.string().optional() }),
  /** Teach-back: the tutor invites a volunteer to explain a concept in their own words. */
  teachback_invite: z.object({ teachbackId: z.string(), concept: z.string(), prompt: z.string() }),
  /** Someone volunteered; only they can submit the explanation. */
  teachback_volunteer: z.object({ teachbackId: z.string(), userId: z.string(), name: z.string() }),
  /** The volunteer's explanation, shown to the class. */
  teachback_explanation: z.object({ teachbackId: z.string(), userId: z.string(), name: z.string(), text: z.string() }),
  /** The tutor's response: what was right, what was missing, optionally drawn on the board. */
  teachback_feedback: z.object({ teachbackId: z.string(), markdown: z.string(), missing: z.array(z.string()), steps: z.array(BoardStep).optional() }),
} as const;

export type StreamEventKind = keyof typeof StreamEventData;
export const StreamEventKind = z.enum(Object.keys(StreamEventData) as [StreamEventKind, ...StreamEventKind[]]);
export type StreamEventDataOf<K extends StreamEventKind> = z.infer<(typeof StreamEventData)[K]>;

/** One row of `events`, as it arrives on the realtime channel or from a snapshot fetch. */
export interface StreamEvent<K extends StreamEventKind = StreamEventKind> {
  stream_id: string;
  room_id: string;
  seq: number;
  kind: K;
  data: StreamEventDataOf<K>;
  /** 'lead' | 'thread' | 'scribe' | 'system' | a user id */
  actor: string;
  t: string;
}

/** Validate event data before it is stored. Throws a ZodError on bad data. */
export function parseEventData<K extends StreamEventKind>(kind: K, data: unknown): StreamEventDataOf<K> {
  return StreamEventData[kind].parse(data) as StreamEventDataOf<K>;
}

// ---------------------------------------------------------------------------
// Room-state rows. Written by the API (service role), broadcast by the DB trigger as
// broadcast event "row" with payload RowChange. Clients read snapshots with RLS.
// Field names match the SQL columns (snake_case) on purpose.
// ---------------------------------------------------------------------------

export interface RoomRow {
  id: string;
  course_id: string | null;
  topic_id: string | null;
  title: string;
  goal: string;
  /** null once the host deleted their account (ended rooms only) */
  host_id: string | null;
  phase: Phase;
  segment: number;
  visibility: 'private' | 'public';
  seats: number;
  invite_code: string;
  lesson_plan: LessonPlan | null;
  main_stream_id: string;
  gate_deadline: string | null;
  gate_held: boolean;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  /** planned start for lobby listings (lane C); null starts when the host says so */
  starts_at?: string | null;
  /** "Book the next session" created this follow-up room (lane L) */
  next_room_id?: string | null;
}

export interface MemberRow {
  room_id: string;
  user_id: string;
  role: MemberRole;
  display_name: string;
  color: string;
  joined_at: string;
  left_at: string | null;
  /** the host muted this member: they cannot ask (always sent by the database) */
  muted?: boolean;
  /** the host removed this member: they cannot rejoin or read the room */
  banned?: boolean;
}

export const QuestionStatus = z.enum([
  'pending', // waiting for triage (UX rule: must change within ~5 s)
  'grouped', // in a class-routed cluster → answered in the next Q&A beat
  'later', // the plan covers it in an upcoming segment
  'answered', // short inline answer in the rail
  'thread', // a thread was offered / opened for the asker
  'flagged', // triage flagged it as abuse/off-topic
]);
export type QuestionStatus = z.infer<typeof QuestionStatus>;

export interface QuestionRow {
  id: string;
  room_id: string;
  author_id: string;
  author_name: string;
  text: string;
  anchor: QuestionAnchor | null;
  segment: number;
  cluster_id: string | null;
  status: QuestionStatus;
  votes: number;
  created_at: string;
}

export const ClusterRoute = z.enum(['class', 'later', 'inline', 'thread']);
export type ClusterRoute = z.infer<typeof ClusterRoute>;

export interface ClusterRow {
  id: string;
  room_id: string;
  title: string;
  route: ClusterRoute | null;
  reason: string | null;
  target_segment: number | null;
  answer: string | null; // inline answer, or the class answer's short text
  answered: boolean;
  asker_count: number;
  created_at: string;
}

export const ThreadStatus = z.enum(['offered', 'open', 'closed']);
export type ThreadStatus = z.infer<typeof ThreadStatus>;

export interface ThreadRow {
  id: string;
  room_id: string;
  owner_id: string;
  stream_id: string;
  topic: string;
  status: ThreadStatus;
  shared_answer: string | null;
  /** main-stream seq when the learner left the class (for the catch-up card) */
  left_main_seq: number | null;
  /** classmates who joined this thread from a peek (lane Q); they may post too */
  members?: string[];
  created_at: string;
}

export interface ReadyVoteRow { room_id: string; segment: number; user_id: string; created_at: string }
export interface CheckAnswerRow { check_id: string; room_id: string; user_id: string; correct: boolean | null; created_at: string }
export interface ReactionRow { room_id: string; user_id: string; shape_id: string; kind: ReactionKind; created_at: string }
export interface NoteBlockRow { id: string; room_id: string; idx: number; markdown: string; edited_by: string | null; version: number; updated_at: string }

export type RowTable = 'rooms' | 'room_members' | 'questions' | 'clusters' | 'threads' | 'ready_votes' | 'check_answers' | 'reactions' | 'note_blocks';

export interface RowTypes {
  rooms: RoomRow;
  room_members: MemberRow;
  questions: QuestionRow;
  clusters: ClusterRow;
  threads: ThreadRow;
  ready_votes: ReadyVoteRow;
  check_answers: CheckAnswerRow;
  reactions: ReactionRow;
  note_blocks: NoteBlockRow;
}

export type RowChange = {
  [T in RowTable]: { table: T; op: 'INSERT' | 'UPDATE' | 'DELETE'; row: RowTypes[T] };
}[RowTable];

// ---------------------------------------------------------------------------
// Realtime channel `room:{roomId}` (private)
// ---------------------------------------------------------------------------

export const roomTopic = (roomId: string) => `room:${roomId}`;

/** Broadcast event names on the room channel. */
export const RT = {
  /** DB → clients: one StreamEvent */
  event: 'event',
  /** DB → clients: one RowChange */
  row: 'row',
  /** client → clients: laser pointer, throttled to 20 Hz, never stored */
  laser: 'laser',
} as const;

/** What each client tracks with Supabase Presence. Not stored. */
export interface PresenceState {
  userId: string;
  name: string;
  color: string;
  /** thread id when the learner is in a thread drawer */
  threadId: string | null;
  typing: boolean;
  /** note block id this learner is editing (one editor per block) */
  editing?: string | null;
  onlineAt: string;
}

export interface LaserPayload { userId: string; color: string; at: [number, number] | null }

// ---------------------------------------------------------------------------
// REST API (web → NestJS). Every request carries `Authorization: Bearer <supabase jwt>`.
// ---------------------------------------------------------------------------

export const QuestionAnchor = z.object({
  streamId: z.string(),
  shapeIds: z.array(z.string()).min(1),
});
export type QuestionAnchor = z.infer<typeof QuestionAnchor>;

export const ReactionKind = z.enum(['confused', 'got_it']);
export type ReactionKind = z.infer<typeof ReactionKind>;

export const DisplayName = z.string().trim().min(1).max(32);
export const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
// ---------------------------------------------------------------------------
// Knowledge (RAG): material the tutors search and cite
// ---------------------------------------------------------------------------

export const SourceKind = z.enum(['file', 'url', 'syllabus', 'notes', 'faq', 'transcript']);
export type SourceKind = z.infer<typeof SourceKind>;
export const SourceStatus = z.enum(['pending', 'processing', 'ready', 'failed']);
export type SourceStatus = z.infer<typeof SourceStatus>;
/** Upload types; the `resources` bucket also enforces these and a 50 MiB limit. */
export const SourceFileType = z.enum([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
]);
export type SourceFileType = z.infer<typeof SourceFileType>;

/** Board Script citation: a shape's `source` is "res:<source id>#p<page>" (page optional). */
export const citation = (sourceId: string, page?: number | null) => `res:${sourceId}${page ? `#p${page}` : ''}`;

/** What an emailed 2FA code is for. */
export const OtpPurpose = z.enum(['login', 'enable', 'disable']);
export type OtpPurpose = z.infer<typeof OtpPurpose>;

/** Profile picture types; the `avatars` bucket also enforces these and a 2 MiB limit. */
export const AvatarType = z.enum(['image/png', 'image/jpeg', 'image/webp']);
/** Same rule as the profiles_username_format check; unique ignoring case. */
export const Username = z.string().trim().regex(/^[A-Za-z0-9_]{3,24}$/, 'use 3 to 24 letters, digits or _');

/** Per-user preferences (row of `user_settings`; defaults until first saved). Text only for
 *  people: there is no microphone setting, only how the AI tutor's voice plays. */
export const UserSettings = z.object({
  /** play the tutor's spoken lines (browser TTS) */
  tutorVoice: z.boolean(),
  /** tutor speech rate, 0.5 to 2 */
  voiceRate: z.number().min(0.5).max(2),
  /** show captions of the tutor's lines */
  captions: z.boolean(),
  /** fewer board animations */
  reducedMotion: z.boolean(),
  theme: z.enum(['system', 'light', 'dark']),
  /** interface language */
  language: z.enum(['en', 'ka']),
  /** account emails (class notes, security notices); 2FA codes are always sent */
  emailNotifications: z.boolean(),
});
export type UserSettings = z.infer<typeof UserSettings>;
export const DEFAULT_SETTINGS: UserSettings = {
  tutorVoice: true, voiceRate: 1, captions: true, reducedMotion: false, theme: 'system', language: 'en', emailNotifications: true,
};

export const Api = {
  /** POST /rooms → CreateRoomRes */
  createRoom: z.object({
    title: z.string().trim().min(1).max(80).describe('topic the class will learn, e.g. "Solana PDAs"'),
    courseId: z.string().uuid().optional(),
    topicId: z.string().optional(),
    goal: z.string().max(500).optional(),
    /** defaults to the caller's profile */
    displayName: DisplayName.optional(),
    /** defaults to the caller's profile */
    color: Color.optional(),
    visibility: z.enum(['private', 'public']).default('private'),
    /** lobby start time (lane C) */
    startsAt: z.string().datetime().optional(),
  }),
  /** POST /rooms/join → JoinRoomRes */
  joinRoom: z.object({ inviteCode: z.string().trim().min(4).max(12), displayName: DisplayName.optional(), color: Color.optional() }),
  /** POST /rooms/:id/start (host) */
  start: z.object({}),
  /** POST /rooms/:id/ready */
  ready: z.object({ segment: z.number().int() }),
  /** POST /rooms/:id/host (host) */
  host: z.object({ action: z.enum(['skip', 'hold', 'resume', 'slower', 'end']) }),
  /** POST /rooms/:id/host/control (host, lane C): pause or resume the tutor's voice for the class,
   *  or Slower / Skip; each posts a class notice */
  hostControl: z.object({ action: z.enum(['pause', 'resume', 'slower', 'skip']) }),
  /** POST /rooms/:id/host/reexplain (host, lane C): the tutor re-explains these shapes in the next Q&A */
  hostReexplain: z.object({ shapeIds: z.array(z.string()).min(1).max(20), label: z.string().trim().max(120).optional() }),
  /** POST /rooms/:id/host/pin (host, lane C): this question's group is answered in the next Q&A */
  hostPin: z.object({ questionId: z.string().uuid() }),
  /** POST /rooms/:id/moderate (host): mute, unmute or remove (kick) a member */
  moderate: z.object({ userId: z.string().uuid(), action: z.enum(['mute', 'unmute', 'kick']) }),
  /** POST /rooms/:id/checks/:checkId/answer */
  checkAnswer: z.object({ answer: z.unknown() }),
  /** POST /rooms/:id/questions → QuestionRow  (rate limit 6/min/user) */
  ask: z.object({ text: z.string().trim().min(1).max(500), anchor: QuestionAnchor.optional() }),
  /** POST /questions/:id/vote (anonymous +1, toggles) */
  vote: z.object({}),
  /** POST /rooms/:id/reactions (toggles) */
  react: z.object({ shapeId: z.string(), kind: ReactionKind }),
  /** POST /rooms/:id/threads → ThreadRow (open a thread, or accept an offered one with threadId) */
  openThread: z.object({ topic: z.string().max(120).optional(), threadId: z.string().uuid().optional(), questionId: z.string().uuid().optional() }),
  /** POST /threads/:id/messages */
  threadMessage: z.object({ text: z.string().trim().min(1).max(1000) }),
  /** POST /threads/:id/close */
  closeThread: z.object({}),
  /** POST /threads/:id/share → posts the thread's best answer to the question rail */
  shareThread: z.object({ markdown: z.string().max(2000).optional() }),
  /** PATCH /me -> ProfileRow (409 when the username is taken) */
  updateProfile: z.object({
    username: Username.optional(),
    displayName: DisplayName.optional(),
    color: Color.optional(),
    bio: z.string().max(280).optional(),
  }).refine((b) => Object.values(b).some((v) => v !== undefined), 'nothing to update'),
  /** PATCH /me/settings -> UserSettings (any subset of fields) */
  updateSettings: UserSettings.partial().refine((b) => Object.keys(b).length > 0, 'nothing to update'),
  /** POST /rooms/:id/sources/url -> SourceRow. scope course: the course owner or room host only. */
  addSourceUrl: z.object({ url: z.string().url().max(2000), title: z.string().trim().min(1).max(200).optional(), scope: z.enum(['room', 'course']).default('room') }),
  /** POST /rooms/:id/sources/upload-url -> SourceUploadRes. Then upload with storage.from('resources').uploadToSignedUrl. */
  sourceUploadUrl: z.object({ fileName: z.string().trim().min(1).max(200), contentType: SourceFileType, size: z.number().int().positive().max(52_428_800) }),
  /** POST /rooms/:id/sources -> SourceRow: index an uploaded file */
  addSourceFile: z.object({ path: z.string().max(300), title: z.string().trim().min(1).max(200), scope: z.enum(['room', 'course']).default('room') }),
  /** POST /me/2fa/email/send (202): email a 6-digit code. login: unlock this session; enable/disable: toggle email 2FA. */
  emailCodeSend: z.object({ purpose: OtpPurpose }),
  /** POST /me/2fa/email/verify -> TwoFactorState */
  emailCodeVerify: z.object({ purpose: OtpPurpose, code: z.string().regex(/^\d{6}$/, 'a 6-digit code') }),
  /** POST /me/avatar/upload-url -> AvatarUploadRes. Then upload the file to Storage with uploadToSignedUrl. */
  avatarUploadUrl: z.object({ contentType: AvatarType }),
  /** POST /me/avatar -> MeRes. Makes the uploaded file the profile picture (and removes the old one). */
  avatarCommit: z.object({ path: z.string().max(200) }),
  /** POST /cards/:id/review -> CardReviewRow (the API schedules the next review with FSRS) */
  reviewCard: z.object({ rating: z.enum(['again', 'hard', 'good', 'easy']) }),
  // --- courses and lobby (lane C) ---
  /** POST /courses -> CourseRow. Without syllabusMd the planner drafts one from title + goal. */
  createCourse: z.object({ title: z.string().trim().min(1).max(120), goal: z.string().max(500).optional(), syllabusMd: z.string().max(20000).optional(), visibility: z.enum(['public', 'private']).default('public') }),
  /** PATCH /courses/:id (owner) -> CourseRow */
  updateCourse: z.object({ title: z.string().trim().min(1).max(120).optional(), goal: z.string().max(500).optional(), syllabusMd: z.string().max(20000).optional(), visibility: z.enum(['public', 'private']).optional() })
    .refine((b) => Object.values(b).some((v) => v !== undefined), 'nothing to update'),
  /** POST /courses/:id/fork -> CourseRow (a private copy owned by the caller) */
  forkCourse: z.object({ title: z.string().trim().min(1).max(120).optional() }),
  /** POST /courses/:id/rating (one per user, replaces) */
  rateCourse: z.object({ stars: z.number().int().min(1).max(5) }),
  // --- live activities (lane M) ---
  /** POST /rooms/:id/duel (host) */
  startDuel: z.object({ count: z.number().int().min(3).max(8).default(5), secondsPerQuestion: z.number().int().min(10).max(60).default(20) }),
  /** POST /rooms/:id/duel/answer */
  duelAnswer: z.object({ duelId: z.string(), index: z.number().int(), answer: z.unknown() }),
  /** POST /rooms/:id/teachback (host); concept defaults to the current segment's objective */
  startTeachback: z.object({ concept: z.string().max(200).optional() }),
  /** POST /rooms/:id/teachback/volunteer */
  teachbackVolunteer: z.object({ teachbackId: z.string() }),
  /** POST /rooms/:id/teachback/explain (the volunteer only) */
  teachbackExplain: z.object({ teachbackId: z.string(), text: z.string().trim().min(1).max(2000) }),
  // --- library (lane L) ---
  /** POST /rooms/:id/next (host) -> RoomRow: book the next session of this group */
  nextSession: z.object({ startsAt: z.string().datetime(), title: z.string().trim().min(1).max(80).optional() }),
  // --- questions and threads (lane Q) ---
  /** POST /questions/:id/unmerge (asker or host) -> QuestionRow: take it out of its group */
  unmerge: z.object({}),
  /** POST /threads/:id/join -> ThreadRow: a classmate joins a thread they were peeking at */
  joinThread: z.object({}),
  /** PUT /rooms/:id/notes/:blockId */
  editNote: z.object({ markdown: z.string().max(5000), version: z.number().int() }),
} as const;

export type CreateRoomReq = z.input<typeof Api.createRoom>;
export type UpdateProfileReq = z.input<typeof Api.updateProfile>;
export type JoinRoomReq = z.input<typeof Api.joinRoom>;
export interface CreateRoomRes { room: RoomRow; inviteUrl: string }
export interface JoinRoomRes { room: RoomRow; member: MemberRow }
// ---------------------------------------------------------------------------
// Accounts (accounts are required; signup, login and password reset are Supabase Auth)
// ---------------------------------------------------------------------------

/** Row of `profiles`: public information only, readable by any signed-in user. */
export interface ProfileRow {
  id: string;
  username: string;
  display_name: string;
  color: string;
  /** object key in the public `avatars` bucket */
  avatar_path: string | null;
  bio: string;
  created_at: string;
  updated_at: string;
}

/** GET /me: everything the web needs about the signed-in user, in one call. */
export interface MeRes {
  profile: ProfileRow;
  /** public URL of the profile picture, or null */
  avatarUrl: string | null;
  email: string | null;
  settings: UserSettings;
  security: TwoFactorState;
}


/** Row of `sources` (GET /rooms/:id/sources). Ingest moves it pending -> processing -> ready | failed. */
export interface SourceRow {
  id: string;
  course_id: string | null;
  room_id: string | null;
  kind: SourceKind;
  title: string;
  uri: string | null;
  mime: string | null;
  status: SourceStatus;
  error: string | null;
  page_count: number | null;
  chunk_count: number;
  /** sha-256 of the file or text: the same content is stored once per room or course
   *  (optional in the type so older fixtures still compile; the API always sends it) */
  checksum?: string | null;
  /** ingest tries so far (claim_source gives up after 3); the API always sends it */
  attempts?: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** POST /rooms/:id/sources/upload-url */
export interface SourceUploadRes { path: string; token: string; signedUrl: string }

/** GET /users/:username: what anyone signed in may see (no email). */
export interface PublicProfile {
  id: string;
  username: string;
  display_name: string;
  color: string;
  bio: string;
  avatarUrl: string | null;
}

/** POST /me/avatar/upload-url */
export interface AvatarUploadRes {
  /** object key in the `avatars` bucket: "<user id>/<uuid>.<ext>" */
  path: string;
  /** for supabase.storage.from('avatars').uploadToSignedUrl(path, token, file) */
  token: string;
  signedUrl: string;
}

/** Second-factor state of the caller and this session. When `mfaPassed` is false the API
 *  answers 401 { code: "mfa_required" } on every route except GET /me and /me/2fa/*. */
export interface TwoFactorState {
  /** an authenticator app (TOTP) is verified */
  totp: boolean;
  /** email codes are turned on */
  email2fa: boolean;
  /** assurance level of this session's token */
  aal: 'aal1' | 'aal2';
  /** this session passed the second factor, or none is required */
  mfaPassed: boolean;
}

/** GET /rooms/code/:code (no membership needed) — for the pre-join screen */
export interface RoomPreview { id: string; title: string; phase: Phase; seats: number; taken: number; hostName: string }

// ---------------------------------------------------------------------------
// Agent tool outputs (validated by the API before anything is stored)
// ---------------------------------------------------------------------------

/** Lead tutor: one segment. */
export const TeachSegment = z.object({
  title: z.string(),
  steps: z.array(BoardStep).min(1).max(40),
  check: Question.optional(),
});
export type TeachSegment = z.infer<typeof TeachSegment>;

/** Triage: one call groups new questions and routes clusters (see design doc §Triage). */
export const TriageResult = z.object({
  assign: z.array(z.object({
    questionId: z.string(),
    cluster: z.string().describe('existing cluster id, or "new"'),
    title: z.string().optional().describe('required when cluster is "new"'),
  })),
  route: z.array(z.object({
    cluster: z.string().describe('cluster id, or the title of a cluster created in assign'),
    to: ClusterRoute,
    reason: z.string().optional(),
    segment: z.number().int().optional().describe('later: which upcoming segment covers it'),
    answer: z.string().optional().describe('inline: 1–2 sentence answer'),
    user: z.string().optional().describe('thread: the asker to offer a thread to'),
  })),
  flag: z.array(z.object({ questionId: z.string(), reason: z.string() })).default([]),
});
export type TriageResult = z.infer<typeof TriageResult>;

/** Scribe: summary of one finished segment. */
export const SegmentSummary = z.object({ summary: z.string().describe('3 short lines') });

// ---------------------------------------------------------------------------
// Constants shared by both sides
// ---------------------------------------------------------------------------

/** GET /rooms/:id/host/checks/:checkId/answers (host, lane C): who answered a check. correct is
 *  null while the answer waits for a person to read it (free-text types). */
export interface HostCheckAnswer { userId: string; correct: boolean | null }

/** 202 answers of actions that run in the background (start, host actions, thread messages, email codes) */
export interface OkRes { ok: true }
/** POST /rooms/:id/host/reexplain and /host/pin: the class-routed cluster the next Q&A answers */
export interface HostClusterRes { ok: true; clusterId: string }
/** POST /rooms/:id/duel */
export interface DuelStartRes { duelId: string }
/** POST /rooms/:id/teachback */
export interface TeachbackStartRes { teachbackId: string }
/** GET /health (no auth): which tutor answers and which model each agent uses */
export interface HealthRes { ok: true; embeddings: string; model: string; modelId: string | null; agents: Record<string, string> | null }
/** GET /sandbox/config.json (local dev console only) */
export interface SandboxConfigRes { supabaseUrl: string; anonKey: string | null; model: string }

export const LIVE = {
  maxSeats: 5,
  /** gate passes this long after the first ready vote */
  gateTimeoutMs: 60_000,
  /** triage runs this long after the last new question */
  triageDebounceMs: 4_000,
  questionsPerMinute: 6,
  presenceLeaveMs: 15_000,
  laserHz: 20,
} as const;

export const MEMBER_COLORS = ['#f2d16b', '#8fc7e8', '#a8dc9f', '#f4a6c8', '#f6b26b', '#c3a6f4'] as const;

// ---------------------------------------------------------------------------
// Class library: what each learner keeps from every class they joined
// (read by members with RLS; reviews are written by the API)
// ---------------------------------------------------------------------------

export type CardRating = z.infer<typeof Api.reviewCard>['rating'];

/** Row of `cards`: one flashcard of a class deck (written by the scribe at the end of class). */
export interface CardRow {
  id: string;
  room_id: string | null;
  course_id: string | null;
  front: string;
  back: string;
  status: 'proposed' | 'active' | 'suspended';
  created_at: string;
}

/** Row of `card_reviews`: one learner's own schedule for one card. */
export interface CardReviewRow { card_id: string; user_id: string; fsrs: FsrsState; updated_at: string }

/** Scribe tool output at the end of class: the class deck. */
export const ProposedCards = z.object({
  cards: z.array(z.object({ front: z.string().trim().min(1).max(300), back: z.string().trim().min(1).max(600) })).min(3).max(12),
});
export type ProposedCards = z.infer<typeof ProposedCards>;

// ---------------------------------------------------------------------------
// Courses and the lobby (lane C)
// ---------------------------------------------------------------------------

/** Row of `courses`. The syllabus is Markdown in the Chalkroom syllabus format (parseSyllabus). */
export interface CourseRow {
  id: string;
  title: string;
  goal: string;
  syllabus_md: string;
  visibility: 'public' | 'private';
  owner_id: string | null;
  forked_from: string | null;
  created_at: string;
}

/** GET /courses (catalog) and GET /courses/:id */
export interface CourseCard extends CourseRow {
  owner_name: string | null;
  /** how many rooms ran this course */
  rooms_run: number;
  /** mean stars, null without ratings */
  rating: number | null;
  ratings: number;
  /** my own stars, if I rated it */
  my_rating: number | null;
}

/** Row of `faq`: answered class questions of a course, reused by later rooms. */
export interface FaqRow { id: string; course_id: string; topic_id: string | null; question: string; answer: string; askers_total: number; created_at: string }

/** GET /lobby: open public rooms (lobby or live) with free seats */
export interface LobbyRoom {
  id: string;
  title: string;
  course_id: string | null;
  course_title: string | null;
  phase: Phase;
  seats: number;
  taken: number;
  starts_at: string | null;
  host_name: string;
  invite_code: string;
}

// ---------------------------------------------------------------------------
// Library: replays and kudos (lane L)
// ---------------------------------------------------------------------------

/** GET /replays: finished public classes */
export interface ReplayCard { id: string; title: string; course_title: string | null; ended_at: string; minutes: number | null; chapters: number; host_name: string }

/** A jump point in a replay: a segment, or a class question answered on the board. */
export interface ReplayChapter { seq: number; kind: 'segment' | 'question'; title: string }

/** GET /rooms/:id/replay (members, or anyone for a public finished room) */
export interface ReplayRes { room: RoomRow; events: StreamEvent[]; chapters: ReplayChapter[] }

/** GET /me/kudos: how my questions and threads helped others, across all my classes */
export interface KudosRes { questionsHelped: number; peopleHelped: number; sharedThreads: number }
