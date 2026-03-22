import type { VoiceStateSnapshot } from '@/audio/audio-state-buffer';
import type { SpectrumSettings, StereoFieldSettings } from '@/store/types';

/**
 * Data passed to each visualization renderer on every draw call.
 *
 * Assembled from `audioStateBuffer` (main-thread copy of worklet telemetry)
 * and optionally from an AnalyserNode for FFT frequency data.
 */
export interface AudioVisualizationData {
  voices: VoiceStateSnapshot[];
  vuLeft: Float32Array;
  vuRight: Float32Array;
  stereoLeft: Float32Array;
  stereoRight: Float32Array;
  masterVuLeft: number;
  masterVuRight: number;
  generation: number;
  positionSamples: number;
  /** FFT frequency data from AnalyserNode (for spectrum visualization). */
  analyserData?: Uint8Array;
  /** Current spectrum display settings (mode, fftSize, smoothing). */
  spectrumSettings?: SpectrumSettings;
  /** Stereo field renderer settings (mode and decay). */
  stereoFieldSettings?: StereoFieldSettings;
  /** Voice mute states from mixer, indexed by voice number (0–7). */
  mutedVoices?: readonly boolean[];
  /** Current track title (used by cover art renderer). */
  title?: string;
}

/**
 * Interface that all visualization renderers must implement.
 *
 * The VisualizationStage manages a single shared canvas and delegates
 * rendering to the active renderer. Only one renderer is active at a time.
 */
export interface VisualizationRenderer {
  /** Initialize the renderer with the shared canvas and 2D context. */
  init(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void;
  /** Draw a single frame. Called from the shared rAF loop. */
  draw(data: AudioVisualizationData, deltaTime: number): void;
  /** Handle canvas resize. Coordinates are CSS pixels; dpr is the device pixel ratio. */
  resize(width: number, height: number, dpr: number): void;
  /** Clean up resources when switching away from this renderer. */
  dispose(): void;
}
