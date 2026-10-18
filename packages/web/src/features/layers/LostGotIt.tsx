// Lane C: a permanent Lost / Got it pair in the control bar. It marks the figure the tutor is on
// (the newest shape on the tutor's page), or the shapes this person selected. The marks are the
// same "confused" / "got it" reactions the board heat shows; pressing again takes the mark off.
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Check, CircleHelp } from 'lucide-react';
import type { ReactionKind } from '@chalk/schema';
import type { BoardPage } from '@chalk/board';
import { mainPlayer, useRoom } from '../../room/store';
import { usePlayer } from '../../board/Board';
import { api } from '../../lib/api';
import './layers.css';

const ICON = { size: 16, strokeWidth: 2.25, 'aria-hidden': true } as const;
const SKIP = new Set(['arrow', 'group', 'frame', 'path']);

/** The figure in play: the newest drawn shape on the tutor's current page that can be pointed at. */
export function currentFigure(page: BoardPage | undefined): string | null {
  if (!page) return null;
  const ids = Object.keys(page.shapes);
  for (let i = ids.length - 1; i >= 0; i--) if (!SKIP.has(page.shapes[ids[i]].kind)) return ids[i];
  return null;
}

export function LostGotIt() {
  usePlayer(mainPlayer);
  const phase = useRoom((s) => s.room?.phase);
  const roomId = useRoom((s) => s.room?.id);
  const selection = useRoom(useShallow((s) => s.selection));
  const mine = useRoom(useShallow((s) => s.reactions.filter((r) => r.user_id === s.me)));
  const [busy, setBusy] = useState<ReactionKind | null>(null);
  const [error, setError] = useState('');
  // shown (disabled) from the lobby on, so its row is already there when the class starts
  if (!roomId || !phase || phase === 'ended') return null;

  const st = mainPlayer.state;
  const page = st.pages[st.current];
  const picked = page ? selection.filter((id) => page.shapes[id] && page.shapes[id].kind !== 'arrow') : [];
  const fig = currentFigure(page);
  const targets = picked.length ? picked : fig ? [fig] : [];
  const has = (id: string, kind: ReactionKind) => mine.some((r) => r.shape_id === id && r.kind === kind);
  const all = (kind: ReactionKind) => targets.length > 0 && targets.every((id) => has(id, kind));
  const what = picked.length > 1 ? `the ${picked.length} selected parts` : picked.length ? 'the selected part' : 'the figure the tutor is on';

  const react = async (kind: ReactionKind) => {
    const on = all(kind);
    const send = on ? targets : targets.filter((id) => !has(id, kind));
    setBusy(kind); setError('');
    try {
      await Promise.all(send.map((shapeId) => api.react(roomId, { shapeId, kind })));
    } catch {
      setError('Not sent. Press it again.');
    } finally {
      setBusy(null);
    }
  };

  const none = targets.length === 0;
  return (
    <div className="lost-got" role="group" aria-label={`How is ${what} going for you?`}>
      <button type="button" className="btn small lost-btn" aria-pressed={all('confused')} disabled={none || !!busy}
        title={none ? 'Available once the tutor draws something' : `Tell the class tutor you are lost on ${what}`} onClick={() => void react('confused')}>
        <CircleHelp {...ICON} /><span>Lost</span>
      </button>
      <button type="button" className="btn small got-btn" aria-pressed={all('got_it')} disabled={none || !!busy}
        title={none ? 'Available once the tutor draws something' : `Mark ${what} as understood`} onClick={() => void react('got_it')}>
        <Check {...ICON} /><span>Got it</span>
      </button>
      {error && <span className="lost-got-error" role="alert">{error}</span>}
    </div>
  );
}
