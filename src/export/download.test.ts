import { describe, it, expect } from 'vitest';

import type { ExportMetadata } from './encoders/encoder-types';
import { generateFilename, sanitizeFilename } from './download';

describe('sanitizeFilename', () => {
  it('replaces illegal characters with underscores', () => {
    expect(sanitizeFilename('file<>:"/\\|?*name')).toBe('file_________name');
  });

  it('removes control characters', () => {
    expect(sanitizeFilename('file\x00\x1Fname')).toBe('file__name');
  });

  it('collapses whitespace', () => {
    expect(sanitizeFilename('hello   world')).toBe('hello world');
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeFilename('  spaced  ')).toBe('spaced');
  });

  it('truncates to 200 characters', () => {
    const long = 'a'.repeat(250);
    expect(sanitizeFilename(long).length).toBe(200);
  });

  it('handles empty string', () => {
    expect(sanitizeFilename('')).toBe('');
  });
});

describe('generateFilename', () => {
  const metadata: ExportMetadata = {
    title: 'Corridors of Time',
    artist: 'Yasunori Mitsuda',
    game: 'Chrono Trigger',
  };

  it('generates full mix filename', () => {
    expect(generateFilename(metadata, 'wav')).toBe(
      'Chrono Trigger - Corridors of Time.wav',
    );
  });

  it('generates full mix filename for different formats', () => {
    expect(generateFilename(metadata, 'flac')).toBe(
      'Chrono Trigger - Corridors of Time.flac',
    );
    expect(generateFilename(metadata, 'ogg')).toBe(
      'Chrono Trigger - Corridors of Time.ogg',
    );
    expect(generateFilename(metadata, 'mp3')).toBe(
      'Chrono Trigger - Corridors of Time.mp3',
    );
  });

  it('generates per-voice filename without instrument name', () => {
    expect(generateFilename(metadata, 'flac', 2)).toBe(
      'Chrono Trigger - Corridors of Time - Voice 3.flac',
    );
  });

  it('generates per-voice filename with instrument name', () => {
    expect(generateFilename(metadata, 'wav', 0, 'Piano')).toBe(
      'Chrono Trigger - Corridors of Time - Voice 1 (Piano).wav',
    );
  });

  it('generates per-instrument sample filename', () => {
    expect(generateFilename(metadata, 'wav', undefined, 'Strings', 4)).toBe(
      'Chrono Trigger - Corridors of Time - Sample 05 (Strings).wav',
    );
  });

  it('generates per-instrument sample filename without name', () => {
    expect(generateFilename(metadata, 'wav', undefined, undefined, 0)).toBe(
      'Chrono Trigger - Corridors of Time - Sample 01.wav',
    );
  });

  it('uses defaults for missing metadata fields', () => {
    const sparse: ExportMetadata = {};
    expect(generateFilename(sparse, 'mp3')).toBe('Unknown Game - Untitled.mp3');
  });

  it('sanitizes metadata values in filenames', () => {
    const dirty: ExportMetadata = {
      title: 'Song: "The Best"',
      game: 'Game<>Quest',
    };
    expect(generateFilename(dirty, 'wav')).toBe(
      'Game__Quest - Song_ _The Best_.wav',
    );
  });

  it('sanitizes instrument name in per-voice filename', () => {
    expect(generateFilename(metadata, 'wav', 0, 'Inst/Name')).toBe(
      'Chrono Trigger - Corridors of Time - Voice 1 (Inst_Name).wav',
    );
  });

  it('pads sample index to 2 digits', () => {
    expect(generateFilename(metadata, 'wav', undefined, undefined, 9)).toBe(
      'Chrono Trigger - Corridors of Time - Sample 10.wav',
    );
  });

  it('uses 1-based voice numbering', () => {
    // Voice index 0 → "Voice 1"
    expect(generateFilename(metadata, 'wav', 0)).toContain('Voice 1');
    // Voice index 7 → "Voice 8"
    expect(generateFilename(metadata, 'wav', 7)).toContain('Voice 8');
  });
});
