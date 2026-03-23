import { createFileRoute } from '@tanstack/react-router';
import { zodValidator } from '@tanstack/zod-adapter';
import { z } from 'zod';

import { InstrumentView } from '@/features/instrument/InstrumentView';

const instrumentSearchSchema = z.object({
  track: z.string().optional().default(''),
});

export const Route = createFileRoute('/instrument')({
  validateSearch: zodValidator(instrumentSearchSchema),
  component: InstrumentView,
});
