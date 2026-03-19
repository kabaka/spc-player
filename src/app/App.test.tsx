import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { App } from './App';

describe('App', () => {
  it('renders without crashing and displays heading', async () => {
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: /spc player/i }),
    ).toBeInTheDocument();
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
      within(nav).getByRole('link', { name: /playlist/i }),
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
