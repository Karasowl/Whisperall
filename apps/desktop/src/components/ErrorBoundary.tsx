import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '../stores/notifications';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  private lastReportedMessage = '';

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Avoid cascading duplicate reports when React re-runs render attempts
    // (e.g. a "Maximum update depth" storm would otherwise spam logs and
    // potentially keep re-triggering downstream subscribers).
    if (error.message === this.lastReportedMessage) return;
    this.lastReportedMessage = error.message;
    reportError('renderer.boundary', error, {
      message: `${error.message}\n\nComponent stack:${info.componentStack ?? ''}`,
    });
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    const msg = this.state.error.message || 'Unknown error';
    const stack = this.state.error.stack ?? '';
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-base p-8 text-center">
        <span className="material-symbols-outlined text-[48px] text-red-400">error</span>
        <h1 className="text-xl font-semibold text-text">The app hit an unexpected error</h1>
        <p className="max-w-lg text-sm text-muted">{msg}</p>
        <details className="max-w-2xl w-full">
          <summary className="cursor-pointer text-xs text-muted hover:text-primary">Show stack trace</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-edge bg-surface p-3 text-left text-[11px] font-mono text-muted select-text">{stack}</pre>
        </details>
        <div className="flex gap-2">
          <button onClick={() => { import('../lib/clipboard-utils').then(m => m.copyText(`${msg}\n\n${stack}`, 'Error details')); }} className="rounded-lg border border-edge bg-surface px-4 py-2 text-sm text-text hover:border-primary/40">Copy details</button>
          <button onClick={this.reset} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90">Try again</button>
        </div>
      </div>
    );
  }
}
