import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('App', () => {
  it('renders without crashing and displays player view', async () => {
    render(<App />);

    const elements = await screen.findAllByText('No track loaded');
    expect(elements.length).toBeGreaterThan(0);
  });

  it('renders navigation links', async () => {
    render(<App />);

    // Router is a module-level singleton, so find all navs and use the latest.
    const navs = await screen.findAllByRole('navigation', {
      name: /main navigation/i,
    });
    const nav = navs[navs.length - 1];

    expect(
      within(nav).getByRole('link', { name: /player/i }),
    ).toBeInTheDocument();
    expect(
      within(nav).getByRole('link', { name: /instrument/i }),
    ).toBeInTheDocument();
    expect(
      within(nav).getByRole('link', { name: /analysis/i }),
    ).toBeInTheDocument();
    expect(
      within(nav).getByRole('link', { name: /settings/i }),
    ).toBeInTheDocument();
  });
});
