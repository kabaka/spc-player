import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/store';

import { ThemeSettings } from './ThemeSettings';

describe('ThemeSettings', () => {
  beforeEach(() => {
    useAppStore.setState({ theme: 'system' });
  });

  it('renders all theme options', () => {
    render(<ThemeSettings />);

    expect(screen.getByLabelText(/dark/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/light/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/system/i)).toBeInTheDocument();
  });

  it('reflects current theme from store', () => {
    useAppStore.setState({ theme: 'dark' });
    render(<ThemeSettings />);

    expect(screen.getByLabelText(/dark/i)).toBeChecked();
    expect(screen.getByLabelText(/light/i)).not.toBeChecked();
  });

  it('updates store when theme is changed', () => {
    render(<ThemeSettings />);

    fireEvent.click(screen.getByLabelText(/light/i));

    expect(useAppStore.getState().theme).toBe('light');
  });

  it('shows resolved theme hint when system is selected', () => {
    useAppStore.setState({ theme: 'system' });
    render(<ThemeSettings />);

    // jsdom matchMedia defaults to not matching prefers-color-scheme: dark,
    // so the resolved theme is Light
    expect(screen.getByText(/currently: light/i)).toBeInTheDocument();
  });

  it('hides resolved theme hint when system is not selected', () => {
    useAppStore.setState({ theme: 'dark' });
    render(<ThemeSettings />);

    expect(screen.queryByText(/currently:/i)).not.toBeInTheDocument();
  });
});
