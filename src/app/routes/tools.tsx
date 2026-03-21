import { createFileRoute } from '@tanstack/react-router';

import { ToolsView } from '@/features/tools/ToolsView';

export const Route = createFileRoute('/tools')({
  component: ToolsView,
});
