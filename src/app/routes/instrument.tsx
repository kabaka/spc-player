import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/instrument')({
  component: InstrumentView,
});

function InstrumentView() {
  return (
    <div>
      <h1>Instrument</h1>
      <p>Instrument view placeholder</p>
    </div>
  );
}
