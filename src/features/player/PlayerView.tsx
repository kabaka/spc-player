import { useAppStore } from '@/store/store';
import { Button } from '@/components/Button/Button';
import { NowPlayingInfo } from '@/components/NowPlayingInfo/NowPlayingInfo';
import { MetadataPanel } from '@/features/metadata/MetadataPanel';
import { MixerPanel } from '@/features/mixer/MixerPanel';
import { ExportDialog } from '@/features/export/ExportDialog';
import { CollapsiblePanel } from '@/components/CollapsiblePanel/CollapsiblePanel';
import { WaveformDisplay } from './WaveformDisplay';

import styles from './PlayerView.module.css';

// ── Component ─────────────────────────────────────────────────────────

export function PlayerView() {
  // ── Store selectors ───────────────────────────────────────────────
  const metadata = useAppStore((s) => s.metadata);

  // ── Export dialog state (lifted to store for keyboard shortcut access) ──
  const isExportOpen = useAppStore((s) => s.isExportDialogOpen);
  const setIsExportOpen = useAppStore((s) => s.setIsExportDialogOpen);

  // ── Derived values ────────────────────────────────────────────────
  const hasTrack = metadata !== null;

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className={styles.playerView}>
      {/* Now Playing Info (empty / loading / track states) */}
      <NowPlayingInfo />

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
      <Button
        variant="secondary"
        onClick={() => setIsExportOpen(true)}
        disabled={!hasTrack}
      >
        Export
      </Button>
      <ExportDialog open={isExportOpen} onOpenChange={setIsExportOpen} />
    </div>
  );
}
