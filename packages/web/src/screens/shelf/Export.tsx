// Lane L: take this class away: the shared notes as one Markdown file, the deck as an Anki CSV.
// Both are made on this device from the class page's own data.
import { FileDown } from 'lucide-react';
import type { ClassLibrary } from '../../lib/library';
import { cardsCsv, download, fileStem, notesMarkdown } from '../library/files';
import { dayWords } from './words';
import '../library/library.css';

const ICON = { size: 15, strokeWidth: 2, 'aria-hidden': true } as const;

export function Export({ lib }: { lib: ClassLibrary }) {
  const { room, notes, cards } = lib;
  const deck = cards.filter((c) => c.status !== 'suspended');
  const stem = fileStem(room.title);
  return (
    <div className="shelf-export" role="group" aria-label="Export">
      <button type="button" className="btn ghost small" disabled={!notes.length}
        title={notes.length ? undefined : 'No notes in this class yet'}
        onClick={() => download(`${stem}-notes.md`, notesMarkdown(room.title, dayWords(room.started_at ?? room.created_at), notes), 'text/markdown;charset=utf-8')}>
        <FileDown {...ICON} />Notes as Markdown
      </button>
      <button type="button" className="btn ghost small" disabled={!deck.length}
        title={deck.length ? undefined : 'No flashcards in this class yet'}
        onClick={() => download(`${stem}-anki.csv`, cardsCsv(deck), 'text/csv;charset=utf-8')}>
        <FileDown {...ICON} />Cards for Anki (.csv)
      </button>
    </div>
  );
}
