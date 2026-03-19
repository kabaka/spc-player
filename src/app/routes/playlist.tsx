import { createFileRoute } from '@tanstack/react-router';

import { PlaylistView } from '@/features/playlist/PlaylistView';

export const Route = createFileRoute('/playlist')({
  component: PlaylistView,
});
