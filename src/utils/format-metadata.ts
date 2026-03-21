export function formatSubtitle(gameTitle: string, artist: string): string {
  return [gameTitle, artist].filter(Boolean).join(' · ');
}
