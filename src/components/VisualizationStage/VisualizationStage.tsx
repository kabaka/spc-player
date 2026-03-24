import { useCallback, useEffect, useRef } from 'react';

import { audioStateBuffer } from '@/audio/audio-state-buffer';
import { audioEngine } from '@/audio/engine';
import { useAppStore } from '@/store/store';
import type { VisualizationMode } from '@/store/types';

import { CoverArtRenderer } from './renderers/CoverArtRenderer';
import { PianoRollRenderer } from './renderers/PianoRollRenderer';
import { SpectrumRenderer } from './renderers/SpectrumRenderer';
import { StereoFieldRenderer } from './renderers/StereoFieldRenderer';
import { VoiceTimelineRenderer } from './renderers/VoiceTimelineRenderer';
import type { AudioVisualizationData, VisualizationRenderer } from './types';
import styles from './VisualizationStage.module.css';

// ── Constants ─────────────────────────────────────────────────────────

const TABS: { mode: VisualizationMode; label: string }[] = [
  { mode: 'piano-roll', label: 'Piano Roll' },
  { mode: 'spectrum', label: 'Spectrum' },
  { mode: 'stereo-field', label: 'Stereo Field' },
  { mode: 'cover-art', label: 'Cover Art' },
  { mode: 'voice-timeline', label: 'Voice Timeline' },
];

const MOBILE_BREAKPOINT = 768;
const MAX_MOBILE_DPR = 2;
const REDUCED_MOTION_INTERVAL_MS = 250;
const FRAME_BUDGET_MS = 6;
const FRAME_WARN_INTERVAL_MS = 5_000;

const ARIA_LABELS: Record<VisualizationMode, string> = {
  'piano-roll': 'Piano roll visualization showing active voices',
  spectrum: 'Frequency spectrum analyzer',
  'stereo-field': 'Stereo field visualization',
  'cover-art': 'Cover art display',
  'voice-timeline':
    'Voice timeline visualization showing activity of 8 audio voices over time',
};

// ── Renderer factory ──────────────────────────────────────────────────

function createRenderer(mode: VisualizationMode): VisualizationRenderer {
  // Placeholder renderers until Wave 3 adds the real implementations
  switch (mode) {
    case 'piano-roll':
      return new PianoRollRenderer();
    case 'spectrum':
      return new SpectrumRenderer();
    case 'stereo-field':
      return new StereoFieldRenderer();
    case 'cover-art':
      return new CoverArtRenderer();
    case 'voice-timeline':
      return new VoiceTimelineRenderer();
  }
}

// ── Canvas DPR helpers ────────────────────────────────────────────────

function getEffectiveDpr(): number {
  const dpr = window.devicePixelRatio || 1;
  if (window.innerWidth < MOBILE_BREAKPOINT) {
    return Math.min(dpr, MAX_MOBILE_DPR);
  }
  return dpr;
}

function resizeCanvasToContainer(
  canvas: HTMLCanvasElement,
  container: HTMLElement,
): { width: number; height: number; dpr: number } | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const dpr = getEffectiveDpr();
  const rect = container.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  const canvasW = Math.round(width * dpr);
  const canvasH = Math.round(height * dpr);

  if (canvas.width !== canvasW || canvas.height !== canvasH) {
    canvas.width = canvasW;
    canvas.height = canvasH;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  return { width, height, dpr };
}

// ── Component ─────────────────────────────────────────────────────────

export interface VisualizationStageProps {
  lockedMode?: VisualizationMode;
  className?: string;
}

export function VisualizationStage({
  lockedMode,
  className,
}: VisualizationStageProps) {
  const storeMode = useAppStore((s) => s.activeMode);
  const effectiveMode = lockedMode ?? storeMode;
  const showTabs = lockedMode === undefined;
  const setActiveMode = useAppStore((s) => s.setActiveMode);
  const gameTitle = useAppStore((s) => s.metadata?.gameTitle ?? null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<VisualizationRenderer | null>(null);
  const rafIdRef = useRef(0);
  const lastGenerationRef = useRef(-1);
  const lastTimestampRef = useRef(0);
  const lastDrawTimeRef = useRef(0);
  const frameCountRef = useRef(0);
  const isMobileRef = useRef(false);

  // ── Tab keyboard navigation ─────────────────────────────────────
  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      const currentIndex = TABS.findIndex((t) => t.mode === effectiveMode);
      let nextIndex = currentIndex;

      switch (e.key) {
        case 'ArrowRight':
          nextIndex = (currentIndex + 1) % TABS.length;
          break;
        case 'ArrowLeft':
          nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
          break;
        case 'Home':
          nextIndex = 0;
          break;
        case 'End':
          nextIndex = TABS.length - 1;
          break;
        default:
          return;
      }

      e.preventDefault();
      setActiveMode(TABS[nextIndex].mode);

      // Focus follows selection — defer focus to next render
      const tabId = `viz-tab-${TABS[nextIndex].mode}`;
      requestAnimationFrame(() => {
        document.getElementById(tabId)?.focus();
      });
    },
    [effectiveMode, setActiveMode],
  );

  // ── rAF loop and renderer lifecycle ─────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // ── Reduced motion detection ────────────────────────────────
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduceMotion = motionQuery.matches;
    const onMotionChange = (e: MediaQueryListEvent) => {
      reduceMotion = e.matches;
    };
    motionQuery.addEventListener('change', onMotionChange);

    // ── Create and initialize renderer ──────────────────────────
    const renderer = createRenderer(effectiveMode);
    rendererRef.current = renderer;

    const dims = resizeCanvasToContainer(canvas, wrapper);
    renderer.init(canvas, ctx);
    if (dims) {
      renderer.resize(dims.width, dims.height, dims.dpr);
    }

    // ── ResizeObserver ──────────────────────────────────────────
    const resizeObserver = new ResizeObserver(() => {
      const newDims = resizeCanvasToContainer(canvas, wrapper);
      if (newDims) {
        renderer.resize(newDims.width, newDims.height, newDims.dpr);
      }
      isMobileRef.current =
        (newDims?.width ?? wrapper.clientWidth) < MOBILE_BREAKPOINT;
    });
    resizeObserver.observe(wrapper);

    // ── AnalyserNode setup (for spectrum mode) ──────────────────
    let analyserNode: AnalyserNode | null = null;
    let analyserBuffer: Uint8Array<ArrayBuffer> | null = null;

    // ── Pre-allocated visualization data (mutated each frame) ──
    const data: AudioVisualizationData = {
      voices: audioStateBuffer.voices,
      vuLeft: audioStateBuffer.vuLeft,
      vuRight: audioStateBuffer.vuRight,
      stereoLeft: audioStateBuffer.stereoLeft,
      stereoRight: audioStateBuffer.stereoRight,
      masterVuLeft: audioStateBuffer.masterVuLeft,
      masterVuRight: audioStateBuffer.masterVuRight,
      generation: audioStateBuffer.generation,
      positionSamples: audioStateBuffer.positionSamples,
      stereoFieldSettings: undefined,
      mutedVoices: undefined,
      title: undefined,
    };

    // ── Assemble visualization data from audioStateBuffer ───────
    function assembleData(): AudioVisualizationData {
      const state = useAppStore.getState();
      data.voices = audioStateBuffer.voices;
      data.vuLeft = audioStateBuffer.vuLeft;
      data.vuRight = audioStateBuffer.vuRight;
      data.stereoLeft = audioStateBuffer.stereoLeft;
      data.stereoRight = audioStateBuffer.stereoRight;
      data.masterVuLeft = audioStateBuffer.masterVuLeft;
      data.masterVuRight = audioStateBuffer.masterVuRight;
      data.generation = audioStateBuffer.generation;
      data.positionSamples = audioStateBuffer.positionSamples;
      data.stereoFieldSettings = state.stereoField;
      data.mutedVoices = state.voiceMuted;
      data.title = state.metadata?.gameTitle ?? undefined;

      // Clear optional fields not set every frame
      data.analyserData = undefined;
      data.spectrumSettings = undefined;

      // Read AnalyserNode FFT data when spectrum mode is active
      if (effectiveMode === 'spectrum') {
        if (!analyserNode) {
          analyserNode = audioEngine.getAnalyserNode();
        }
        if (analyserNode) {
          const settings = state.spectrum;

          // Apply user settings to the AnalyserNode
          if (analyserNode.fftSize !== settings.fftSize) {
            analyserNode.fftSize = settings.fftSize;
          }
          if (analyserNode.smoothingTimeConstant !== settings.smoothing) {
            analyserNode.smoothingTimeConstant = settings.smoothing;
          }

          // (Re)allocate buffer if frequency bin count changed
          const binCount = analyserNode.frequencyBinCount;
          if (!analyserBuffer || analyserBuffer.length !== binCount) {
            analyserBuffer = new Uint8Array(binCount);
          }

          analyserNode.getByteFrequencyData(analyserBuffer);
          data.analyserData = analyserBuffer;
          data.spectrumSettings = settings;
        }
      }

      return data;
    }

    // Initialize cached mobile breakpoint from container width
    isMobileRef.current = wrapper.clientWidth < MOBILE_BREAKPOINT;

    // Frame timing instrumentation
    let drawMax = 0;
    let lastFrameWarnTimestamp = 0;

    // ── rAF loop ────────────────────────────────────────────────
    function loop(timestamp: number): void {
      rafIdRef.current = requestAnimationFrame(loop);

      // Compute deltaTime and update timestamp BEFORE skip checks
      // so skipped frames don't accumulate into the next drawn frame.
      const deltaTime =
        lastTimestampRef.current > 0
          ? (timestamp - lastTimestampRef.current) / 1000
          : 0;
      lastTimestampRef.current = timestamp;

      // Reduced motion: throttle to ~4fps (takes precedence)
      if (reduceMotion) {
        if (timestamp - lastDrawTimeRef.current < REDUCED_MOTION_INTERVAL_MS) {
          return;
        }
      }

      // Mobile 30fps cap: skip every other frame
      const isMobile = isMobileRef.current;
      if (isMobile && !reduceMotion) {
        frameCountRef.current++;
        if (frameCountRef.current % 2 !== 0) {
          return;
        }
      }

      const data = assembleData();

      // Only draw when generation changes (new data from worklet)
      // or in reduced-motion mode (periodic snapshots).
      // Spectrum mode always draws because AnalyserNode updates
      // independently of the audioStateBuffer generation counter.
      if (
        data.generation === lastGenerationRef.current &&
        !reduceMotion &&
        effectiveMode !== 'spectrum'
      ) {
        return;
      }

      lastGenerationRef.current = data.generation;
      lastDrawTimeRef.current = timestamp;

      const drawStart = performance.now();
      renderer.draw(data, deltaTime);
      const drawDuration = performance.now() - drawStart;

      if (drawDuration > drawMax) {
        drawMax = drawDuration;
      }
      if (
        import.meta.env.DEV &&
        drawDuration > FRAME_BUDGET_MS &&
        timestamp - lastFrameWarnTimestamp > FRAME_WARN_INTERVAL_MS
      ) {
        lastFrameWarnTimestamp = timestamp;
        console.warn(
          `[viz] draw exceeded ${FRAME_BUDGET_MS}ms budget: ${drawDuration.toFixed(1)}ms (max: ${drawMax.toFixed(1)}ms)`,
        );
      }
    }

    rafIdRef.current = requestAnimationFrame(loop);

    // ── Cleanup ─────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafIdRef.current);
      resizeObserver.disconnect();
      motionQuery.removeEventListener('change', onMotionChange);
      renderer.dispose();
      rendererRef.current = null;
      analyserNode = null;
      analyserBuffer = null;
      lastGenerationRef.current = -1;
      lastTimestampRef.current = 0;
      lastDrawTimeRef.current = 0;
      frameCountRef.current = 0;
      isMobileRef.current = false;
    };
  }, [effectiveMode]);

  // ── Derive aria-label for the canvas wrapper ────────────────────
  const canvasAriaLabel =
    effectiveMode === 'cover-art' && gameTitle
      ? `Cover art for ${gameTitle}`
      : ARIA_LABELS[effectiveMode];

  const panelId = 'viz-panel';
  const activeTabId = `viz-tab-${effectiveMode}`;

  return (
    <div className={`${styles.stage}${className ? ` ${className}` : ''}`}>
      {/* Skip link — visible only on keyboard focus */}
      <a className={styles.skipLink} href="#after-visualization">
        Skip visualization
      </a>

      {/* Tab bar */}
      {showTabs && (
        <div
          role="tablist"
          aria-label="Visualization modes"
          className={styles.tabBar}
        >
          {TABS.map((tab) => {
            const isSelected = tab.mode === effectiveMode;
            return (
              <button
                key={tab.mode}
                id={`viz-tab-${tab.mode}`}
                role="tab"
                aria-selected={isSelected}
                aria-controls={panelId}
                tabIndex={isSelected ? 0 : -1}
                className={styles.tab}
                onClick={() => setActiveMode(tab.mode)}
                onKeyDown={handleTabKeyDown}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Tab panel + Canvas */}
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={activeTabId}
        tabIndex={0}
        className={styles.canvasPanel}
      >
        <div
          role="img"
          aria-label={canvasAriaLabel}
          className={styles.canvasWrapper}
          ref={wrapperRef}
        >
          <canvas
            ref={canvasRef}
            aria-hidden="true"
            className={styles.canvas}
          />
        </div>
      </div>

      {/* Skip target */}
      <span id="after-visualization" tabIndex={-1} />
    </div>
  );
}

/**
 * Suspense fallback matching the visualization stage height.
 * Displays a shimmer animation as a loading placeholder.
 */
export function VisualizationStageFallback() {
  return <div className={styles.fallback} aria-hidden="true" />;
}
