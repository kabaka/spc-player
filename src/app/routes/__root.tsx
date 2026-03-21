import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createRootRoute,
  Link,
  Outlet,
  useRouterState,
} from '@tanstack/react-router';

import { ShortcutHelpDialog } from '@/components/ShortcutHelpDialog/ShortcutHelpDialog';
import { BottomNav } from '@/components/BottomNav/BottomNav';
import { DragDropOverlay } from '@/components/DragDropOverlay/DragDropOverlay';
import { PlaylistSidebar } from '@/components/PlaylistSidebar/PlaylistSidebar';
import { ToastContainer } from '@/components/Toast/Toast';
import { ViewErrorBoundary } from '@/components/ViewErrorBoundary';
import { useAutoAdvance } from '@/hooks/useAutoAdvance';
import { usePlaybackPosition } from '@/hooks/usePlaybackPosition';
import { useTheme } from '@/hooks/useTheme';
import { InstallPrompt, UpdatePrompt } from '@/pwa/InstallPrompt';
import { useMediaSession } from '@/pwa/media-session';
import { OfflineIndicator } from '@/pwa/OfflineIndicator';
import { GlobalShortcuts } from '@/shortcuts/GlobalShortcuts';
import { shortcutManager } from '@/shortcuts/ShortcutManager';
import { useShortcut } from '@/shortcuts/useShortcut';
import { useAppStore } from '@/store/store';
import { TransportBar } from '@/components/TransportBar/TransportBar';

import styles from './AppShell.module.css';

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const mainRef = useRef<HTMLElement>(null);
  const location = useRouterState({ select: (s) => s.location });
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const announcement = useAppStore((s) => s.announcement);

  // Apply theme from Zustand store
  useTheme();

  // Sync playback position from audio state buffer into Zustand
  usePlaybackPosition();

  // Auto-advance to next track when playback ends
  useAutoAdvance();

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

      {/* Mobile top bar — visible on mobile only */}
      <div className={styles.mobileTopBar}>
        <span className={styles.logo} aria-hidden="true">
          🎮 SPC Player
        </span>
        <button
          type="button"
          className={styles.menuButton}
          aria-label="Menu"
          aria-hidden="true"
          tabIndex={-1}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
          </svg>
        </button>
      </div>

      {/* Top nav — hidden on mobile, horizontal on tablet+ */}
      <nav className={styles.topNav} aria-label="Main navigation">
        <span className={styles.topNavLogo}>🎮 SPC Player</span>
        <div className={styles.topNavLinks}>
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
            className={styles.settingsLink}
            activeProps={{
              className: `${styles.settingsLink} ${styles.active}`,
              'aria-current': 'page' as const,
            }}
            aria-label="Settings"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z" />
            </svg>
          </Link>
        </div>
      </nav>

      {/* Layout body — sidebar + main content */}
      <div className={styles.layoutBody}>
        <aside className={styles.sidebar} aria-label="Playlist">
          <PlaylistSidebar />
        </aside>

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
      </div>

      {/* Transport controls — always visible */}
      <TransportBar />

      <BottomNav />

      <DragDropOverlay />

      <ShortcutHelpDialog
        open={showShortcutHelp}
        onOpenChange={setShowShortcutHelp}
      />

      <InstallPrompt />
      <UpdatePrompt />
      <OfflineIndicator />
      <ToastContainer />

      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="visually-hidden"
      >
        {announcement}
      </div>
    </div>
  );
}
