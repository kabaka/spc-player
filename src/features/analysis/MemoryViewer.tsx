import { useCallback, useEffect, useRef, useState } from 'react';

import { audioStateBuffer } from '@/audio/audio-state-buffer';

import styles from './MemoryViewer.module.css';

// ── Constants ─────────────────────────────────────────────────────────

const BYTES_PER_ROW = 16;
const TOTAL_ROWS = 4096; // 64 KB / 16
const ROW_HEIGHT = 20; // px, matches xs font + padding
const OVERSCAN = 5;
const _TOTAL_HEIGHT = TOTAL_ROWS * ROW_HEIGHT;

const HEX_COLUMNS = Array.from({ length: BYTES_PER_ROW }, (_, i) =>
  i.toString(16).toUpperCase().padStart(2, '0'),
);

// ── Types ─────────────────────────────────────────────────────────────

export interface MemoryViewerProps {
  isHex: boolean;
  format: (value: number, padLength?: number) => string;
}

// ── Helpers ───────────────────────────────────────────────────────────

function formatByte(value: number, isHex: boolean): string {
  if (isHex) {
    return (value & 0xff).toString(16).toUpperCase().padStart(2, '0');
  }
  return String(value & 0xff).padStart(3, ' ');
}

function toAscii(value: number): string {
  return value >= 0x20 && value <= 0x7e ? String.fromCharCode(value) : '.';
}

function formatAddress(row: number): string {
  return (
    '$' + (row * BYTES_PER_ROW).toString(16).toUpperCase().padStart(4, '0')
  );
}

// ── Memory data source ───────────────────────────────────────────────

/** Placeholder 64 KB buffer. In a real implementation this would
 *  be populated from the loaded SPC file or live telemetry. */
let memoryData: Uint8Array<ArrayBufferLike> = new Uint8Array(65536);

/** Update the memory data from external source. */
export function setMemoryData(data: Uint8Array): void {
  memoryData = data;
}

function readByte(offset: number): number {
  return memoryData[offset] ?? 0;
}

// ── Component ─────────────────────────────────────────────────────────

export function MemoryViewer({ isHex }: MemoryViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(400);
  const rafRef = useRef(0);
  const generationRef = useRef(0);

  // Track container height
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (el) {
      setScrollTop(el.scrollTop);
    }
  }, []);

  // rAF-based re-render when audio state changes
  useEffect(() => {
    function tick() {
      if (audioStateBuffer.generation !== generationRef.current) {
        generationRef.current = audioStateBuffer.generation;
        // Force re-render by updating scroll position (triggers visible row recalc)
        const el = containerRef.current;
        if (el) {
          setScrollTop(el.scrollTop);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Calculate visible range
  const startRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(containerHeight / ROW_HEIGHT) + OVERSCAN * 2;
  const endRow = Math.min(TOTAL_ROWS, startRow + visibleCount);
  const topPadding = startRow * ROW_HEIGHT;
  const bottomPadding = (TOTAL_ROWS - endRow) * ROW_HEIGHT;

  const rows: number[] = [];
  for (let r = startRow; r < endRow; r++) {
    rows.push(r);
  }

  return (
    <section aria-label="SPC memory dump">
      <div
        ref={containerRef}
        className={styles.container}
        onScroll={handleScroll}
      >
        <table
          aria-label="Memory contents"
          role="grid"
          className={styles.table}
        >
          <thead className={styles.thead}>
            <tr>
              <th scope="col" role="columnheader" className={styles.addressCol}>
                Offset
              </th>
              {HEX_COLUMNS.map((col) => (
                <th scope="col" role="columnheader" key={col}>
                  {col}
                </th>
              ))}
              <th scope="col" role="columnheader" className={styles.asciiCol}>
                ASCII
              </th>
            </tr>
          </thead>
          <tbody>
            {topPadding > 0 && (
              <tr aria-hidden="true">
                <td
                  colSpan={BYTES_PER_ROW + 2}
                  className={styles.spacer}
                  ref={(el) => {
                    if (el) el.style.height = `${topPadding}px`;
                  }}
                />
              </tr>
            )}
            {rows.map((rowIndex) => {
              const baseAddr = rowIndex * BYTES_PER_ROW;
              const bytes: number[] = [];
              let ascii = '';
              for (let c = 0; c < BYTES_PER_ROW; c++) {
                const b = readByte(baseAddr + c);
                bytes.push(b);
                ascii += toAscii(b);
              }

              return (
                <tr key={rowIndex} role="row">
                  <td role="gridcell" className={styles.addressCell}>
                    {formatAddress(rowIndex)}
                  </td>
                  {bytes.map((b, i) => (
                    <td role="gridcell" className={styles.dataCell} key={i}>
                      {formatByte(b, isHex)}
                    </td>
                  ))}
                  <td role="gridcell" className={styles.asciiCell}>
                    {ascii}
                  </td>
                </tr>
              );
            })}
            {bottomPadding > 0 && (
              <tr aria-hidden="true">
                <td
                  colSpan={BYTES_PER_ROW + 2}
                  className={styles.spacer}
                  ref={(el) => {
                    if (el) el.style.height = `${bottomPadding}px`;
                  }}
                />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
