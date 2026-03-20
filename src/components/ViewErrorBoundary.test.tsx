import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ViewErrorBoundary } from './ViewErrorBoundary';

function ThrowingComponent({ message }: { message: string }): never {
  throw new Error(message);
}

describe('ViewErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when no error', () => {
    render(
      <ViewErrorBoundary>
        <div>Content</div>
      </ViewErrorBoundary>,
    );
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('renders ViewError when child throws', () => {
    render(
      <ViewErrorBoundary>
        <ThrowingComponent message="view crash" />
      </ViewErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('provides a Try Again button that resets the error state', () => {
    let shouldThrow = true;

    function MaybeThrow() {
      if (shouldThrow) throw new Error('crash');
      return <div>Recovered</div>;
    }

    render(
      <ViewErrorBoundary>
        <MaybeThrow />
      </ViewErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    const tryAgainButton = screen.getByRole('button', { name: /try again/i });
    expect(tryAgainButton).toBeInTheDocument();

    // Stop throwing, then click "Try Again"
    shouldThrow = false;
    fireEvent.click(tryAgainButton);

    expect(screen.getByText('Recovered')).toBeInTheDocument();
  });
});
