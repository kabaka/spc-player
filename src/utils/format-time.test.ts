import { describe, expect, it } from 'vitest';

import { formatSpokenTime, formatTime } from './format-time';

describe('formatTime', () => {
  it('formats zero seconds', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  it('formats seconds with zero-padding', () => {
    expect(formatTime(5)).toBe('0:05');
  });

  it('formats minutes and seconds', () => {
    expect(formatTime(65)).toBe('1:05');
  });

  it('formats large values', () => {
    expect(formatTime(3600)).toBe('60:00');
  });

  it('clamps negative values to zero', () => {
    expect(formatTime(-10)).toBe('0:00');
  });

  it('floors fractional seconds', () => {
    expect(formatTime(65.9)).toBe('1:05');
  });
});

describe('formatSpokenTime', () => {
  it('formats zero seconds', () => {
    expect(formatSpokenTime(0)).toBe('0 seconds');
  });

  it('formats singular minute', () => {
    expect(formatSpokenTime(60)).toBe('1 minute');
  });

  it('formats plural minutes with seconds', () => {
    expect(formatSpokenTime(65)).toBe('1 minute 5 seconds');
  });

  it('formats plural minutes without leftover seconds', () => {
    expect(formatSpokenTime(120)).toBe('2 minutes');
  });

  it('formats singular second', () => {
    expect(formatSpokenTime(1)).toBe('1 second');
  });

  it('formats seconds only', () => {
    expect(formatSpokenTime(45)).toBe('45 seconds');
  });

  it('clamps negative values to zero', () => {
    expect(formatSpokenTime(-5)).toBe('0 seconds');
  });

  it('floors fractional seconds', () => {
    expect(formatSpokenTime(65.9)).toBe('1 minute 5 seconds');
  });
});
