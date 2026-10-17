// A5 (Dev A): the recap when phase === 'ended': shared notes, my questions and their answers,
// proposed cards. Placeholder over the board.
export function Recap() {
  return (
    <div className="board-overlay">
      <div className="leaf col" style={{ maxWidth: 520 }}>
        <h2>Class ended</h2>
        <p className="muted">Shared notes and your questions appear here.</p>
      </div>
    </div>
  );
}
