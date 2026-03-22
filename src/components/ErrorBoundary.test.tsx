import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from './ErrorBoundary';

function ThrowingComponent({ message }: { message: string }): never {
  throw new Error(message);
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Hello</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('renders error UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent message="test crash" />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('SPC Player')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
  });

  it('shows technical message in dev mode', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent message="dev error detail" />
      </ErrorBoundary>,
    );

    // In dev/test mode (import.meta.env.DEV is true), the error message
    // should include the technical detail
    expect(screen.getByText('dev error detail')).toBeInTheDocument();
  });

  it('has a reload button', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent message="crash" />
      </ErrorBoundary>,
    );

    const button = screen.getByRole('button', { name: /reload/i });
    expect(button).toBeInTheDocument();
  });
});
