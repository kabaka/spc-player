import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    className,
  }: {
    to: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

import { ToolsView } from './ToolsView';

describe('ToolsView', () => {
  it('renders the tools heading', () => {
    render(<ToolsView />);

    expect(screen.getByRole('heading', { name: /tools/i })).toBeInTheDocument();
  });

  it('renders links to instrument and analysis pages', () => {
    render(<ToolsView />);

    const instrumentLink = screen.getByText('Instrument Mode').closest('a');
    expect(instrumentLink).toHaveAttribute('href', '/instrument');

    const analysisLink = screen.getByText('Analysis').closest('a');
    expect(analysisLink).toHaveAttribute('href', '/analysis');
  });

  it('shows descriptions for each tool', () => {
    render(<ToolsView />);

    expect(
      screen.getByText('Play SPC instruments with MIDI'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Memory, registers, and voice state'),
    ).toBeInTheDocument();
  });

  it('has proper main landmark with aria-label', () => {
    render(<ToolsView />);

    expect(screen.getByRole('main', { name: /tools/i })).toBeInTheDocument();
  });

  it('renders tool links as a list', () => {
    render(<ToolsView />);

    const list = screen.getByRole('list');
    expect(list).toBeInTheDocument();

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
  });
});
