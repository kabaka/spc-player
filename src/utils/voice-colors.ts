/**
 * Voice color palette — canonical hex values for 8 SNES SPC voice channels.
 *
 * These match the CSS custom properties `--spc-color-voice-0` through
 * `--spc-color-voice-7` defined in `src/styles/tokens.css`.
 */

/** The 8 voice channel colors as hex strings, indexed by voice number (0–7). */
export const VOICE_COLORS: readonly string[] = [
  '#60a5fa', // Voice 0 — Blue
  '#a78bfa', // Voice 1 — Purple
  '#4ade80', // Voice 2 — Green
  '#fbbf24', // Voice 3 — Gold
  '#22d3ee', // Voice 4 — Cyan
  '#f472b6', // Voice 5 — Pink
  '#fb923c', // Voice 6 — Orange
  '#f87171', // Voice 7 — Red
] as const;

/**
 * Get the hex color for a voice channel, clamping the index to 0–7.
 */
export function getVoiceColor(voiceIndex: number): string {
  const clamped = Math.max(0, Math.min(7, Math.floor(voiceIndex)));
  return VOICE_COLORS[clamped];
}
