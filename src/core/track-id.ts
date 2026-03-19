/**
 * Compute a unique track ID from file content using SHA-256.
 *
 * The ID is a lowercase hex string of the SHA-256 digest, providing
 * a content-addressable identifier for deduplication and storage keys.
 */
export async function computeTrackId(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const bytes = new Uint8Array(digest);

  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}
