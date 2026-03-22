export function formatSubtitle(gameTitle: string, artist: string): string {
  return [gameTitle, artist].filter(Boolean).join(' · ');
}

export function formatTransportSubtitle(
  gameTitle: string,
  artist: string,
  sampleRateHz?: number,
  id666Format?: string,
): string {
  const parts = [gameTitle, artist].filter(Boolean);
  if (sampleRateHz) {
    parts.push(`${Math.round(sampleRateHz / 1000)}kHz`);
  }
  if (id666Format) {
    parts.push(id666Format === 'text' ? 'ID666' : 'ID666b');
  }
  return parts.join(' · ');
}
