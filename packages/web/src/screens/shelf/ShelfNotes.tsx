// W2: the class's shared notes, read in the serif and edited one block at a time. Saves carry
// the block's version; a conflict keeps my draft and offers their version or mine over it.
import { useState } from 'react';
import { Pencil, TriangleAlert } from 'lucide-react';
import type { MemberRow, NoteBlockRow } from '@chalk/schema';
import { Markdown } from '../../components/Markdown';
import { api, ApiError } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { count } from './words';

const ICON = { size: 16, strokeWidth: 2 } as const;

export function ShelfNotes({ roomId, notes, members, me, onSaved }: {
  roomId: string; notes: NoteBlockRow[]; members: MemberRow[]; me: string; onSaved: (row: NoteBlockRow) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const sorted = [...notes].sort((a, b) => a.idx - b.idx);
  const nameOf = (id: string | null) => (id === me ? 'you' : members.find((m) => m.user_id === id)?.display_name);

  return (
    <>
      <div className="shelf-sec-head">
        <h2>Notes</h2>
        {sorted.length > 0 && <p className="shelf-sec-sub">{count(sorted.length, 'block')}, shared by the whole class</p>}
      </div>
      {sorted.length === 0 ? (
        <p className="shelf-empty">The scribe writes notes as the class goes. They appear here after the first segment.</p>
      ) : (
        <ol className="shelf-notes">
          {sorted.map((b) => (
            <li key={b.id}>
              {editing === b.id
                ? <Editor roomId={roomId} block={b} onDone={(row) => { if (row) onSaved(row); setEditing(null); }} />
                : (
                  <article className="shelf-note">
                    <Markdown className="shelf-note-md" text={b.markdown} />
                    <footer className="shelf-note-foot">
                      <span className="faint">{b.edited_by ? `Edited by ${nameOf(b.edited_by) ?? 'someone in the class'}` : 'From the scribe'}</span>
                      <span className="spacer" />
                      <button type="button" className="btn ghost small" onClick={() => setEditing(b.id)}
                        disabled={editing !== null} title={editing !== null ? 'Save or cancel your other edit first' : undefined}>
                        <Pencil {...ICON} aria-hidden />Edit
                      </button>
                    </footer>
                  </article>
                )}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function Editor({ roomId, block, onDone }: { roomId: string; block: NoteBlockRow; onDone: (row?: NoteBlockRow) => void }) {
  const [base, setBase] = useState(block);
  const [draft, setDraft] = useState(block.markdown);
  const [theirs, setTheirs] = useState<NoteBlockRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ conflict: boolean; text: string } | null>(null);

  const save = (version: number) => {
    setSaving(true); setError(null);
    api.editNote(roomId, block.id, { markdown: draft, version })
      .then((row) => onDone(row))
      .catch(async (e: unknown) => {
        const status = e instanceof ApiError ? e.status : 0;
        const conflict = status === 409 || status === 400 || /version|conflict|changed/i.test((e as Error).message ?? '');
        if (conflict) {
          const r = await supabase.from('note_blocks').select('*').eq('id', block.id).maybeSingle();
          setTheirs((r.data as NoteBlockRow | null) ?? null);
          setError({ conflict, text: 'Someone saved this block while you were editing. Your text is still here.' });
        } else {
          setError({ conflict, text: `${(e as Error).message || 'The note did not save.'} Press Save to try again.` });
        }
      })
      .finally(() => setSaving(false));
  };
  const loadTheirs = () => { if (theirs) { setBase(theirs); setDraft(theirs.markdown); } setTheirs(null); setError(null); };
  const keepMine = () => { if (theirs) { setBase(theirs); save(theirs.version); } };
  const id = `shelf-note-${block.id}`;

  return (
    <form className="shelf-note is-editing" onSubmit={(e) => { e.preventDefault(); save(base.version); }}
      onKeyDown={(e) => { if (e.key === 'Escape' && !saving) onDone(); }}>
      <label className="shelf-label" htmlFor={id}>Edit this block (Markdown)</label>
      <textarea id={id} className="textarea shelf-note-textarea" value={draft} autoFocus maxLength={5000}
        rows={Math.min(16, Math.max(5, draft.split('\n').length + 1))} onChange={(e) => setDraft(e.target.value)} />
      {error && (
        <div className="errata" role="alert">
          <TriangleAlert {...ICON} aria-hidden />
          <div className="col" style={{ gap: 8 }}>
            <p>{error.text}</p>
            {error.conflict && (
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <button type="button" className="btn small" onClick={loadTheirs} disabled={saving}>Load their version</button>
                <button type="button" className="btn small" onClick={keepMine} disabled={saving || !theirs}>Save mine over it</button>
              </div>
            )}
          </div>
        </div>
      )}
      <footer className="shelf-note-foot">
        <span className="faint">Everyone in the class sees your edit.</span>
        <span className="spacer" />
        <button type="button" className="btn ghost small" onClick={() => onDone()} disabled={saving}>Cancel</button>
        <button type="submit" className="btn primary small" disabled={saving || draft === base.markdown || !!error?.conflict}>
          {saving ? 'Saving' : 'Save'}
        </button>
      </footer>
    </form>
  );
}
