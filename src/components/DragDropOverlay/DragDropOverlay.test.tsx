import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, act } from '@testing-library/react';

import { DragDropOverlay } from './DragDropOverlay';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockLoadFile = vi.fn(() => Promise.resolve());

vi.mock('@/store/store', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ loadFile: mockLoadFile }),
}));

vi.mock('@/components/Toast/toast-store', () => ({
  showToast: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createDragEvent(
  type: string,
  options: { types?: string[]; files?: File[] } = {},
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      types: options.types ?? ['Files'],
      files: options.files ?? [],
    },
  });
  return event;
}

function spcFile(name = 'track.spc'): File {
  return new File(['fake-spc-data'], name, {
    type: 'application/octet-stream',
  });
}

function getOverlay(): HTMLElement {
  const overlay = screen
    .getByText('Drop SPC files to play')
    .closest('[data-state]');
  if (!overlay || !(overlay instanceof HTMLElement)) {
    throw new Error('Overlay element not found');
  }
  return overlay;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DragDropOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockLoadFile.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders nothing visible in IDLE state', () => {
    render(<DragDropOverlay />);
    const overlay = getOverlay();
    expect(overlay).toHaveAttribute('data-state', 'hidden');
  });

  it('shows overlay on window dragenter with File data transfer', () => {
    render(<DragDropOverlay />);
    act(() => {
      window.dispatchEvent(createDragEvent('dragenter', { types: ['Files'] }));
    });
    const overlay = getOverlay();
    expect(overlay).toHaveAttribute('data-state', 'visible');
  });

  it('hides overlay after dragleave with 50ms debounce', () => {
    render(<DragDropOverlay />);

    act(() => {
      window.dispatchEvent(createDragEvent('dragenter', { types: ['Files'] }));
    });

    const overlay = getOverlay();
    expect(overlay).toHaveAttribute('data-state', 'visible');

    act(() => {
      window.dispatchEvent(createDragEvent('dragleave', { types: ['Files'] }));
    });

    // Still visible before debounce expires
    expect(overlay).toHaveAttribute('data-state', 'visible');

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(overlay).toHaveAttribute('data-state', 'hidden');
  });

  it('does NOT show overlay for non-file drags', () => {
    render(<DragDropOverlay />);
    act(() => {
      window.dispatchEvent(
        createDragEvent('dragenter', { types: ['text/plain'] }),
      );
    });
    const overlay = getOverlay();
    expect(overlay).toHaveAttribute('data-state', 'hidden');
  });

  it('calls loadFile on drop for .spc files', async () => {
    render(<DragDropOverlay />);

    const file = spcFile('music.spc');
    const nonSpc = new File(['data'], 'readme.txt', { type: 'text/plain' });

    act(() => {
      window.dispatchEvent(createDragEvent('dragenter', { types: ['Files'] }));
    });

    await act(async () => {
      window.dispatchEvent(
        createDragEvent('drop', {
          types: ['Files'],
          files: [file, nonSpc],
        }),
      );
      // Flush the microtask queue for the promise chain
      await Promise.resolve();
    });

    expect(mockLoadFile).toHaveBeenCalledTimes(1);
    expect(mockLoadFile).toHaveBeenCalledWith(file);
  });

  it('overlay has aria-hidden="true"', () => {
    render(<DragDropOverlay />);
    const overlay = getOverlay();
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
  });

  it('sets aria-live announcement on dragenter', () => {
    render(<DragDropOverlay />);
    act(() => {
      window.dispatchEvent(createDragEvent('dragenter', { types: ['Files'] }));
    });
    const liveRegion = screen.getByRole('alert');
    expect(liveRegion).toHaveTextContent(
      'Drag detected. Drop SPC files to add to playlist.',
    );
  });

  it('cancels dragleave debounce if dragenter fires again', () => {
    render(<DragDropOverlay />);

    // Enter
    act(() => {
      window.dispatchEvent(createDragEvent('dragenter', { types: ['Files'] }));
      window.dispatchEvent(createDragEvent('dragenter', { types: ['Files'] }));
    });

    // Leave one child
    act(() => {
      window.dispatchEvent(createDragEvent('dragleave', { types: ['Files'] }));
    });

    // Still one enter outstanding — overlay stays
    const overlay = getOverlay();
    expect(overlay).toHaveAttribute('data-state', 'visible');

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Still visible — enter count was 1 after decrement
    expect(overlay).toHaveAttribute('data-state', 'visible');
  });

  it('handles case-insensitive .SPC extension', async () => {
    render(<DragDropOverlay />);

    const file = spcFile('TRACK.SPC');

    act(() => {
      window.dispatchEvent(createDragEvent('dragenter', { types: ['Files'] }));
    });

    await act(async () => {
      window.dispatchEvent(
        createDragEvent('drop', {
          types: ['Files'],
          files: [file],
        }),
      );
      await Promise.resolve();
    });

    expect(mockLoadFile).toHaveBeenCalledTimes(1);
  });

  it('shows toast after successful file load', async () => {
    const { showToast } = await import('@/components/Toast/toast-store');

    render(<DragDropOverlay />);

    const file = spcFile('track.spc');

    act(() => {
      window.dispatchEvent(createDragEvent('dragenter', { types: ['Files'] }));
    });

    await act(async () => {
      window.dispatchEvent(
        createDragEvent('drop', { types: ['Files'], files: [file] }),
      );
      await Promise.resolve();
    });

    expect(showToast).toHaveBeenCalledWith(
      'success',
      'Added 1 track to playlist',
    );
  });
});
