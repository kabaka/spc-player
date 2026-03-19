import { useEffect, useRef } from 'react';
import {
  createRootRoute,
  Link,
  Outlet,
  useRouterState,
} from '@tanstack/react-router';

import { ThemeToggle } from '../../components/ThemeToggle/ThemeToggle';
import styles from './AppShell.module.css';

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const mainRef = useRef<HTMLElement>(null);
  const location = useRouterState({ select: (s) => s.location });

  useEffect(() => {
    mainRef.current?.focus();
  }, [location.pathname]);

  return (
    <div className={styles.shell}>
      <nav className={styles.nav} aria-label="Main navigation">
        <Link to="/" activeProps={{ className: styles.active }}>
          Player
        </Link>
        <Link to="/playlist" activeProps={{ className: styles.active }}>
          Playlist
        </Link>
        <Link to="/instrument" activeProps={{ className: styles.active }}>
          Instrument
        </Link>
        <Link to="/analysis" activeProps={{ className: styles.active }}>
          Analysis
        </Link>
        <Link to="/settings" activeProps={{ className: styles.active }}>
          Settings
        </Link>
        <ThemeToggle />
      </nav>

      <main
        id="main-content"
        ref={mainRef}
        tabIndex={-1}
        className={styles.main}
      >
        <Outlet />
      </main>

      <div id="player-controls" tabIndex={-1} className={styles.playerBar}>
        {/* Player transport controls placeholder */}
      </div>
    </div>
  );
}
