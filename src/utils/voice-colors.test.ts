import { describe, expect, it } from 'vitest';

import { getVoiceColor, VOICE_COLORS } from './voice-colors';

describe('VOICE_COLORS', () => {
  it('has exactly 8 entries', () => {
    expect(VOICE_COLORS).toHaveLength(8);
  });

  it('contains the correct hex values in order', () => {
    expect(VOICE_COLORS).toEqual([
      '#60a5fa',
      '#a78bfa',
      '#4ade80',
      '#fbbf24',
      '#22d3ee',
      '#f472b6',
      '#fb923c',
      '#f87171',
    ]);
  });

  it('every entry is a valid hex color string', () => {
    for (const color of VOICE_COLORS) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('getVoiceColor', () => {
  it('returns the correct color for each voice index 0–7', () => {
    for (let i = 0; i < 8; i++) {
      expect(getVoiceColor(i)).toBe(VOICE_COLORS[i]);
    }
  });

  it('clamps negative index to voice 0', () => {
    expect(getVoiceColor(-1)).toBe(VOICE_COLORS[0]);
    expect(getVoiceColor(-100)).toBe(VOICE_COLORS[0]);
  });

  it('clamps index > 7 to voice 7', () => {
    expect(getVoiceColor(8)).toBe(VOICE_COLORS[7]);
    expect(getVoiceColor(100)).toBe(VOICE_COLORS[7]);
  });

  it('floors fractional indices', () => {
    expect(getVoiceColor(2.9)).toBe(VOICE_COLORS[2]);
    expect(getVoiceColor(0.5)).toBe(VOICE_COLORS[0]);
  });

  it('returns a valid hex string for any index', () => {
    expect(getVoiceColor(-999)).toMatch(/^#[0-9a-f]{6}$/i);
    expect(getVoiceColor(999)).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
