import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings')({
  component: SettingsView,
});

function SettingsView() {
  return (
    <div>
      <h1>Settings</h1>
      <p>Settings view placeholder</p>
    </div>
  );
}
