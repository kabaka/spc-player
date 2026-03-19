import { createFileRoute } from '@tanstack/react-router';
import { zodValidator } from '@tanstack/zod-adapter';
import { z } from 'zod';

import { PlayerView } from '@/features/player/PlayerView';

const playerSearchSchema = z.object({
  track: z.string().optional().default(''),
  speed: z.number().min(0.25).max(4).optional().default(1),
  voices: z.number().int().min(0).max(255).optional().default(255),
});

export const Route = createFileRoute('/')({
  validateSearch: zodValidator(playerSearchSchema),
  component: PlayerView,
});
