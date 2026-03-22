import { describe, expect, it } from 'vitest';

import { sanitizeGameTitle } from './sanitize-game-title';

describe('sanitizeGameTitle', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeGameTitle('')).toBe('');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeGameTitle(null as unknown as string)).toBe('');
    expect(sanitizeGameTitle(undefined as unknown as string)).toBe('');
    expect(sanitizeGameTitle(123 as unknown as string)).toBe('');
  });

  it('encodes a simple title', () => {
    expect(sanitizeGameTitle('Chrono Trigger')).toBe('Chrono%20Trigger');
  });

  it('strips path traversal dot sequences', () => {
    const result = sanitizeGameTitle('..foo..bar..');
    expect(decodeURIComponent(result)).toBe('foobar');
  });

  it('strips forward slashes', () => {
    const result = sanitizeGameTitle('foo/bar/baz');
    expect(decodeURIComponent(result)).toBe('foobarbaz');
  });

  it('strips backslashes', () => {
    const result = sanitizeGameTitle('foo\\bar\\baz');
    expect(decodeURIComponent(result)).toBe('foobarbaz');
  });

  it('strips control characters', () => {
    const result = sanitizeGameTitle('foo\x00bar\x1Fbaz\x7F');
    expect(decodeURIComponent(result)).toBe('foobarbaz');
  });

  it('strips BiDi override characters', () => {
    const result = sanitizeGameTitle('foo\u202Abar\u202Ebaz');
    expect(decodeURIComponent(result)).toBe('foobarbaz');
  });

  it('trims whitespace', () => {
    expect(sanitizeGameTitle('  Chrono Trigger  ')).toBe('Chrono%20Trigger');
  });

  it('truncates titles exceeding maximum length', () => {
    const long = 'A'.repeat(300);
    const result = sanitizeGameTitle(long);
    const decoded = decodeURIComponent(result);
    expect(decoded.length).toBe(256);
  });

  it('preserves special characters via URL encoding', () => {
    expect(sanitizeGameTitle("Donkey Kong Country 2: Diddy's Quest")).toBe(
      "Donkey%20Kong%20Country%202%3A%20Diddy's%20Quest",
    );
  });

  it('handles combined path traversal attack', () => {
    const malicious = '../../etc/passwd';
    const result = sanitizeGameTitle(malicious);
    const decoded = decodeURIComponent(result);
    expect(decoded).not.toContain('..');
    expect(decoded).not.toContain('/');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(sanitizeGameTitle('   ')).toBe('');
  });

  it('returns empty string when all characters are stripped', () => {
    expect(sanitizeGameTitle('../../../')).toBe('');
  });

  it('handles Japanese game titles', () => {
    const title = 'クロノ・トリガー';
    const result = sanitizeGameTitle(title);
    expect(decodeURIComponent(result)).toBe(title);
  });

  it('handles ampersands and parentheses', () => {
    const result = sanitizeGameTitle('Super Mario World (USA)');
    expect(decodeURIComponent(result)).toBe('Super Mario World (USA)');
  });
});
