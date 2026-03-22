import type { ChangeEvent } from 'react';
import { lazy, Suspense, useCallback, useRef } from 'react';

import { Button } from '@/components/Button/Button';
import { CollapsiblePanel } from '@/components/CollapsiblePanel/CollapsiblePanel';
import { NowPlayingInfo } from '@/components/NowPlayingInfo/NowPlayingInfo';
import * as Tooltip from '@/components/Tooltip/Tooltip';
import { VisualizationStageFallback } from '@/components/VisualizationStage/VisualizationStage';
import { ExportDialog } from '@/features/export/ExportDialog';
import { MetadataPanel } from '@/features/metadata/MetadataPanel';
import { MixerPanel } from '@/features/mixer/MixerPanel';
import { useAppStore } from '@/store/store';
import { isMacPlatform } from '@/utils/platform';

const IS_MAC = isMacPlatform();

import styles from './PlayerView.module.css';
import { WaveformDisplay } from './WaveformDisplay';

const LazyVisualizationStage = lazy(() =>
  import('../../components/VisualizationStage/VisualizationStage').then(
    (mod) => ({ default: mod.VisualizationStage }),
  ),
);

// ── Component ─────────────────────────────────────────────────────────

export function PlayerView() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Store selectors ───────────────────────────────────────────────
  const metadata = useAppStore((s) => s.metadata);
  const loadFile = useAppStore((s) => s.loadFile);

  // ── Export dialog state (lifted to store for keyboard shortcut access) ──
  const isExportOpen = useAppStore((s) => s.isExportDialogOpen);
  const setIsExportOpen = useAppStore((s) => s.setIsExportDialogOpen);

  // ── Derived values ────────────────────────────────────────────────
  const hasTrack = metadata !== null;

  // ── File handling ─────────────────────────────────────────────────
  const handleOpenFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      for (const file of Array.from(files)) {
        loadFile(file);
      }
      e.target.value = '';
    },
    [loadFile],
  );

  // ── Render ────────────────────────────────────────────────────────

  if (!hasTrack) {
    return (
      <div className={styles.playerView}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".spc"
          multiple
          className="visually-hidden"
          onChange={handleFileChange}
          tabIndex={-1}
          aria-label="Select SPC files to open"
        />
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon} aria-hidden="true">
            🎮
          </span>
          <h2 className={styles.emptyHeading}>No track loaded</h2>
          <p className={styles.emptyDescription}>
            Drop an SPC file anywhere,
            <br />
            or click to browse:
          </p>
          <Button variant="primary" onClick={handleOpenFile}>
            Open SPC File
          </Button>
          <a
            href="https://en.wikipedia.org/wiki/SPC_(file_format)"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.emptyLink}
          >
            Learn more about SPC files →
          </a>
        </div>
        <ExportDialog open={isExportOpen} onOpenChange={setIsExportOpen} />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className={styles.playerView}>
      {/* Now Playing Info (empty / loading / track states) */}
      <NowPlayingInfo />

      {/* Visualization Stage */}
      {hasTrack && (
        <Suspense fallback={<VisualizationStageFallback />}>
          <LazyVisualizationStage />
        </Suspense>
      )}

      {/* Waveform Visualization */}
      {hasTrack && <WaveformDisplay />}

      {/* Metadata Panel */}
      {hasTrack && (
        <CollapsiblePanel title="Track Info">
          <MetadataPanel />
        </CollapsiblePanel>
      )}

      {/* Mixer Panel */}
      {hasTrack && (
        <CollapsiblePanel title="Channel Mixer" defaultOpen>
          <MixerPanel />
        </CollapsiblePanel>
      )}

      {/* Export */}
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <Button
            variant="secondary"
            onClick={() => setIsExportOpen(true)}
            disabled={!hasTrack}
          >
            Export
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content>Export ({IS_MAC ? '⌘E' : 'Ctrl+E'})</Tooltip.Content>
      </Tooltip.Root>
      <ExportDialog open={isExportOpen} onOpenChange={setIsExportOpen} />
    </div>
  );
}
