import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OnboardingOverlay } from './OnboardingOverlay';

const STORAGE_KEY = 'spc-player-onboarding-dismissed';

describe('OnboardingOverlay', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  afterEach(() => {
    cleanup();
    localStorage.removeItem(STORAGE_KEY);
  });

  it('renders when localStorage key is not set', () => {
    render(<OnboardingOverlay />);

    expect(
      screen.getByRole('dialog', { name: /welcome to spc player/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/drop spc files here/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /get started/i }),
    ).toBeInTheDocument();
  });

  it('does not render when localStorage key is set', () => {
    localStorage.setItem(STORAGE_KEY, 'true');

    render(<OnboardingOverlay />);

    expect(
      screen.queryByRole('dialog', { name: /welcome to spc player/i }),
    ).not.toBeInTheDocument();
  });

  it('sets localStorage and hides on dismiss button click', () => {
    render(<OnboardingOverlay />);

    fireEvent.click(screen.getByRole('button', { name: /get started/i }));

    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
    expect(
      screen.queryByRole('dialog', { name: /welcome to spc player/i }),
    ).not.toBeInTheDocument();
  });

  it('dismisses on Escape key', () => {
    render(<OnboardingOverlay />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
    expect(
      screen.queryByRole('dialog', { name: /welcome to spc player/i }),
    ).not.toBeInTheDocument();
  });

  it('dismisses when clicking the backdrop', () => {
    render(<OnboardingOverlay />);

    const backdrop = screen.getByRole('dialog', {
      name: /welcome to spc player/i,
    }).parentElement;
    if (backdrop) {
      fireEvent.click(backdrop);
    }

    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
    expect(
      screen.queryByRole('dialog', { name: /welcome to spc player/i }),
    ).not.toBeInTheDocument();
  });

  it('does not dismiss when clicking inside the panel', () => {
    render(<OnboardingOverlay />);

    fireEvent.click(screen.getByText(/drop spc files here/i));

    expect(
      screen.getByRole('dialog', { name: /welcome to spc player/i }),
    ).toBeInTheDocument();
  });

  it('displays all four callout messages', () => {
    render(<OnboardingOverlay />);

    expect(screen.getByText(/drop spc files here/i)).toBeInTheDocument();
    expect(screen.getByText(/to play\/pause/i)).toBeInTheDocument();
    expect(
      screen.getByText(/keyboard shortcuts and help/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/works offline/i)).toBeInTheDocument();
  });
});
