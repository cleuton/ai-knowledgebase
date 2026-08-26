import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Catches render-time errors anywhere below it in the tree so a single
 * broken panel doesn't blank the whole app; API-call failures are handled
 * separately by each component's own mutation/query error state (e.g.
 * UploadWidget, DocumentList, ChatPanel), since those aren't render errors
 * React's error boundaries can catch. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="panel" role="alert">
          <h2>Something went wrong</h2>
          <p>{this.state.error.message}</p>
          <button type="button" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
