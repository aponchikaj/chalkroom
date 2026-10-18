// A printed slip in place of a part that failed to render (a KaTeX or mermaid shape, the whole
// classroom). The rest of the page keeps working; "Try again" re-mounts the part.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RotateCw } from 'lucide-react';
import './ui.css';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** what failed, in plain words: "This figure", "The classroom" */
  what?: string;
  /** a small inline slip (a board shape) instead of the full one */
  compact?: boolean;
  /** when any of these change, the boundary clears itself (e.g. the shape id or room id) */
  resetKeys?: readonly unknown[];
  /** called on Try again, before the children re-mount */
  onReset?: () => void;
  /** replace the slip entirely */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State { error: Error | null }

export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${this.props.what ?? 'A part of the page'} failed to render`, error, info.componentStack);
  }

  componentDidUpdate(prev: ErrorBoundaryProps) {
    if (!this.state.error) return;
    const a = prev.resetKeys ?? [];
    const b = this.props.resetKeys ?? [];
    if (a.length !== b.length || a.some((x, i) => !Object.is(x, b[i]))) this.setState({ error: null });
  }

  reset = () => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return <ErrorSlip what={this.props.what} compact={this.props.compact} onRetry={this.reset} />;
  }
}

/** The slip itself, for places that catch errors without a boundary. */
export function ErrorSlip({ what = 'This part of the page', compact = false, onRetry }: { what?: string; compact?: boolean; onRetry?: () => void }) {
  return (
    <div className={compact ? 'error-slip compact' : 'error-slip'} role="alert">
      <p className="error-slip-title">{what} could not be shown.</p>
      {!compact && <p className="error-slip-body">The rest of the page still works. Try again, or reload if it keeps happening.</p>}
      {onRetry && (
        <button type="button" className="btn small" onClick={onRetry}>
          <RotateCw size={14} strokeWidth={2} aria-hidden="true" /> Try again
        </button>
      )}
    </div>
  );
}
