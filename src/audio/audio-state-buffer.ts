/** Module-scoped mutable object for ref-based real-time audio state.
 *
 * The AudioWorklet telemetry writes to this buffer via a MessagePort handler
 * on the main thread. rAF visualization loops read from it directly.
 * This intentionally bypasses Zustand and React state for performance —
 * see ADR-0005 §Real-Time Audio Visualization Channel.
 */

export interface VoiceStateSnapshot {
  index: number;
  envelopePhase: 'attack' | 'decay' | 'sustain' | 'release' | 'silent';
  envelopeLevel: number;
  pitch: number;
  sampleSource: number;
  keyOn: boolean;
  active: boolean;
}

export interface AudioStateBuffer {
  positionSamples: number;
  vuLeft: Float32Array;
  vuRight: Float32Array;
  stereoLeft: Float32Array;
  stereoRight: Float32Array;
  masterVuLeft: number;
  masterVuRight: number;
  voices: VoiceStateSnapshot[];
  echoBuffer: Int16Array | null;
  firCoefficients: Uint8Array;
  // Added by audio-engine plan (Phase D) — interface extension only, data flow wired in Phase D
  dspRegisters: Uint8Array;
  cpuRegisters: {
    a: number;
    x: number;
    y: number;
    sp: number;
    pc: number;
    psw: number;
  };
  ramCopy: Uint8Array;
  processLoadPercent: number;
  totalUnderruns: number;
  /** Monotonically increasing counter for change detection by rAF consumers. */
  generation: number;
}

function createDefaultVoice(index: number): VoiceStateSnapshot {
  return {
    index,
    envelopePhase: 'silent',
    envelopeLevel: 0,
    pitch: 0,
    sampleSource: 0,
    keyOn: false,
    active: false,
  };
}

function createDefaultBuffer(): AudioStateBuffer {
  return {
    positionSamples: 0,
    vuLeft: new Float32Array(8),
    vuRight: new Float32Array(8),
    stereoLeft: new Float32Array(8),
    stereoRight: new Float32Array(8),
    masterVuLeft: 0,
    masterVuRight: 0,
    voices: Array.from({ length: 8 }, (_, i) => createDefaultVoice(i)),
    echoBuffer: null,
    firCoefficients: new Uint8Array(8),
    dspRegisters: new Uint8Array(128),
    cpuRegisters: { a: 0, x: 0, y: 0, sp: 0, pc: 0, psw: 0 },
    ramCopy: new Uint8Array(65536),
    processLoadPercent: 0,
    totalUnderruns: 0,
    generation: 0,
  };
}

/** Singleton mutable audio state buffer. */
export const audioStateBuffer: AudioStateBuffer = createDefaultBuffer();

/** Reset all fields to defaults. Preserves the object identity and pre-allocated Float32Arrays. */
export function resetAudioStateBuffer(): void {
  audioStateBuffer.positionSamples = 0;
  audioStateBuffer.vuLeft.fill(0);
  audioStateBuffer.vuRight.fill(0);
  audioStateBuffer.stereoLeft.fill(0);
  audioStateBuffer.stereoRight.fill(0);
  audioStateBuffer.masterVuLeft = 0;
  audioStateBuffer.masterVuRight = 0;

  for (let i = 0; i < 8; i++) {
    const voice = audioStateBuffer.voices[i];
    voice.index = i;
    voice.envelopePhase = 'silent';
    voice.envelopeLevel = 0;
    voice.pitch = 0;
    voice.sampleSource = 0;
    voice.keyOn = false;
    voice.active = false;
  }

  audioStateBuffer.echoBuffer = null;
  audioStateBuffer.firCoefficients.fill(0);

  audioStateBuffer.dspRegisters.fill(0);
  audioStateBuffer.cpuRegisters.a = 0;
  audioStateBuffer.cpuRegisters.x = 0;
  audioStateBuffer.cpuRegisters.y = 0;
  audioStateBuffer.cpuRegisters.sp = 0;
  audioStateBuffer.cpuRegisters.pc = 0;
  audioStateBuffer.cpuRegisters.psw = 0;
  audioStateBuffer.ramCopy.fill(0);
  audioStateBuffer.processLoadPercent = 0;
  audioStateBuffer.totalUnderruns = 0;

  audioStateBuffer.generation = 0;
}
