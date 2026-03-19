import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/analysis')({
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
