/**
 * Root error boundary — catches unhandled errors at the top level.
 * Renders a full-page error UI with a reload button.
 *
 * React 19 still requires class components for error boundaries.
 *
 * @see docs/adr/0015-error-handling.md
 */

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

import { reportError } from '@/errors/report';
import { uiError } from '@/errors/factories';

import styles from './ErrorBoundary.module.css';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
  readonly errorMessage: string;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message =
      import.meta.env.DEV && error instanceof Error
        ? error.message
        : 'An unexpected error occurred. Please reload the page.';
    return { hasError: true, errorMessage: message };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    const detail = error instanceof Error ? error.message : String(error);
    const stack =
      import.meta.env.DEV && error instanceof Error ? error.stack : undefined;

    reportError(
      uiError('UI_RENDER_ERROR', {
        componentName: info.componentStack?.split('\n')[1]?.trim(),
        detail,
        stack,
      }),
      { silent: true },
    );
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className={styles.container} role="alert">
          <div className={styles.content}>
            <h1 className={styles.heading}>SPC Player</h1>
            <div className={styles.icon} aria-hidden="true">
              ⚠
            </div>
            <h2 className={styles.subheading}>Something went wrong</h2>
            <p className={styles.message}>{this.state.errorMessage}</p>
            <button
              type="button"
              className={styles.reloadButton}
              onClick={this.handleReload}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export { ErrorBoundary };
