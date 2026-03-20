import { useCallback, useEffect, useId, useRef } from 'react';

import { Label } from '@/components/Label/Label';
import { Slider } from '@/components/Slider/Slider';

import styles from './AdsrDisplay.module.css';

export interface AdsrDisplayProps {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  currentPhase?: 'attack' | 'decay' | 'sustain' | 'release' | 'silent';
  onAttackChange?: (value: number) => void;
  onDecayChange?: (value: number) => void;
  onSustainChange?: (value: number) => void;
  onReleaseChange?: (value: number) => void;
}

// SPC700 ADSR timing approximations for visualization
const ATTACK_TIMES = [
  4.1, 2.5, 1.5, 1.0, 0.64, 0.38, 0.26, 0.16, 0.096, 0.064, 0.04, 0.024, 0.016,
  0.01, 0.006, 0.0,
];
const DECAY_TIMES = [1.2, 0.74, 0.44, 0.29, 0.18, 0.11, 0.074, 0.037];
const SUSTAIN_LEVELS = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1.0];
const RELEASE_TIMES = [
  Infinity,
  38.0,
  28.0,
  24.0,
  19.0,
  14.0,
  12.0,
  9.4,
  7.1,
  5.9,
  4.7,
  3.5,
  2.9,
  2.4,
  1.8,
  1.5,
  1.2,
  0.89,
  0.74,
  0.59,
  0.44,
  0.37,
  0.29,
  0.22,
  0.18,
  0.15,
  0.11,
  0.092,
  0.074,
  0.055,
  0.037,
  0.018,
];

function drawEnvelope(
  canvas: HTMLCanvasElement,
  attack: number,
  decay: number,
  sustain: number,
  release: number,
  currentPhase?: string,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const padding = 4;
  const drawW = w - padding * 2;
  const drawH = h - padding * 2;

  ctx.clearRect(0, 0, w, h);

  // Compute segment widths based on timing
  const attackTime = ATTACK_TIMES[Math.min(attack, 15)] ?? 0;
  const decayTime = DECAY_TIMES[Math.min(decay, 7)] ?? 0;
  const sustainLevel = SUSTAIN_LEVELS[Math.min(sustain, 7)] ?? 0;
  const releaseTime = RELEASE_TIMES[Math.min(release, 31)] ?? 0;

  const totalTime = attackTime + decayTime + Math.min(releaseTime, 2.0) + 0.5;
  const scale = drawW / totalTime;

  const attackW = attackTime * scale;
  const decayW = decayTime * scale;
  const sustainW = 0.5 * scale;
  const releaseW = Math.min(releaseTime, 2.0) * scale;

  // Colors
  const accentColor =
    getComputedStyle(canvas).getPropertyValue('--spc-color-accent').trim() ||
    '#8b5cf6';
  const subtleColor =
    getComputedStyle(canvas)
      .getPropertyValue('--spc-color-accent-subtle')
      .trim() || 'rgba(139, 92, 246, 0.15)';

  // Draw filled envelope shape
  ctx.beginPath();
  ctx.moveTo(padding, padding + drawH);

  // Attack: 0 → 1
  ctx.lineTo(padding + attackW, padding);

  // Decay: 1 → sustain level
  ctx.lineTo(padding + attackW + decayW, padding + drawH * (1 - sustainLevel));

  // Sustain hold
  ctx.lineTo(
    padding + attackW + decayW + sustainW,
    padding + drawH * (1 - sustainLevel),
  );

  // Release: sustain → 0
  ctx.lineTo(padding + attackW + decayW + sustainW + releaseW, padding + drawH);

  ctx.closePath();
  ctx.fillStyle = subtleColor;
  ctx.fill();

  // Draw envelope line
  ctx.beginPath();
  ctx.moveTo(padding, padding + drawH);
  ctx.lineTo(padding + attackW, padding);
  ctx.lineTo(padding + attackW + decayW, padding + drawH * (1 - sustainLevel));
  ctx.lineTo(
    padding + attackW + decayW + sustainW,
    padding + drawH * (1 - sustainLevel),
  );
  ctx.lineTo(padding + attackW + decayW + sustainW + releaseW, padding + drawH);
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Phase highlight
  if (currentPhase && currentPhase !== 'silent') {
    ctx.fillStyle = accentColor;
    ctx.globalAlpha = 0.3;

    let x = padding;
    let segW = 0;

    switch (currentPhase) {
      case 'attack':
        segW = attackW;
        break;
      case 'decay':
        x = padding + attackW;
        segW = decayW;
        break;
      case 'sustain':
        x = padding + attackW + decayW;
        segW = sustainW;
        break;
      case 'release':
        x = padding + attackW + decayW + sustainW;
        segW = releaseW;
        break;
    }

    ctx.fillRect(x, padding, segW, drawH);
    ctx.globalAlpha = 1.0;
  }
}

// Accessibility: This component draws a static ADSR envelope curve that only
// redraws when props change (no rAF loop). No prefers-reduced-motion handling
// is needed because there is no continuous animation to suppress.
export function AdsrDisplay({
  attack,
  decay,
  sustain,
  release,
  currentPhase,
  onAttackChange,
  onDecayChange,
  onSustainChange,
  onReleaseChange,
}: AdsrDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const attackId = useId();
  const decayId = useId();
  const sustainId = useId();
  const releaseId = useId();

  const isReadOnly =
    !onAttackChange && !onDecayChange && !onSustainChange && !onReleaseChange;

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      drawEnvelope(canvas, attack, decay, sustain, release, currentPhase);
    }
  }, [attack, decay, sustain, release, currentPhase]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  return (
    <div className={styles.container}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        width={320}
        height={120}
        aria-hidden="true"
      />

      {currentPhase && currentPhase !== 'silent' && (
        <span className={styles.phaseIndicator}>
          {currentPhase.charAt(0).toUpperCase() + currentPhase.slice(1)}
        </span>
      )}

      <div className={styles.sliders}>
        <div className={styles.sliderGroup}>
          <Label htmlFor={attackId}>Attack</Label>
          <Slider
            value={[attack]}
            onValueChange={([v]) => onAttackChange?.(v)}
            min={0}
            max={15}
            step={1}
            disabled={isReadOnly}
            aria-label="Attack rate"
            aria-labelledby={attackId}
          />
          <span className={styles.value} aria-hidden="true">
            {attack}
          </span>
        </div>

        <div className={styles.sliderGroup}>
          <Label htmlFor={decayId}>Decay</Label>
          <Slider
            value={[decay]}
            onValueChange={([v]) => onDecayChange?.(v)}
            min={0}
            max={7}
            step={1}
            disabled={isReadOnly}
            aria-label="Decay rate"
            aria-labelledby={decayId}
          />
          <span className={styles.value} aria-hidden="true">
            {decay}
          </span>
        </div>

        <div className={styles.sliderGroup}>
          <Label htmlFor={sustainId}>Sustain</Label>
          <Slider
            value={[sustain]}
            onValueChange={([v]) => onSustainChange?.(v)}
            min={0}
            max={7}
            step={1}
            disabled={isReadOnly}
            aria-label="Sustain level"
            aria-labelledby={sustainId}
          />
          <span className={styles.value} aria-hidden="true">
            {sustain}
          </span>
        </div>

        <div className={styles.sliderGroup}>
          <Label htmlFor={releaseId}>Release</Label>
          <Slider
            value={[release]}
            onValueChange={([v]) => onReleaseChange?.(v)}
            min={0}
            max={31}
            step={1}
            disabled={isReadOnly}
            aria-label="Release rate"
            aria-labelledby={releaseId}
          />
          <span className={styles.value} aria-hidden="true">
            {release}
          </span>
        </div>
      </div>
    </div>
  );
}
