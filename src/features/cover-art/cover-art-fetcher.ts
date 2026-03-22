import { sanitizeGameTitle } from '@/utils/sanitize-game-title';

import { getCoverArt, storeCoverArt } from './cover-art-storage';

const RETROARCH_BASE_URL =
  'https://raw.githubusercontent.com/libretro-thumbnails/Nintendo_-_Super_Nintendo_Entertainment_System/master/Named_Boxarts';

/**
 * Fetch cover art from the RetroArch thumbnails repository on GitHub.
 *
 * - Returns null immediately if `externalFetchEnabled` is false
 * - Sanitizes the game title before constructing the URL
 * - Checks IndexedDB cache before making a network request
 * - Caches successful fetches in IndexedDB for offline use
 * - Returns null on failure (404, network error, invalid data)
 */
export async function fetchRetroArchCoverArt(
  gameTitle: string,
  externalFetchEnabled: boolean,
): Promise<Uint8Array | null> {
  if (!externalFetchEnabled) return null;
  if (!gameTitle) return null;

  // Check IndexedDB cache first
  const cached = await getCoverArt(gameTitle);
  if (cached) return cached;

  // Sanitize title for URL construction
  const sanitizedTitle = sanitizeGameTitle(gameTitle);
  if (!sanitizedTitle) return null;

  const url = `${RETROARCH_BASE_URL}/${sanitizedTitle}.png`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    // Validate Content-Type before reading body
    const contentType = response.headers.get('Content-Type') ?? '';
    if (!contentType.startsWith('image/')) return null;

    const buffer = await response.arrayBuffer();
    const data = new Uint8Array(buffer);

    // Validate the response contains actual image data
    if (!isValidImage(data)) return null;

    // Cache in IndexedDB for offline use
    await storeCoverArt(gameTitle, data, 'retroarch');

    return data;
  } catch {
    return null;
  }
}

/** Check if data starts with PNG or JPEG magic bytes. */
function isValidImage(data: Uint8Array): boolean {
  if (data.length < 4) return false;

  // PNG: 89 50 4E 47
  if (
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47
  ) {
    return true;
  }

  // JPEG: FF D8 FF
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return true;
  }

  return false;
}
