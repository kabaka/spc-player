import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockPathname = '/';

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    className,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
    className?: string;
    [key: string]: unknown;
  }) => (
    <a href={to} className={className} {...rest}>
      {children}
    </a>
  ),
  useRouterState: vi.fn(({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { pathname: mockPathname } }),
  ),
}));

import { BottomNav } from './BottomNav';

describe('BottomNav', () => {
  beforeEach(() => {
    mockPathname = '/';
  });

  it('renders exactly 3 navigation items', () => {
    render(<BottomNav />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(3);
  });

  it('renders Player, Tools, and Settings items', () => {
    render(<BottomNav />);

    expect(screen.getByText('Player')).toBeInTheDocument();
    expect(screen.getByText('Tools')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('does not render Playlist or Instrument as a label', () => {
    render(<BottomNav />);

    expect(screen.queryByText('Playlist')).not.toBeInTheDocument();
    expect(screen.queryByText('Instrument')).not.toBeInTheDocument();
  });

  it('highlights Player as active on root route', () => {
    mockPathname = '/';
    render(<BottomNav />);

    const playerLink = screen.getByText('Player').closest('a');
    expect(playerLink?.className).toContain('active');
  });

  it('highlights Tools as active on /tools route', () => {
    mockPathname = '/tools';
    render(<BottomNav />);

    const toolsLink = screen.getByText('Tools').closest('a');
    expect(toolsLink?.className).toContain('active');
  });

  it('highlights Settings as active on /settings route', () => {
    mockPathname = '/settings';
    render(<BottomNav />);

    const settingsLink = screen.getByText('Settings').closest('a');
    expect(settingsLink?.className).toContain('active');
  });

  it('has proper aria-label on nav element', () => {
    render(<BottomNav />);

    const nav = screen.getByRole('navigation', {
      name: /mobile navigation/i,
    });
    expect(nav).toBeInTheDocument();
  });
});
