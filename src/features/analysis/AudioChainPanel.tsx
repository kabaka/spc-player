import { useEffect, useRef, useState } from 'react';

import { audioStateBuffer } from '@/audio/audio-state-buffer';
import { audioEngine } from '@/audio/engine';

import styles from './AudioChainPanel.module.css';

// ── Constants ─────────────────────────────────────────────────────────

const DSP_NATIVE_RATE = 32_000;
const UPDATE_INTERVAL_MS = 250; // ~4 Hz for non-visual metrics

// ── Types ─────────────────────────────────────────────────────────────

interface ChainSnapshot {
  sampleRate: number;
  baseLatencyMs: number;
  outputLatencyMs: number;
  totalLatencyMs: number;
  processLoadPercent: number;
  totalUnderruns: number;
}

// ── Component ─────────────────────────────────────────────────────────

export function AudioChainPanel() {
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

        // Update load bar width via ref (avoids inline style lint rule).
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
  const loadClass =
    loadPercent >= 80
      ? styles.loadCritical
      : loadPercent >= 50
        ? styles.loadModerate
        : styles.loadHealthy;

  return (
    <section aria-label="Audio chain diagnostics" className={styles.container}>
      <h3 className={styles.title}>Audio Chain</h3>

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
                  className={`${styles.loadBarFill} ${loadClass}`}
                />
              </div>
              <span className={styles.loadPercent}>{loadPercent}%</span>
            </div>
          </dd>

          <dt className={styles.label}>Buffer Underruns</dt>
          <dd className={styles.value}>{snapshot.totalUnderruns}</dd>
        </dl>
      </div>

      <p className={styles.note}>
        Browser audio uses shared mode. Exclusive/ASIO mode is not available.
      </p>
    </section>
  );
}
