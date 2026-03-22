import { useEffect, useRef } from 'react';

import type { VoiceStateSnapshot } from '@/audio/audio-state-buffer';
import { audioStateBuffer } from '@/audio/audio-state-buffer';

import styles from './VoiceStatePanel.module.css';

// ── Constants ─────────────────────────────────────────────────────────

const VOICE_COUNT = 8;
const ARIA_THROTTLE_MS = 250;

const VOICE_COLOR_VARS = [
  '--spc-color-voice-0',
  '--spc-color-voice-1',
  '--spc-color-voice-2',
  '--spc-color-voice-3',
  '--spc-color-voice-4',
  '--spc-color-voice-5',
  '--spc-color-voice-6',
  '--spc-color-voice-7',
] as const;

// ── Types ─────────────────────────────────────────────────────────────

export interface VoiceStatePanelProps {
  isHex: boolean;
  format: (value: number, padLength?: number) => string;
}

// ── Helpers ───────────────────────────────────────────────────────────

function formatPitch(pitch: number, isHex: boolean): string {
  if (isHex) {
    return '$' + (pitch & 0x3fff).toString(16).toUpperCase().padStart(4, '0');
  }
  return String(pitch & 0x3fff);
}

function buildSummary(voice: VoiceStateSnapshot, isHex: boolean): string {
  const parts = [
    `Voice ${voice.index}:`,
    `${voice.envelopePhase} phase`,
    `envelope ${voice.envelopeLevel}`,
    `pitch ${formatPitch(voice.pitch, isHex)}`,
    `sample ${voice.sampleSource}`,
    `key ${voice.keyOn ? 'on' : 'off'}`,
  ];
  return parts.join(', ');
}

// ── Component ─────────────────────────────────────────────────────────

export function VoiceStatePanel({ isHex, format }: VoiceStatePanelProps) {
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const phaseRefs = useRef<(HTMLElement | null)[]>([]);
  const envRefs = useRef<(HTMLElement | null)[]>([]);
  const pitchRefs = useRef<(HTMLElement | null)[]>([]);
  const sampleRefs = useRef<(HTMLElement | null)[]>([]);
  const keyRefs = useRef<(HTMLElement | null)[]>([]);
  const summaryRefs = useRef<(HTMLElement | null)[]>([]);
  const rafRef = useRef(0);
  const lastAriaUpdate = useRef(0);
  const generationRef = useRef(0);

  useEffect(() => {
    function tick() {
      const now = performance.now();
      const gen = audioStateBuffer.generation;

      if (gen !== generationRef.current) {
        generationRef.current = gen;

        for (let i = 0; i < VOICE_COUNT; i++) {
          const voice = audioStateBuffer.voices[i];
          if (!voice) continue;

          // Visual updates — every qualifying frame
          const phaseEl = phaseRefs.current[i];
          if (phaseEl) {
            phaseEl.textContent = voice.envelopePhase;
            phaseEl.dataset.phase = voice.envelopePhase;
          }

          const envEl = envRefs.current[i];
          if (envEl) {
            envEl.textContent = String(voice.envelopeLevel);
          }

          const pitchEl = pitchRefs.current[i];
          if (pitchEl) {
            pitchEl.textContent = formatPitch(voice.pitch, isHex);
          }

          const sampleEl = sampleRefs.current[i];
          if (sampleEl) {
            sampleEl.textContent = String(voice.sampleSource);
          }

          const keyEl = keyRefs.current[i];
          if (keyEl) {
            keyEl.textContent = voice.keyOn ? 'on' : 'off';
          }

          // Card active/inactive state
          const card = cardRefs.current[i];
          if (card) {
            if (voice.active) {
              card.classList.remove(styles.inactive);
            } else {
              card.classList.add(styles.inactive);
            }
          }
        }

        // ARIA summary — throttled
        if (now - lastAriaUpdate.current >= ARIA_THROTTLE_MS) {
          lastAriaUpdate.current = now;
          for (let i = 0; i < VOICE_COUNT; i++) {
            const voice = audioStateBuffer.voices[i];
            const summaryEl = summaryRefs.current[i];
            if (voice && summaryEl) {
              summaryEl.textContent = buildSummary(voice, isHex);
            }
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isHex, format]);

  return (
    <section aria-label="Voice states">
      <div role="list" aria-label="DSP voices" className={styles.container}>
        {Array.from({ length: VOICE_COUNT }, (_, i) => {
          const voice = audioStateBuffer.voices[i];
          const colorVar = VOICE_COLOR_VARS[i];

          return (
            <div
              key={i}
              role="listitem"
              aria-label={`Voice ${i}`}
              className={`${styles.voiceCard}${voice && !voice.active ? ` ${styles.inactive}` : ''}`}
              {...({ style: { '--voice-color': `var(${colorVar})` } } as Record<
                string,
                unknown
              >)}
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
            >
              <div className={styles.voiceHeader}>
                <h3 className={styles.voiceName}>Voice {i}</h3>
                <span
                  className={styles.phaseIndicator}
                  data-phase={voice?.envelopePhase ?? 'silent'}
                  ref={(el) => {
                    phaseRefs.current[i] = el;
                  }}
                >
                  {voice?.envelopePhase ?? 'silent'}
                </span>
              </div>

              <dl className={styles.dataList}>
                <dt className={styles.dtLabel}>Envelope</dt>
                <dd
                  className={styles.ddValue}
                  ref={(el) => {
                    envRefs.current[i] = el;
                  }}
                >
                  {voice?.envelopeLevel ?? 0}
                </dd>

                <dt className={styles.dtLabel}>Pitch</dt>
                <dd
                  className={styles.ddValue}
                  ref={(el) => {
                    pitchRefs.current[i] = el;
                  }}
                >
                  {formatPitch(voice?.pitch ?? 0, isHex)}
                </dd>

                <dt className={styles.dtLabel}>Sample</dt>
                <dd
                  className={styles.ddValue}
                  ref={(el) => {
                    sampleRefs.current[i] = el;
                  }}
                >
                  {voice?.sampleSource ?? 0}
                </dd>

                <dt className={styles.dtLabel}>Key</dt>
                <dd
                  className={styles.ddValue}
                  ref={(el) => {
                    keyRefs.current[i] = el;
                  }}
                >
                  {voice?.keyOn ? 'on' : 'off'}
                </dd>
              </dl>

              <span
                className={styles.visuallyHidden}
                ref={(el) => {
                  summaryRefs.current[i] = el;
                }}
              >
                {buildSummary(
                  voice ?? {
                    index: i,
                    envelopePhase: 'silent',
                    envelopeLevel: 0,
                    pitch: 0,
                    sampleSource: 0,
                    keyOn: false,
                    active: false,
                  },
                  isHex,
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
