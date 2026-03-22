import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { CoverArt, colorIndexFromTitle, hashTitle } from './CoverArt';

describe('CoverArt', () => {
  it('renders without crashing', () => {
    const { container } = render(<CoverArt gameTitle="Chrono Trigger" />);
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('sets correct aria-label with game title', () => {
    render(<CoverArt gameTitle="Secret of Mana" />);
    expect(
      screen.getByRole('img', { name: 'Cover art for Secret of Mana' }),
    ).toBeInTheDocument();
  });

  it('canvas element has aria-hidden="true"', () => {
    const { container } = render(<CoverArt gameTitle="EarthBound" />);
    const canvas = container.querySelector('canvas');
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
  });

  it('container has role="img"', () => {
    render(<CoverArt gameTitle="Final Fantasy VI" />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });
});

describe('hashTitle', () => {
  it('is deterministic (same input → same output)', () => {
    const result1 = hashTitle('Chrono Trigger');
    const result2 = hashTitle('Chrono Trigger');
    expect(result1).toBe(result2);
  });

  it('returns an unsigned 32-bit integer', () => {
    const result = hashTitle('Test');
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(0xffffffff);
  });
});

describe('colorIndexFromTitle', () => {
  it('returns a value between 0 and 7', () => {
    const index = colorIndexFromTitle('Chrono Trigger');
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThanOrEqual(7);
  });

  it('different titles produce different color indices', () => {
    const titles = [
      'Chrono Trigger',
      'Final Fantasy VI',
      'Secret of Mana',
      'EarthBound',
      'Super Metroid',
      'Donkey Kong Country',
    ];
    const indices = titles.map(colorIndexFromTitle);
    const unique = new Set(indices);
    // With 6 titles and 8 possible indices, we expect at least 2 distinct values
    expect(unique.size).toBeGreaterThanOrEqual(2);
  });

  it('is deterministic for the same title', () => {
    expect(colorIndexFromTitle('Mega Man X')).toBe(
      colorIndexFromTitle('Mega Man X'),
    );
  });
});
