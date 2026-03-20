import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createRootRoute,
  Link,
  Outlet,
  useRouterState,
} from '@tanstack/react-router';

import { ShortcutHelpDialog } from '@/components/ShortcutHelpDialog/ShortcutHelpDialog';
import { ThemeToggle } from '@/components/ThemeToggle/ThemeToggle';
import { BottomNav } from '@/components/BottomNav/BottomNav';
import { ToastContainer } from '@/components/Toast/Toast';
import { ViewErrorBoundary } from '@/components/ViewErrorBoundary';
import { useTheme } from '@/hooks/useTheme';
import { InstallPrompt, UpdatePrompt } from '@/pwa/InstallPrompt';
import { useMediaSession } from '@/pwa/media-session';
import { OfflineIndicator } from '@/pwa/OfflineIndicator';
import { GlobalShortcuts } from '@/shortcuts/GlobalShortcuts';
import { shortcutManager } from '@/shortcuts/ShortcutManager';
import { useShortcut } from '@/shortcuts/useShortcut';

import styles from './AppShell.module.css';

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const mainRef = useRef<HTMLElement>(null);
  const location = useRouterState({ select: (s) => s.location });
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);

  // Apply theme from Zustand store
  useTheme();

  // Activate Media Session for OS-level playback controls
  useMediaSession();

  // Attach keyboard shortcut manager
  useEffect(() => {
    shortcutManager.attach();
    return () => {
      shortcutManager.detach();
    };
  }, []);

  useEffect(() => {
    mainRef.current?.focus();
  }, [location.pathname]);

  const handleToggleHelp = useCallback(() => {
    setShowShortcutHelp((prev) => !prev);
  }, []);

  // Wire shortcut help toggle
  useShortcut('navigation.showHelp', handleToggleHelp);

  return (
    <div className={styles.shell}>
      <GlobalShortcuts />

      <nav className={styles.nav} aria-label="Main navigation">
        <Link
          to="/"
          activeProps={{
            className: styles.active,
            'aria-current': 'page' as const,
          }}
        >
          Player
        </Link>
        <Link
          to="/playlist"
          activeProps={{
            className: styles.active,
            'aria-current': 'page' as const,
          }}
        >
          Playlist
        </Link>
        <Link
          to="/instrument"
          activeProps={{
            className: styles.active,
            'aria-current': 'page' as const,
          }}
        >
          Instrument
        </Link>
        <Link
          to="/analysis"
          activeProps={{
            className: styles.active,
            'aria-current': 'page' as const,
          }}
        >
          Analysis
        </Link>
        <Link
          to="/settings"
          activeProps={{
            className: styles.active,
            'aria-current': 'page' as const,
          }}
        >
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
        <ViewErrorBoundary>
          <Outlet />
        </ViewErrorBoundary>
      </main>

      <div id="player-controls" tabIndex={-1} className={styles.playerBar}>
        {/* Player transport controls placeholder */}
      </div>

      <BottomNav />

      <ShortcutHelpDialog
        open={showShortcutHelp}
        onOpenChange={setShowShortcutHelp}
      />

      <InstallPrompt />
      <UpdatePrompt />
      <OfflineIndicator />
      <ToastContainer />
    </div>
  );
}
