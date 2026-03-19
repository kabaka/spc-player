import { createFileRoute } from '@tanstack/react-router';
import { zodValidator } from '@tanstack/zod-adapter';
import { z } from 'zod';

const playerSearchSchema = z.object({
  track: z.string().optional().default(''),
  speed: z.number().min(0.25).max(4).optional().default(1),
  voices: z.number().int().min(0).max(255).optional().default(255),
});

export const Route = createFileRoute('/')({
  validateSearch: zodValidator(playerSearchSchema),
  component: PlayerView,
});

function PlayerView() {
  const { track, speed, voices } = Route.useSearch();
  return (
    <div>
      <h1>SPC Player</h1>
      <p>Player view placeholder</p>
      {track && <p>Track: {track}</p>}
      {speed !== 1 && <p>Speed: {speed}x</p>}
      {voices !== 255 && <p>Voice mask: {voices}</p>}
    </div>
  );
}
