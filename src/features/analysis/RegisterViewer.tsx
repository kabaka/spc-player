import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { Button } from '@/components/Button/Button';
import { audioStateBuffer } from '@/audio/audio-state-buffer';

import styles from './RegisterViewer.module.css';

// ── Constants ─────────────────────────────────────────────────────────

const REGISTER_COUNT = 128;
const ARIA_THROTTLE_MS = 250;

// Standard S-DSP register names, indexed 0x00–0x7F.
// Per-voice registers repeat for voices 0–7 at $x0–$x9.
// Global registers at $xC–$xD, FIR coefficients at $xF.
const DSP_REGISTER_NAMES: readonly string[] = (() => {
  const names: string[] = new Array(REGISTER_COUNT).fill('—');

  const voiceRegNames = [
    'VOL (L)', // $x0
    'VOL (R)', // $x1
    'PITCH (L)', // $x2
    'PITCH (H)', // $x3
    'SRCN', // $x4
    'ADSR (1)', // $x5
    'ADSR (2)', // $x6
    'GAIN', // $x7
    'ENVX', // $x8
    'OUTX', // $x9
  ];

  for (let v = 0; v < 8; v++) {
    const base = v * 0x10;
    for (let r = 0; r < voiceRegNames.length; r++) {
      names[base + r] = `V${v} ${voiceRegNames[r]}`;
    }
  }

  // Global registers
  names[0x0c] = 'MVOLL';
  names[0x1c] = 'MVOLR';
  names[0x2c] = 'EVOLL';
  names[0x3c] = 'EVOLR';
  names[0x4c] = 'KON';
  names[0x5c] = 'KOFF';
  names[0x6c] = 'FLG';
  names[0x7c] = 'ENDX';

  names[0x0d] = 'EFB';
  names[0x2d] = 'PMON';
  names[0x3d] = 'NON';
  names[0x4d] = 'EON';
  names[0x5d] = 'DIR';
  names[0x6d] = 'ESA';
  names[0x7d] = 'EDL';

  // FIR coefficients
  for (let i = 0; i < 8; i++) {
    names[i * 0x10 + 0x0f] = `FIR ${i}`;
  }

  // Unused voice-bank registers ($xA, $xB, $xE for voices)
  for (let v = 0; v < 8; v++) {
    const base = v * 0x10;
    if (names[base + 0x0a] === '—') names[base + 0x0a] = `V${v} (unused)`;
    if (names[base + 0x0b] === '—') names[base + 0x0b] = `V${v} (unused)`;
    if (names[base + 0x0e] === '—') names[base + 0x0e] = `V${v} (unused)`;
  }

  // Global unused
  if (names[0x1d] === '—') names[0x1d] = '(unused)';

  return names;
})();

// Group boundaries for display
interface RegisterGroup {
  readonly label: string;
  readonly startIndex: number;
  readonly endIndex: number;
}

const REGISTER_GROUPS: readonly RegisterGroup[] = [
  ...Array.from({ length: 8 }, (_, v) => ({
    label: `Voice ${v}`,
    startIndex: v * 0x10,
    endIndex: v * 0x10 + 0x0a, // $x0–$x9
  })),
  { label: 'Global', startIndex: -1, endIndex: -1 }, // sentinel for global regs
];

const GLOBAL_REGISTERS = [
  0x0c, 0x1c, 0x2c, 0x3c, 0x4c, 0x5c, 0x6c, 0x7c, 0x0d, 0x1d, 0x2d, 0x3d, 0x4d,
  0x5d, 0x6d, 0x7d, 0x0f, 0x1f, 0x2f, 0x3f, 0x4f, 0x5f, 0x6f, 0x7f,
];

// ── Types ─────────────────────────────────────────────────────────────

export interface RegisterViewerProps {
  isHex: boolean;
  format: (value: number, padLength?: number) => string;
}

// ── Data source ───────────────────────────────────────────────────────

/** Placeholder DSP register data. Updated from telemetry in production. */
let dspRegisterData: Uint8Array<ArrayBufferLike> = new Uint8Array(
  REGISTER_COUNT,
);

export function setDspRegisterData(data: Uint8Array): void {
  dspRegisterData = data;
}

function readRegister(index: number): number {
  return dspRegisterData[index] ?? 0;
}

// ── Component ─────────────────────────────────────────────────────────

export function RegisterViewer({
  isHex,
  format: _format,
}: RegisterViewerProps) {
  const [isFrozen, setIsFrozen] = useState(false);
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const rafRef = useRef(0);
  const lastAriaUpdate = useRef(0);
  const generationRef = useRef(0);
  const freezeStatusId = useId();

  const toggleFreeze = useCallback(() => {
    setIsFrozen((prev) => !prev);
  }, []);

  // rAF-based update loop for direct DOM writes
  useEffect(() => {
    const tbody = tbodyRef.current;
    if (!tbody) return;

    function tick() {
      if (isFrozen) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const now = performance.now();
      const gen = audioStateBuffer.generation;

      if (
        gen !== generationRef.current &&
        now - lastAriaUpdate.current >= ARIA_THROTTLE_MS
      ) {
        generationRef.current = gen;
        lastAriaUpdate.current = now;

        // Update all value cells via direct DOM access
        const rows = tbody?.querySelectorAll<HTMLElement>('[data-reg-value]');
        if (rows) {
          rows.forEach((cell) => {
            const regIdx = Number(cell.dataset.regIdx);
            const val = readRegister(regIdx);
            const text = isHex
              ? (val & 0xff).toString(16).toUpperCase().padStart(2, '0')
              : String(val & 0xff);
            if (cell.textContent !== text) {
              cell.textContent = text;
            }
          });
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isFrozen, isHex]);

  const formatAddr = (idx: number) =>
    '$' + idx.toString(16).toUpperCase().padStart(2, '0');

  const formatValue = (val: number) =>
    isHex
      ? (val & 0xff).toString(16).toUpperCase().padStart(2, '0')
      : String(val & 0xff);

  return (
    <section aria-label="DSP registers" className={styles.container}>
      <div className={styles.controls}>
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={isFrozen}
          aria-label="Freeze register values"
          onClick={toggleFreeze}
        >
          {isFrozen ? 'Frozen' : 'Live'}
        </Button>
        <span
          aria-live="polite"
          className={styles.visuallyHidden}
          id={freezeStatusId}
        >
          {isFrozen ? 'Register display frozen' : 'Register display live'}
        </span>
      </div>

      <div className={isFrozen ? styles.frozen : undefined}>
        <table aria-label="DSP registers" className={styles.table}>
          <caption className={styles.visuallyHidden}>
            S-DSP register values. Values update during playback.
          </caption>
          <thead>
            <tr>
              <th scope="col">Address</th>
              <th scope="col">Name</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody ref={tbodyRef}>
            {REGISTER_GROUPS.map((group) => {
              if (group.label === 'Global') {
                return (
                  <RegisterGroupRows
                    key="global"
                    label="Global"
                    indices={GLOBAL_REGISTERS}
                    formatAddr={formatAddr}
                    formatValue={formatValue}
                  />
                );
              }

              const indices: number[] = [];
              for (let i = group.startIndex; i < group.endIndex; i++) {
                indices.push(i);
              }

              return (
                <RegisterGroupRows
                  key={group.label}
                  label={group.label}
                  indices={indices}
                  formatAddr={formatAddr}
                  formatValue={formatValue}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Sub-component for register group ──────────────────────────────────

function RegisterGroupRows({
  label,
  indices,
  formatAddr,
  formatValue,
}: {
  label: string;
  indices: readonly number[];
  formatAddr: (idx: number) => string;
  formatValue: (val: number) => string;
}) {
  return (
    <>
      <tr>
        <td colSpan={3} className={styles.groupHeader}>
          {label}
        </td>
      </tr>
      {indices.map((regIdx) => {
        const nameId = `reg-name-${regIdx}`;
        return (
          <tr key={regIdx}>
            <td className={styles.addressCell}>{formatAddr(regIdx)}</td>
            <td className={styles.nameCell} id={nameId}>
              {DSP_REGISTER_NAMES[regIdx]}
            </td>
            <td
              className={styles.valueCell}
              aria-describedby={nameId}
              data-reg-value=""
              data-reg-idx={regIdx}
            >
              {formatValue(readRegister(regIdx))}
            </td>
          </tr>
        );
      })}
    </>
  );
}
