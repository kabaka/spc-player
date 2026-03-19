import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/$catch')({
  component: NotFound,
});

function NotFound() {
  return (
    <div role="alert">
      <h1>Page Not Found</h1>
      <p>The page you requested does not exist.</p>
      <Link to="/">Return to Player</Link>
    </div>
  );
}
