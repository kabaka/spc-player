/**
 * Unit tests for cover-art-fetcher.ts — RetroArch thumbnail fetching.
 *
 * Uses fake-indexeddb for storage and vitest mocking for fetch.
 */

import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDbInstance } from '@/storage/db';

import { fetchRetroArchCoverArt } from './cover-art-fetcher';
import { getCoverArt, storeCoverArt } from './cover-art-storage';

// PNG magic header
const PNG_DATA = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
]);

describe('fetchRetroArchCoverArt', () => {
  beforeEach(() => {
    resetDbInstance();
    // eslint-disable-next-line no-global-assign
    indexedDB = new IDBFactory();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when externalFetchEnabled is false', async () => {
    const result = await fetchRetroArchCoverArt('Chrono Trigger', false);
    expect(result).toBeNull();
  });

  it('returns null for empty game title', async () => {
    const result = await fetchRetroArchCoverArt('', true);
    expect(result).toBeNull();
  });

  it('returns cached art from IndexedDB without fetching', async () => {
    const imageData = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 5, 6, 7, 8]);
    await storeCoverArt('Chrono Trigger', imageData, 'retroarch');

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await fetchRetroArchCoverArt('Chrono Trigger', true);

    expect(result).not.toBeNull();
    const art = result as Uint8Array;
    expect(art[0]).toBe(0x89);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches from RetroArch and caches result', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(PNG_DATA.buffer, {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    );

    const result = await fetchRetroArchCoverArt('Super Mario World', true);

    expect(result).not.toBeNull();
    const art = result as Uint8Array;
    expect(art[0]).toBe(0x89);

    // Verify it was cached
    const cached = await getCoverArt('Super Mario World');
    expect(cached).not.toBeNull();
  });

  it('returns null on 404 response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 404 }),
    );

    const result = await fetchRetroArchCoverArt('Unknown Game', true);
    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new TypeError('Network error'),
    );

    const result = await fetchRetroArchCoverArt('Some Game', true);
    expect(result).toBeNull();
  });

  it('returns null when response is not valid image data', async () => {
    const htmlResponse = new TextEncoder().encode('<html>Not an image</html>');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(htmlResponse.buffer, {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    );

    const result = await fetchRetroArchCoverArt('Some Game', true);
    expect(result).toBeNull();
  });

  it('constructs correct URL with sanitized title', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(PNG_DATA.buffer, {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    );

    await fetchRetroArchCoverArt('Chrono Trigger', true);

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('Chrono%20Trigger.png'),
    );
  });
});
