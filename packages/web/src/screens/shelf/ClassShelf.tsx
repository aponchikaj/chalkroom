// /c/:roomId : one class on my shelf (W2 builds it out): notes, flashcards, questions,
// materials and check results for this class only. Data: lib/library.ts fetchClassLibrary.
export function ClassShelf({ roomId }: { roomId: string }) {
  return <div className="empty">Class {roomId}</div>;
}
