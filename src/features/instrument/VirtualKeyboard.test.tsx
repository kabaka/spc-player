import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VirtualKeyboard } from './VirtualKeyboard';

describe('VirtualKeyboard', () => {
  afterEach(() => {
    cleanup();
  });

  const defaultProps = {
    baseOctave: 4,
    octaveCount: 2,
    activeNotes: new Set<number>(),
    isInstrumentMode: false,
    onNoteOn: vi.fn(),
    onNoteOff: vi.fn(),
  };

  it('renders correct number of keys for 2 octaves (24 keys)', () => {
    render(<VirtualKeyboard {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(24);
  });

  it('renders all keys as button elements', () => {
    render(<VirtualKeyboard {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    for (const btn of buttons) {
      expect(btn.tagName).toBe('BUTTON');
    }
  });

  it('has aria-label with spoken note name on each key', () => {
    render(<VirtualKeyboard {...defaultProps} />);
    expect(screen.getByLabelText('C 4')).toBeInTheDocument();
    expect(screen.getByLabelText('C sharp 4')).toBeInTheDocument();
    expect(screen.getByLabelText('B 5')).toBeInTheDocument();
  });

  it('marks active notes with aria-pressed="true" and data-state="pressed"', () => {
    const activeNotes = new Set([60, 64]);
    render(<VirtualKeyboard {...defaultProps} activeNotes={activeNotes} />);

    const c4 = screen.getByLabelText('C 4');
    expect(c4).toHaveAttribute('aria-pressed', 'true');
    expect(c4).toHaveAttribute('data-state', 'pressed');

    const e4 = screen.getByLabelText('E 4');
    expect(e4).toHaveAttribute('aria-pressed', 'true');

    const d4 = screen.getByLabelText('D 4');
    expect(d4).toHaveAttribute('aria-pressed', 'false');
  });

  it('has exactly one key with tabindex="0" (roving tabindex)', () => {
    render(<VirtualKeyboard {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    const focusable = buttons.filter(
      (btn) => btn.getAttribute('tabindex') === '0',
    );
    expect(focusable).toHaveLength(1);
  });

  it('triggers onNoteOn on mouse down', () => {
    const onNoteOn = vi.fn();
    render(<VirtualKeyboard {...defaultProps} onNoteOn={onNoteOn} />);

    const c4 = screen.getByLabelText('C 4');
    fireEvent.mouseDown(c4);
    expect(onNoteOn).toHaveBeenCalledWith(60);
  });

  it('triggers onNoteOff on mouse up', () => {
    const onNoteOff = vi.fn();
    render(<VirtualKeyboard {...defaultProps} onNoteOff={onNoteOff} />);

    const c4 = screen.getByLabelText('C 4');
    fireEvent.mouseDown(c4);
    fireEvent.mouseUp(c4);
    expect(onNoteOff).toHaveBeenCalledWith(60);
  });

  it('has container with role="group" and proper aria attributes', () => {
    render(<VirtualKeyboard {...defaultProps} />);
    const group = screen.getByRole('group');
    expect(group).toHaveAttribute(
      'aria-label',
      'Virtual keyboard, 2 octaves from C4 to B5',
    );
    expect(group).toHaveAttribute('aria-roledescription', 'piano keyboard');
  });

  it('shows key hints when instrument mode is active', () => {
    render(<VirtualKeyboard {...defaultProps} isInstrumentMode={true} />);
    const c4 = screen.getByLabelText('C 4');
    // The first child is the note name, check for 'Z' hint
    const hints = c4.querySelectorAll('[aria-hidden="true"]');
    const hintTexts = Array.from(hints).map((h) => h.textContent);
    expect(hintTexts).toContain('Z');
  });

  it('moves focus with arrow keys', () => {
    render(<VirtualKeyboard {...defaultProps} />);
    const buttons = screen.getAllByRole('button');

    // Focus first key
    buttons[0].focus();
    expect(document.activeElement).toBe(buttons[0]);

    // Arrow right should move to next key
    fireEvent.keyDown(buttons[0], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(buttons[1]);
  });

  it('triggers note-on/note-off with Enter key', () => {
    const onNoteOn = vi.fn();
    const onNoteOff = vi.fn();
    render(
      <VirtualKeyboard
        {...defaultProps}
        onNoteOn={onNoteOn}
        onNoteOff={onNoteOff}
      />,
    );

    const c4 = screen.getByLabelText('C 4');
    c4.focus();
    fireEvent.keyDown(c4, { key: 'Enter' });
    expect(onNoteOn).toHaveBeenCalledWith(60);

    fireEvent.keyUp(c4, { key: 'Enter' });
    expect(onNoteOff).toHaveBeenCalledWith(60);
  });

  it('triggers note-on/note-off with Space key', () => {
    const onNoteOn = vi.fn();
    const onNoteOff = vi.fn();
    render(
      <VirtualKeyboard
        {...defaultProps}
        onNoteOn={onNoteOn}
        onNoteOff={onNoteOff}
      />,
    );

    const d4 = screen.getByLabelText('D 4');
    d4.focus();
    fireEvent.keyDown(d4, { key: ' ' });
    expect(onNoteOn).toHaveBeenCalledWith(62);

    fireEvent.keyUp(d4, { key: ' ' });
    expect(onNoteOff).toHaveBeenCalledWith(62);
  });

  it('does not duplicate note-on on key repeat', () => {
    const onNoteOn = vi.fn();
    render(<VirtualKeyboard {...defaultProps} onNoteOn={onNoteOn} />);

    const c4 = screen.getByLabelText('C 4');
    c4.focus();
    fireEvent.keyDown(c4, { key: 'Enter' });
    fireEvent.keyDown(c4, { key: 'Enter' }); // repeat
    fireEvent.keyDown(c4, { key: 'Enter' }); // repeat
    expect(onNoteOn).toHaveBeenCalledTimes(1);
  });
});
