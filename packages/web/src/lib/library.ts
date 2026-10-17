// The learner's library: every class they joined, and what each one left them (notes, cards,
// questions, materials, check results). Read straight from Supabase under RLS (members read
// their rooms); writes still go through the API (lib/api.ts).
import type {
  CardReviewRow, CardRow, ClusterRow, MemberRow, NoteBlockRow, QuestionRow, RoomRow, SourceRow, StreamEvent,
} from '@chalk/schema';
import { ensureSession, supabase } from './supabase';

/** One class on the shelf: the room and my membership in it. */
export interface MyClass { room: RoomRow; member: MemberRow }

/** Every class I joined or host, newest first. Removed (banned) memberships are hidden. */
export async function fetchMyClasses(): Promise<MyClass[]> {
  const session = await ensureSession();
  const r = await supabase
    .from('room_members')
    .select('*, room:rooms(*)')
    .eq('user_id', session.user.id)
    .order('joined_at', { ascending: false });
  if (r.error) throw new Error(`Could not load your classes: ${r.error.message}`);
  return (r.data ?? [])
    .filter((m) => m.room && !m.banned)
    .map(({ room, ...member }) => ({ room: room as RoomRow, member: member as MemberRow }));
}

export interface ClassLibrary {
  me: string;
  room: RoomRow;
  members: MemberRow[];
  notes: NoteBlockRow[];
  questions: QuestionRow[];
  clusters: Record<string, ClusterRow>;
  cards: CardRow[];
  /** my own schedule per card id */
  reviews: Record<string, CardReviewRow>;
  sources: SourceRow[];
  /** check, check_closed, segment_start and segment_summary events of the main stream */
  events: StreamEvent[];
}

/** Everything one class keeps for this learner. Throws "not found" when I am not a member. */
export async function fetchClassLibrary(roomId: string): Promise<ClassLibrary> {
  const session = await ensureSession();
  const me = session.user.id;
  const room = await supabase.from('rooms').select('*').eq('id', roomId).maybeSingle();
  if (room.error) throw new Error(`Could not load the class: ${room.error.message}`);
  if (!room.data) throw new Error('This class is not on your shelf. Join it with its invite code first.');
  const r = room.data as RoomRow;
  const scope = r.course_id ? `room_id.eq.${roomId},course_id.eq.${r.course_id}` : `room_id.eq.${roomId}`;
  const [members, notes, questions, clusters, cards, reviews, sources, events] = await Promise.all([
    supabase.from('room_members').select('*').eq('room_id', roomId).order('joined_at'),
    supabase.from('note_blocks').select('*').eq('room_id', roomId).order('idx'),
    supabase.from('questions').select('*').eq('room_id', roomId).order('created_at'),
    supabase.from('clusters').select('*').eq('room_id', roomId),
    supabase.from('cards').select('*').eq('room_id', roomId).order('created_at'),
    supabase.from('card_reviews').select('*').eq('user_id', me),
    supabase.from('sources').select('*').or(scope).order('created_at'),
    supabase.from('events').select('*').eq('stream_id', r.main_stream_id)
      .in('kind', ['segment_start', 'segment_summary', 'check', 'check_closed']).order('seq'),
  ]);
  for (const x of [members, notes, questions, clusters, cards, reviews, sources, events]) {
    if (x.error) throw new Error(`Could not load the class: ${x.error.message}`);
  }
  return {
    me,
    room: r,
    members: (members.data ?? []) as MemberRow[],
    notes: (notes.data ?? []) as NoteBlockRow[],
    questions: (questions.data ?? []) as QuestionRow[],
    clusters: Object.fromEntries(((clusters.data ?? []) as ClusterRow[]).map((c) => [c.id, c])),
    cards: (cards.data ?? []) as CardRow[],
    reviews: Object.fromEntries(((reviews.data ?? []) as CardReviewRow[]).map((v) => [v.card_id, v])),
    sources: (sources.data ?? []) as SourceRow[],
    events: (events.data ?? []) as StreamEvent[],
  };
}

/** Cards due now for me: never reviewed, or due date passed. Suspended cards are skipped. */
export function dueCards(lib: Pick<ClassLibrary, 'cards' | 'reviews'>, at = new Date()): CardRow[] {
  return lib.cards.filter((c) => c.status === 'active' && (!lib.reviews[c.id] || new Date(lib.reviews[c.id].fsrs.due) <= at));
}
