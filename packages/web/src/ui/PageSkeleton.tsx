// A quiet paper sheet while a lazy route loads (the same shape index.html paints first).
export function PageSkeleton({ label = 'Opening Chalkroom Live' }: { label?: string }) {
  return (
    <div className="page-skeleton" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="page-skeleton-head" aria-hidden="true" />
      <div className="page-skeleton-sheet" aria-hidden="true" />
    </div>
  );
}
