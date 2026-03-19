import { createFileRoute } from '@tanstack/react-router';
import { zodValidator } from '@tanstack/zod-adapter';
import { z } from 'zod';

const playlistSearchSchema = z.object({
  track: z.string().optional().default(''),
});

export const Route = createFileRoute('/playlist')({
  validateSearch: zodValidator(playlistSearchSchema),
  component: PlaylistView,
});

function PlaylistView() {
  const { track } = Route.useSearch();
  return (
    <div>
      <h1>Playlist</h1>
      <p>Playlist view placeholder</p>
      {track && <p>Highlighting track: {track}</p>}
    </div>
  );
}
