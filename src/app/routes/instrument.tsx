import { createFileRoute } from '@tanstack/react-router';
import { zodValidator } from '@tanstack/zod-adapter';
import { z } from 'zod';

import { InstrumentView } from '@/features/instrument/InstrumentView';

const instrumentSearchSchema = z.object({
  track: z.string().optional().default(''),
  instrument: z.number().int().min(0).max(7).optional().default(0),
});

export const Route = createFileRoute('/instrument')({
  validateSearch: zodValidator(instrumentSearchSchema),
  component: InstrumentView,
});
