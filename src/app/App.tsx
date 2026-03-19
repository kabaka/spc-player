import {
  createHashHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';

import { routeTree } from './routeTree.gen';

const hashHistory = createHashHistory();

const router = createRouter({
  routeTree,
  history: hashHistory,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export const App = () => {
  return <RouterProvider router={router} />;
};
