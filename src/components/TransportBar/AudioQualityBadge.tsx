import { Popover } from 'radix-ui';
import { useEffect, useRef, useState } from 'react';

import { audioStateBuffer } from '@/audio/audio-state-buffer';
import { audioEngine } from '@/audio/engine';

import styles from './AudioQualityBadge.module.css';

// ── Constants ─────────────────────────────────────────────────────────

const DSP_NATIVE_RATE = 32_000;
const UPDATE_INTERVAL_MS = 250;

// ── Types ─────────────────────────────────────────────────────────────

interface ChainSnapshot {
  sampleRate: number;
  baseLatencyMs: number;
  outputLatencyMs: number;
  totalLatencyMs: number;
  processLoadPercent: number;
  totalUnderruns: number;
}

function getLoadStatus(percent: number): {
  className: string;
  statusClassName: string;
  label: string;
} {
  if (percent >= 80) {
    return {
      className: styles.loadCritical,
      statusClassName: styles.statusCritical,
      label: 'Critical',
    };
  }
  if (percent >= 50) {
    return {
      className: styles.loadModerate,
      statusClassName: styles.statusModerate,
      label: 'Elevated',
    };
  }
  return {
    className: styles.loadHealthy,
    statusClassName: styles.statusHealthy,
    label: 'Normal',
  };
}

function formatRate(hz: number): string {
  return hz >= 1000 ? `${Math.round(hz / 1000)}kHz` : `${hz}Hz`;
}

// ── Component ─────────────────────────────────────────────────────────

export function AudioQualityBadge() {
  const [snapshot, setSnapshot] = useState<ChainSnapshot>({
    sampleRate: 0,
    baseLatencyMs: 0,
    outputLatencyMs: 0,
    totalLatencyMs: 0,
    processLoadPercent: 0,
    totalUnderruns: 0,
  });
  const rafRef = useRef(0);
  const lastUpdateRef = useRef(0);
  const loadBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function tick() {
      const now = performance.now();
      if (now - lastUpdateRef.current >= UPDATE_INTERVAL_MS) {
        lastUpdateRef.current = now;

        const info = audioEngine.getAudioChainInfo();
        setSnapshot({
          sampleRate: info.sampleRate,
          baseLatencyMs: info.baseLatencyMs,
          outputLatencyMs: info.outputLatencyMs,
          totalLatencyMs: info.baseLatencyMs + info.outputLatencyMs,
          processLoadPercent: audioStateBuffer.processLoadPercent,
          totalUnderruns: audioStateBuffer.totalUnderruns,
        });

        if (loadBarRef.current) {
          const pct = Math.min(
            100,
            Math.round(audioStateBuffer.processLoadPercent),
          );
          loadBarRef.current.style.width = `${pct}%`;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const loadPercent = Math.min(100, Math.round(snapshot.processLoadPercent));
  const loadStatus = getLoadStatus(loadPercent);
  const hasWarning = loadPercent >= 50 || snapshot.totalUnderruns > 0;

  const displayRate =
    snapshot.sampleRate > 0 ? formatRate(snapshot.sampleRate) : '—';

  const triggerClassName = [styles.trigger, hasWarning && styles.triggerWarning]
    .filter(Boolean)
    .join(' ');

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          className={triggerClassName}
          aria-label={`Audio quality: ${displayRate}${hasWarning ? ', warning' : ''}`}
        >
          {hasWarning && (
            <span className={styles.warningDot} aria-hidden="true" />
          )}
          {displayRate}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={styles.popoverContent}
          side="top"
          sideOffset={8}
          align="center"
        >
          <Popover.Arrow className={styles.popoverArrow} />

          <div className={styles.section}>
            <div className={styles.sectionLabel}>Signal Path</div>
            <dl className={styles.dataList}>
              <dt className={styles.label}>DSP Output</dt>
              <dd className={styles.value}>
                {DSP_NATIVE_RATE.toLocaleString()} Hz
              </dd>

              <dt className={styles.label}>Audio Context</dt>
              <dd className={styles.value}>
                {snapshot.sampleRate > 0
                  ? `${snapshot.sampleRate.toLocaleString()} Hz`
                  : 'N/A'}
              </dd>
            </dl>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionLabel}>Latency</div>
            <dl className={styles.dataList}>
              <dt className={styles.label}>Processing</dt>
              <dd className={styles.value}>
                {snapshot.baseLatencyMs > 0
                  ? `${snapshot.baseLatencyMs.toFixed(1)} ms`
                  : 'N/A'}
              </dd>

              <dt className={styles.label}>Output</dt>
              <dd className={styles.value}>
                {snapshot.outputLatencyMs > 0
                  ? `${snapshot.outputLatencyMs.toFixed(1)} ms`
                  : 'N/A'}
              </dd>

              <dt className={styles.label}>Total</dt>
              <dd className={styles.value}>
                {snapshot.totalLatencyMs > 0
                  ? `${snapshot.totalLatencyMs.toFixed(1)} ms`
                  : 'N/A'}
              </dd>
            </dl>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionLabel}>Performance</div>
            <dl className={styles.dataList}>
              <dt className={styles.label}>Worklet Load</dt>
              <dd className={styles.value}>
                <div className={styles.loadBar}>
                  <div className={styles.loadBarTrack}>
                    <div
                      ref={loadBarRef}
                      className={`${styles.loadBarFill} ${loadStatus.className}`}
                    />
                  </div>
                  <span className={styles.loadPercent}>{loadPercent}%</span>
                  <span
                    className={`${styles.statusText} ${loadStatus.statusClassName}`}
                  >
                    {loadStatus.label}
                  </span>
                </div>
              </dd>

              <dt className={styles.label}>Buffer Underruns</dt>
              <dd className={styles.value}>{snapshot.totalUnderruns}</dd>
            </dl>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
