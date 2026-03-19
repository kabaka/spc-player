import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/playlist')({
  component: PlaylistView,
});

function PlaylistView() {
  return (
    <div>
      <h1>Playlist</h1>
      <p>Playlist view placeholder</p>
    </div>
  );
}
