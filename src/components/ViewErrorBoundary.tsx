/**
 * View-level error boundary — lighter boundary for individual route views.
 * Renders ViewError + "Try Again" button on catch.
 *
 * @see docs/adr/0015-error-handling.md
 */

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

import { reportError } from '@/errors/report';
import { uiError } from '@/errors/factories';

import { ViewError } from './ViewError';

interface ViewErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ViewErrorBoundaryState {
  readonly hasError: boolean;
  readonly errorMessage: string;
}

class ViewErrorBoundary extends Component<
  ViewErrorBoundaryProps,
  ViewErrorBoundaryState
> {
  constructor(props: ViewErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ViewErrorBoundaryState {
    const message =
      import.meta.env.DEV && error instanceof Error
        ? error.message
        : 'This section encountered an error.';
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

  private handleReset = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <ViewError
          message={this.state.errorMessage}
          onRetry={this.handleReset}
        />
      );
    }

    return this.props.children;
  }
}

export { ViewErrorBoundary };
