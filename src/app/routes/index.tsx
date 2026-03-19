import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: PlayerView,
});

function PlayerView() {
  return (
    <div>
      <h1>SPC Player</h1>
      <p>Player view placeholder</p>
    </div>
  );
}
