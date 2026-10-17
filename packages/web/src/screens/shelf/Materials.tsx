// W2: the class's materials: its sources (and its course's), with adding and deleting through
// the shared MaterialsPanel, and the scribe's summary of each segment.
// AM: room, members and me are optional so ClassShelf's current call still works; when absent
// they are read here (room id from the /c/:roomId path).
import { useEffect, useState } from 'react';
import type { MemberRow, RoomRow, SourceRow, StreamEvent } from '@chalk/schema';
import { supabase } from '../../lib/supabase';
import { usePath } from '../../lib/router';
import { MaterialsPanel } from '../../features/materials/MaterialsPanel';
import { sectionHue, sectionInk } from '../../ui/section';

interface Facts { room: Pick<RoomRow, 'id' | 'host_id' | 'course_id'>; members: MemberRow[]; me: string | null }

export function Materials({ sources, events, roomId, room, members, me }: {
  sources: SourceRow[]; events: StreamEvent[];
  roomId?: string; room?: Pick<RoomRow, 'id' | 'host_id' | 'course_id'>; members?: MemberRow[]; me?: string;
}) {
  const path = usePath();
  const id = roomId ?? room?.id ?? /^\/c\/([^/?#]+)/.exec(path)?.[1] ?? sources[0]?.room_id ?? null;
  const given = room && members && me !== undefined ? { room, members, me } : null;
  const facts = useFacts(given ? null : id) ?? given;

  const summaries = events.filter((e) => e.kind === 'segment_summary').map((e) => (e as StreamEvent<'segment_summary'>).data);
  // the scribe may revise a summary; keep the latest per segment
  const bySeg = [...new Map(summaries.map((s) => [s.segment, s])).values()].sort((a, b) => a.segment - b.segment);

  return (
    <>
      <div className="shelf-sec-head"><h2>Materials</h2></div>

      {id ? (
        <MaterialsPanel roomId={id} room={facts?.room ?? null} me={facts?.me ?? null} members={facts?.members ?? []} initial={sources} />
      ) : (
        <p className="shelf-empty">This class's materials could not be found.</p>
      )}

      <section aria-labelledby="mat-summaries" className="shelf-group">
        <div className="shelf-sub-head"><h3 id="mat-summaries">Segment summaries</h3>{bySeg.length > 0 && <span className="faint mono">{bySeg.length}</span>}</div>
        {bySeg.length === 0 ? <p className="shelf-empty shelf-empty-sm">The scribe sums up each segment when it ends. None yet.</p> : (
          <ol className="shelf-summaries">
            {bySeg.map((s) => (
              <li key={s.segment} className="shelf-summary">
                <span className="shelf-seg-tab mono" style={{ background: sectionHue(s.segment), color: sectionInk(s.segment) }} aria-label={`Segment ${s.segment + 1}`}>{s.segment + 1}</span>
                <div className="grow">
                  <p className="shelf-summary-title">{s.title}</p>
                  <p className="shelf-summary-text">{s.summary}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

/** Room, members and me for the panel's permissions; null until read (the panel still lists). */
function useFacts(roomId: string | null): Facts | null {
  const [facts, setFacts] = useState<Facts | null>(null);
  useEffect(() => {
    if (!roomId) return;
    let live = true;
    Promise.all([
      supabase.auth.getSession(),
      supabase.from('rooms').select('id, host_id, course_id').eq('id', roomId).maybeSingle(),
      supabase.from('room_members').select('*').eq('room_id', roomId),
    ]).then(([s, r, m]) => {
      if (!live || !r.data) return;
      setFacts({ room: r.data as Facts['room'], members: (m.data ?? []) as MemberRow[], me: s.data.session?.user.id ?? null });
    }).catch(() => { /* the panel works without them: no delete, no course choice */ });
    return () => { live = false; };
  }, [roomId]);
  return facts;
}
