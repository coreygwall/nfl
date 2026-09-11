import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

/** Last line of defence: a render crash shows a card with a reload button instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Render error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto mt-16 max-w-sm px-4">
        <div className="card p-6 text-center">
          <p className="font-display text-2xl font-extrabold">Well, that fumbled.</p>
          <p className="mt-2 text-sm text-ink-2">Something went wrong drawing this screen. Your picks are safe on the server.</p>
          <button className="btn btn-primary mt-5" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
