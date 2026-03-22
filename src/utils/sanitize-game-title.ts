/**
 * Sanitize a game title for safe use in fetch URLs.
 *
 * Strips path traversal characters, control characters, and BiDi overrides.
 * Validates length bounds and URL-encodes the result.
 */

const MAX_TITLE_LENGTH = 256;

export function sanitizeGameTitle(title: string): string {
  if (!title || typeof title !== 'string') return '';

  // Strip null bytes and control characters (0x00–0x1F, 0x7F)
  // eslint-disable-next-line no-control-regex
  let cleaned = title.replace(/[\x00-\x1F\x7F]/g, '');

  // Strip Unicode BiDi override and invisible characters
  cleaned = cleaned.replace(
    /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g,
    '',
  );

  // Strip path traversal sequences
  cleaned = cleaned.replace(/\.\./g, '');
  cleaned = cleaned.replace(/[/\\]/g, '');

  // Trim whitespace
  cleaned = cleaned.trim();

  if (cleaned.length === 0) return '';

  // Enforce maximum length
  if (cleaned.length > MAX_TITLE_LENGTH) {
    cleaned = cleaned.slice(0, MAX_TITLE_LENGTH);
  }

  // URL-encode for safe use in fetch URLs
  return encodeURIComponent(cleaned);
}
