// A5 (Dev A): shared notes from note_blocks, ordered by idx, on a ruled page in the notes hand
// (pencil). Every block starts on a rule and ends on one: blocks of any height (maths, tables)
// are padded to whole rules. The last editor's initials and colour dot sit in the margin.
// One editor per block: presence `editing` locks a block for everyone else; saves carry the block
// version, and a version conflict keeps the draft and offers a way back.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Lock, Pencil } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import type { NoteBlockRow } from '@chalk/schema';
import { useRoom } from '../../room/store';
import { useRoomConn } from '../../room/context';
import { api } from '../../lib/api';
import { Markdown } from '../../components/Markdown';
import './notes.css';

const ICON = { size: 16, strokeWidth: 2, 'aria-hidden': true } as const;

export function NotesPanel() {
  const notes = useRoom((s) => s.notes);
  const presence = useRoom((s) => s.presence);
  const me = useRoom((s) => s.me);
  const members = useRoom(useShallow((s) => s.members));
  const phase = useRoom((s) => s.room?.phase);
  const conn = useRoomConn();
  const [editing, setEditing] = useState<string | null>(null);

  const blocks = useMemo(() => Object.values(notes).sort((a, b) => a.idx - b.idx), [notes]);
  // who else holds each block
  const holders = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of Object.values(presence)) if (p.userId !== me && p.editing) m[p.editing] = p.name;
    return m;
  }, [presence, me]);

  const begin = (id: string) => { setEditing(id); conn?.track({ editing: id }); };
  const end = () => { setEditing(null); conn?.track({ editing: null }); };
  // release the lock if the panel goes away mid-edit (tab switch, leaving)
  useEffect(() => () => { if (editing) conn?.track({ editing: null }); }, [editing, conn]);

  if (!blocks.length) {
    return (
      <div className="notes-empty">
        <p>No notes yet.</p>
        <p className="faint">{phase === 'ended' ? 'The scribe did not write notes for this class.' : 'The scribe writes shared notes here after each part of the lesson. Anyone in the class can edit them.'}</p>
      </div>
    );
  }

  return (
    <div className="notes">
      <p className="notes-lead">Written by the scribe, edited by the class.</p>
      <ol className="notes-page ruled hand-notes">
        {blocks.map((b) => {
          const editor = b.edited_by ? members[b.edited_by] : undefined;
          const editorName = b.edited_by ? (b.edited_by === me ? 'you' : editor?.display_name) : undefined;
          return (
            <li key={b.id} className="notes-entry">
              <Margin name={b.edited_by ? editor?.display_name ?? 'A classmate' : null} color={editor?.color} mine={b.edited_by === me} />
              {editing === b.id
                ? <BlockEditor block={b} onDone={end} />
                : <Block block={b} holder={holders[b.id]} editorName={editorName} canEdit={!editing} onEdit={() => begin(b.id)} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0] ?? '?').slice(0, 3).toUpperCase();
};

/** Who wrote this block last, in the margin: the scribe, or an editor's initials and colour. */
function Margin({ name, color, mine }: { name: string | null; color?: string; mine: boolean }) {
  const label = name ? (mine ? 'Edited by you' : `Edited by ${name}`) : 'Written by the scribe';
  return (
    <span className="note-who" style={color ? { '--c': color } as CSSProperties : undefined} title={label}>
      <i aria-hidden />
      <span className="note-who-long" aria-hidden>{name ? (mine ? 'You' : initials(name)) : 'Scribe'}</span>
      {name && <span className="note-who-short" aria-hidden>{mine ? 'You' : initials(name)}</span>}
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Pads an element so its height is a whole number of rules (maths and tables come in any height). */
function useWholeRules<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const lh = parseFloat(getComputedStyle(el).lineHeight);
      if (!lh) return;
      el.style.paddingBottom = '0px';
      const h = el.getBoundingClientRect().height;
      const extra = Math.ceil(h / lh - 0.02) * lh - h;
      el.style.paddingBottom = `${Math.max(0, extra)}px`;
    };
    fit();
    const ro = new ResizeObserver(() => requestAnimationFrame(fit));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return ref;
}

function Block({ block, holder, editorName, canEdit, onEdit }: { block: NoteBlockRow; holder?: string; editorName?: string; canEdit: boolean; onEdit: () => void }) {
  const md = useWholeRules<HTMLDivElement>();
  return (
    <article className={`note-block ${holder ? 'is-locked' : ''}`}>
      <div ref={md} className="note-body"><Markdown className="note-md" text={block.markdown} /></div>
      {/* the tools sit in the margin, under who wrote it: an edit pencil, or a lock while someone else edits */}
      <div className="note-tools">
        {holder ? (
          <span className="note-lock" role="img" aria-label={`${holder} is editing this note`} title={`${holder} is editing`}>
            <Lock size={14} strokeWidth={2.25} aria-hidden />
          </span>
        ) : (
          <button type="button" className="btn ghost small icon-btn note-edit" onClick={onEdit} disabled={!canEdit}
            aria-label={`Edit this note${editorName ? `, last edited by ${editorName}` : ', written by the scribe'}`}
            title={canEdit ? 'Edit this note' : 'Save or cancel your other edit first'}>
            <Pencil size={15} strokeWidth={2} aria-hidden />
          </button>
        )}
      </div>
    </article>
  );
}

function BlockEditor({ block, onDone }: { block: NoteBlockRow; onDone: () => void }) {
  const roomId = useRoom((s) => s.room!.id);
  const latest = useRoom((s) => s.notes[block.id]);
  const [base, setBase] = useState(block);
  const [draft, setDraft] = useState(block.markdown);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ conflict: boolean; text: string } | null>(null);

  const save = (version: number) => {
    setSaving(true);
    api.editNote(roomId, block.id, { markdown: draft, version })
      .then(() => onDone())
      .catch((e) => {
        const now = useRoom.getState().notes[block.id];
        const conflict = (!!now && now.version !== base.version) || /version|conflict|changed|409/i.test((e as Error).message);
        setError(conflict
          ? { conflict, text: 'Someone saved this block while you were editing. Your text is still here.' }
          : { conflict, text: `${(e as Error).message || 'The note did not save.'} Press Save to try again.` });
      })
      .finally(() => setSaving(false));
  };
  const fit = useWholeRules<HTMLFormElement>();
  const loadLatest = () => { if (latest) { setBase(latest); setDraft(latest.markdown); } setError(null); };
  const keepMine = () => { if (latest) { setBase(latest); save(latest.version); } };

  return (
    <form ref={fit} className="note-block is-editing" onSubmit={(e) => { e.preventDefault(); save(base.version); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onDone(); }}>
      <label className="sr-only" htmlFor={`note-${block.id}`}>Edit note (Markdown)</label>
      <textarea id={`note-${block.id}`} className="textarea note-textarea" value={draft} autoFocus maxLength={5000}
        onChange={(e) => setDraft(e.target.value)} rows={Math.min(14, Math.max(5, draft.split('\n').length + 1))} />
      {error && (
        <div className="errata" role="alert">
          <div className="col" style={{ gap: 8 }}>
            <p>{error.text}</p>
            {error.conflict && (
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <button type="button" className="btn small" onClick={keepMine} disabled={saving}>Save mine over it</button>
                <button type="button" className="btn small ghost" onClick={loadLatest} disabled={saving}>Load their version</button>
              </div>
            )}
          </div>
        </div>
      )}
      <footer className="note-foot">
        <span className="faint">Markdown. Others see this block locked.</span>
        <span className="spacer" />
        <button type="button" className="btn ghost small" onClick={onDone} disabled={saving}>Cancel</button>
        <button type="submit" className="btn primary small" disabled={saving || draft === base.markdown || (error?.conflict ?? false)}>{saving ? 'Saving' : 'Save'}</button>
      </footer>
    </form>
  );
}
