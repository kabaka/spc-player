import { createFileRoute } from '@tanstack/react-router';
import { zodValidator } from '@tanstack/zod-adapter';
import { z } from 'zod';

const analysisSearchSchema = z.object({
  track: z.string().optional().default(''),
  tab: z
    .enum(['memory', 'registers', 'voices', 'echo'])
    .optional()
    .default('voices'),
});

export const Route = createFileRoute('/analysis')({
  validateSearch: zodValidator(analysisSearchSchema),
  component: AnalysisView,
});

function AnalysisView() {
  return (
    <div>
      <h1>Analysis</h1>
      <p>Analysis view placeholder</p>
    </div>
  );
}
