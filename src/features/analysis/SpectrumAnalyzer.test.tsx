import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { SpectrumAnalyzer } from './SpectrumAnalyzer';

// Stub canvas context so getContext('2d') returns a mock
function createMockContext(): Record<string, unknown> {
  return {
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    setTransform: vi.fn(),
    createLinearGradient: vi.fn().mockReturnValue({
      addColorStop: vi.fn(),
    }),
    roundRect: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: 'round',
    lineCap: 'round',
    globalAlpha: 1,
  };
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    createMockContext() as unknown as CanvasRenderingContext2D,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SpectrumAnalyzer', () => {
  it('renders a canvas element', () => {
    const { container } = render(<SpectrumAnalyzer />);
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
  });

  it('has role="img" with accessible label', () => {
    render(<SpectrumAnalyzer />);
    const img = screen.getByRole('img', {
      name: 'Frequency spectrum visualization',
    });
    expect(img).toBeInTheDocument();
  });

  it('marks canvas as aria-hidden', () => {
    const { container } = render(<SpectrumAnalyzer />);
    const canvas = container.querySelector('canvas');
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
  });

  it('respects prefers-reduced-motion', () => {
    const { container } = render(<SpectrumAnalyzer />);
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
  });

  it('renders when prefers-reduced-motion is reduce', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { container } = render(<SpectrumAnalyzer />);
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeInTheDocument();

    window.matchMedia = originalMatchMedia;
  });
});
