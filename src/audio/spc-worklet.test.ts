/**
 * Unit tests for SpcProcessor (AudioWorklet).
 *
 * Strategy: mock AudioWorkletProcessor base class and WASM DSP, then test
 * the processor's process() method behavior, fade ramp accuracy,
 * playback-ended timing, and config update handling.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DspExports } from './dsp-exports';
import type { MainToWorklet, WorkletToMain } from './worker-protocol';

// ---------------------------------------------------------------------------
// AudioWorklet global mocks — must be set before importing the worklet module
// ---------------------------------------------------------------------------

class MockAudioWorkletProcessor {
  port: {
    postMessage: ReturnType<typeof vi.fn>;
    onmessage: ((event: MessageEvent) => void) | null;
  };

  constructor() {
    this.port = {
      postMessage: vi.fn(),
      onmessage: null,
    };
  }
}

(globalThis as unknown as Record<string, unknown>).AudioWorkletProcessor =
  MockAudioWorkletProcessor as unknown as typeof AudioWorkletProcessor;

// Capture the registered processor class for instantiation in tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SpcProcessorClass: any;
(globalThis as unknown as Record<string, unknown>).registerProcessor = vi.fn(
  (_name: string, cls: unknown) => {
    SpcProcessorClass = cls;
  },
);

// AudioWorkletGlobalScope exposes `sampleRate` as a global.
(globalThis as unknown as Record<string, unknown>).sampleRate = 32_000;

// ---------------------------------------------------------------------------
// Constants mirrored from the worklet (not importable at runtime)
// ---------------------------------------------------------------------------

const QUANTUM_FRAMES = 128;
const DSP_SAMPLE_RATE = 32_000;
const PROTOCOL_VERSION = 2;

// ---------------------------------------------------------------------------
// Mock WASM DSP factory
// ---------------------------------------------------------------------------

function createMockDspExports(): DspExports {
  const memory = new WebAssembly.Memory({ initial: 1 }); // 64 KiB
  let nextAlloc = 32_768; // Past max output buffer region

  return {
    memory,
    dsp_init: vi.fn().mockReturnValue(0),
    dsp_reset: vi.fn(),
    dsp_render: vi.fn((outputPtr: number, numFrames: number) => {
      // Fill interleaved stereo output with 1.0 for predictable tests.
      const view = new Float32Array(memory.buffer, outputPtr, numFrames * 2);
      view.fill(1.0);
      return numFrames;
    }),
    dsp_get_output_ptr: vi.fn().mockReturnValue(0),
    dsp_set_voice_mask: vi.fn(),
    dsp_get_voice_state: vi.fn().mockReturnValue(0),
    dsp_get_register: vi.fn().mockReturnValue(0),
    dsp_set_register: vi.fn(),
    dsp_get_echo_buffer_ptr: vi.fn().mockReturnValue(0),
    dsp_get_echo_buffer_length: vi.fn().mockReturnValue(0),
    dsp_get_fir_coefficients: vi.fn().mockReturnValue(8),
    dsp_voice_note_on: vi.fn().mockReturnValue(0),
    dsp_voice_note_off: vi.fn().mockReturnValue(0),
    dsp_set_interpolation_mode: vi.fn(),
    dsp_get_interpolation_mode: vi.fn().mockReturnValue(0),
    dsp_resample_sinc: vi.fn().mockReturnValue(0),
    dsp_resample_sinc_reset: vi.fn(),
    dsp_get_resample_output_ptr: vi.fn().mockReturnValue(0),
    dsp_get_registers: vi.fn().mockReturnValue(0),
    dsp_get_cpu_registers: vi.fn().mockReturnValue(0),
    dsp_get_ram_ptr: vi.fn().mockReturnValue(0),
    dsp_snapshot_size: vi.fn().mockReturnValue(0),
    dsp_snapshot: vi.fn().mockReturnValue(0),
    dsp_restore: vi.fn().mockReturnValue(0),
    wasm_alloc: vi.fn(() => {
      const ptr = nextAlloc;
      nextAlloc += 4096;
      return ptr;
    }),
    wasm_dealloc: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const flushPromises = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Processor = any;

/** Send a message to the processor's port (simulates main → worklet). */
function sendMessage(processor: Processor, msg: MainToWorklet): void {
  const handler = processor.port.onmessage;
  if (handler) {
    handler({ data: msg } as MessageEvent<MainToWorklet>);
  }
}

/** Get all messages posted by the processor (worklet → main). */
function getPostedMessages(processor: Processor): WorkletToMain[] {
  return (
    processor.port.postMessage as ReturnType<typeof vi.fn>
  ).mock.calls.map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ([msg]: any[]) => msg as WorkletToMain,
  );
}

/** Call processor.process() with fresh stereo output buffers. */
function callProcess(processor: Processor): {
  left: Float32Array;
  right: Float32Array;
  result: boolean;
} {
  const left = new Float32Array(QUANTUM_FRAMES);
  const right = new Float32Array(QUANTUM_FRAMES);
  const result = processor.process([], [[left, right]], {}) as boolean;
  return { left, right, result };
}

/**
 * Initialize a processor: instantiate, send 'init', wait for 'ready'.
 * Returns the processor, its port mock, and a helper to send messages.
 */
async function initProcessor(
  overrides: Partial<MainToWorklet.Init> = {},
): Promise<{
  processor: Processor;
  wasm: DspExports;
  postMessage: ReturnType<typeof vi.fn>;
}> {
  const wasm = createMockDspExports();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (vi.spyOn(WebAssembly, 'instantiate') as any).mockResolvedValue({
    instance: { exports: wasm as unknown } as WebAssembly.Instance,
    module: {} as WebAssembly.Module,
  });

  const processor = new SpcProcessorClass();
  const postMessageMock = processor.port.postMessage as ReturnType<
    typeof vi.fn
  >;

  const initMsg: MainToWorklet.Init = {
    type: 'init',
    version: PROTOCOL_VERSION,
    wasmBytes: new ArrayBuffer(0),
    spcData: new ArrayBuffer(0),
    outputSampleRate: DSP_SAMPLE_RATE, // 1:1 with DSP — no resampling
    resamplerMode: 0,
    interpolationMode: 0,
    durationSamples: null,
    fadeOutSamples: 0,
    ...overrides,
  };

  sendMessage(processor, initMsg);
  await flushPromises();

  expect(postMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'ready' }),
  );

  postMessageMock.mockClear();

  return { processor, wasm, postMessage: postMessageMock };
}

// ---------------------------------------------------------------------------
// Import the worklet module — triggers registerProcessor
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await import('./spc-worklet');
  expect(SpcProcessorClass).toBeDefined();
});

beforeEach(() => {
  vi.restoreAllMocks();
});

// ===========================================================================
// Tests
// ===========================================================================

describe('SpcProcessor', () => {
  // -------------------------------------------------------------------------
  // Fade ramp accuracy
  // -------------------------------------------------------------------------

  describe('fade ramp', () => {
    it('produces linear gain from 1.0 to 0.0 over fadeOutSamples', async () => {
      const { processor, postMessage } = await initProcessor({
        durationSamples: 256,
        fadeOutSamples: 128,
      });

      sendMessage(processor, { type: 'play' });
      postMessage.mockClear();

      // Render 2 quanta (256 samples) to reach the fade start.
      // First quantum warms up carry-over (prevDspLeft/Right → 1.0).
      callProcess(processor);
      callProcess(processor);

      // 3rd quantum: entirely within the fade region (samples 256–384).
      const { left } = callProcess(processor);

      // Fade gain for frame i: gain = 1.0 - i/128
      // The resampled output is 1.0 (constant DSP output, 1:1 rate), so
      // the output value equals the gain.
      expect(left[0]).toBeCloseTo(1.0, 2); // Start of fade
      expect(left[32]).toBeCloseTo(1.0 - 32 / 128, 2); // 0.75
      expect(left[64]).toBeCloseTo(0.5, 2); // Midpoint
      expect(left[96]).toBeCloseTo(1.0 - 96 / 128, 2); // 0.25
      expect(left[127]).toBeCloseTo(1.0 - 127 / 128, 2); // Near zero
    });

    it('does not modify output before the fade region', async () => {
      const { processor, postMessage } = await initProcessor({
        durationSamples: 512,
        fadeOutSamples: 128,
      });

      sendMessage(processor, { type: 'play' });
      postMessage.mockClear();

      // First quantum: warm up carry-over.
      callProcess(processor);

      // Second quantum: well before fade start (rendered samples = 256).
      const { left } = callProcess(processor);

      // All samples should be at full volume (1.0) — no fade attenuation.
      for (let i = 0; i < QUANTUM_FRAMES; i++) {
        expect(left[i]).toBeCloseTo(1.0, 4);
      }
    });

    it('silences output past the fade region', async () => {
      const { processor, postMessage } = await initProcessor({
        durationSamples: 128,
        fadeOutSamples: 128,
      });

      sendMessage(processor, { type: 'play' });
      postMessage.mockClear();

      // Quantum 1: warm up (0→128), renderedSamples reaches durationSamples.
      callProcess(processor);
      // Quantum 2: fade region (128→256).
      callProcess(processor);
      // Quantum 3: past the fade region — isPlaybackFinished is true.
      const { left, right } = callProcess(processor);

      // Processor fills with silence because isPlaybackFinished returns true.
      for (let i = 0; i < QUANTUM_FRAMES; i++) {
        expect(left[i]).toBe(0);
        expect(right[i]).toBe(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // PlaybackEnded timing
  // -------------------------------------------------------------------------

  describe('playback-ended', () => {
    it('fires when renderedSamples reaches durationSamples + fadeOutSamples', async () => {
      const { processor, postMessage } = await initProcessor({
        durationSamples: 256,
        fadeOutSamples: 128,
      });

      sendMessage(processor, { type: 'play' });
      postMessage.mockClear();

      // Quanta 1–2: before the end.
      callProcess(processor);
      callProcess(processor);

      const messagesBeforeEnd = getPostedMessages(processor);
      expect(messagesBeforeEnd.some((m) => m.type === 'playback-ended')).toBe(
        false,
      );

      // Quantum 3: renderedSamples reaches 384 = 256 + 128.
      callProcess(processor);

      const messagesAfterEnd = getPostedMessages(processor);
      const ended = messagesAfterEnd.find((m) => m.type === 'playback-ended');
      expect(ended).toBeDefined();
      expect(ended).toEqual(
        expect.objectContaining({
          type: 'playback-ended',
          totalSamples: 384,
        }),
      );
    });

    it('fires only once', async () => {
      const { processor, postMessage } = await initProcessor({
        durationSamples: 128,
        fadeOutSamples: 128,
      });

      sendMessage(processor, { type: 'play' });
      postMessage.mockClear();

      // Render enough quanta to trigger playback-ended and continue past.
      for (let i = 0; i < 10; i++) {
        callProcess(processor);
      }

      const endedMessages = getPostedMessages(processor).filter(
        (m) => m.type === 'playback-ended',
      );
      expect(endedMessages).toHaveLength(1);
    });

    it('fires at the correct sample position with zero fade', async () => {
      const { processor, postMessage } = await initProcessor({
        durationSamples: 128,
        fadeOutSamples: 0,
      });

      sendMessage(processor, { type: 'play' });
      postMessage.mockClear();

      // Quantum 1: renderedSamples reaches 128 = durationSamples + 0.
      callProcess(processor);

      const ended = getPostedMessages(processor).find(
        (m) => m.type === 'playback-ended',
      );
      expect(ended).toEqual(
        expect.objectContaining({
          type: 'playback-ended',
          totalSamples: 128,
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // SetPlaybackConfig mid-playback
  // -------------------------------------------------------------------------

  describe('set-playback-config', () => {
    it('updates duration mid-playback without restart', async () => {
      const { processor, postMessage } = await initProcessor({
        durationSamples: 256,
        fadeOutSamples: 128,
      });

      sendMessage(processor, { type: 'play' });
      postMessage.mockClear();

      // Render 1 quantum (128 samples rendered).
      callProcess(processor);

      // Extend duration mid-playback.
      sendMessage(processor, {
        type: 'set-playback-config',
        durationSamples: 512,
        fadeOutSamples: 128,
        loopCount: null,
        structure: null,
      });

      // Original end would be at 384. Render past it — no playback-ended.
      callProcess(processor); // 256
      callProcess(processor); // 384

      expect(
        getPostedMessages(processor).some((m) => m.type === 'playback-ended'),
      ).toBe(false);

      // Playback should end at 640 (512 + 128).
      callProcess(processor); // 512
      callProcess(processor); // 640

      const ended = getPostedMessages(processor).find(
        (m) => m.type === 'playback-ended',
      );
      expect(ended).toEqual(
        expect.objectContaining({
          type: 'playback-ended',
          totalSamples: 640,
        }),
      );
    });

    it('switches to infinite mode when durationSamples set to null', async () => {
      const { processor, postMessage } = await initProcessor({
        durationSamples: 256,
        fadeOutSamples: 128,
      });

      sendMessage(processor, { type: 'play' });
      postMessage.mockClear();

      // Render 1 quantum, then switch to infinite.
      callProcess(processor);

      sendMessage(processor, {
        type: 'set-playback-config',
        durationSamples: null,
        fadeOutSamples: 0,
        loopCount: null,
        structure: null,
      });

      // Render way past the original end — should never stop.
      for (let i = 0; i < 50; i++) {
        callProcess(processor);
      }

      expect(
        getPostedMessages(processor).some((m) => m.type === 'playback-ended'),
      ).toBe(false);
    });

    it('silences output when duration shortened past current position', async () => {
      const { processor, postMessage } = await initProcessor({
        durationSamples: 1024,
        fadeOutSamples: 128,
      });

      sendMessage(processor, { type: 'play' });
      postMessage.mockClear();

      // Render 3 quanta (384 samples).
      callProcess(processor);
      callProcess(processor);
      callProcess(processor);

      // Shorten duration to 256 — we're already past it (384 > 256).
      // isPlaybackFinished() returns true at the top of process(),
      // so output is silenced. Note: playback-ended is NOT emitted in
      // this scenario — the early-return path in process() fills silence
      // but does not post the event. This is a known gap (the event is
      // only posted after the render+fade path, not the early-return).
      sendMessage(processor, {
        type: 'set-playback-config',
        durationSamples: 256,
        fadeOutSamples: 128,
        loopCount: null,
        structure: null,
      });

      const { left, right } = callProcess(processor);

      // Output is silence because isPlaybackFinished triggers the early return.
      for (let i = 0; i < QUANTUM_FRAMES; i++) {
        expect(left[i]).toBe(0);
        expect(right[i]).toBe(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Infinite mode
  // -------------------------------------------------------------------------

  describe('infinite mode', () => {
    it('never auto-ends when durationSamples is null', async () => {
      const { processor, postMessage } = await initProcessor({
        durationSamples: null,
        fadeOutSamples: 0,
      });

      sendMessage(processor, { type: 'play' });
      postMessage.mockClear();

      // Render 100 quanta (12,800 samples ≈ 0.4 seconds at 32 kHz).
      for (let i = 0; i < 100; i++) {
        callProcess(processor);
      }

      expect(
        getPostedMessages(processor).some((m) => m.type === 'playback-ended'),
      ).toBe(false);
    });

    it('does not apply fade gain when durationSamples is null', async () => {
      const { processor, postMessage } = await initProcessor({
        durationSamples: null,
        fadeOutSamples: 128,
      });

      sendMessage(processor, { type: 'play' });
      postMessage.mockClear();

      // Warm up carry-over.
      callProcess(processor);

      // All subsequent output should remain at full volume.
      for (let q = 0; q < 20; q++) {
        const { left } = callProcess(processor);
        for (let i = 0; i < QUANTUM_FRAMES; i++) {
          expect(left[i]).toBeCloseTo(1.0, 4);
        }
      }
    });

    it('renders indefinitely until explicitly stopped', async () => {
      const { processor, postMessage } = await initProcessor({
        durationSamples: null,
        fadeOutSamples: 0,
      });

      sendMessage(processor, { type: 'play' });
      postMessage.mockClear();

      // Render many quanta and verify process() keeps returning true.
      for (let i = 0; i < 50; i++) {
        const { result } = callProcess(processor);
        expect(result).toBe(true);
      }

      // Stop manually.
      sendMessage(processor, { type: 'stop' });

      // After stop, output should be silence.
      const { left, right } = callProcess(processor);
      for (let i = 0; i < QUANTUM_FRAMES; i++) {
        expect(left[i]).toBe(0);
        expect(right[i]).toBe(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Edge: process before init
  // -------------------------------------------------------------------------

  describe('process before init', () => {
    it('fills silence when WASM is not initialized', () => {
      const processor = new SpcProcessorClass();
      const { left, right, result } = callProcess(processor);

      for (let i = 0; i < QUANTUM_FRAMES; i++) {
        expect(left[i]).toBe(0);
        expect(right[i]).toBe(0);
      }
      expect(result).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Instrument mode: KOFF clearing on note-on (regression)
  // -------------------------------------------------------------------------

  describe('instrument mode note-on clears KOFF', () => {
    it('clears KOFF register before triggering KON in instrument mode', async () => {
      const { processor, wasm } = await initProcessor();

      // Snapshot size must be non-zero for enter-instrument-mode to succeed;
      // snapshot() returns the number of bytes written.
      (wasm.dsp_snapshot_size as ReturnType<typeof vi.fn>).mockReturnValue(64);
      (wasm.dsp_snapshot as ReturnType<typeof vi.fn>).mockReturnValue(64);
      (wasm.dsp_get_register as ReturnType<typeof vi.fn>).mockReturnValue(0);
      (
        wasm.dsp_get_cpu_registers as ReturnType<typeof vi.fn>
      ).mockImplementation((ptr: number) => {
        // Write a PC at address 0x0200 (below IPL ROM at 0xFFC0)
        const view = new Uint8Array(wasm.memory.buffer, ptr, 8);
        view[0] = 0x00; // PC low
        view[1] = 0x02; // PC high (0x0200)
      });

      // Enter instrument mode — this writes KOFF=0xFF internally
      sendMessage(processor, { type: 'enter-instrument-mode' });

      // Verify KOFF=0xFF was written during mode entry
      const setRegCalls = (wasm.dsp_set_register as ReturnType<typeof vi.fn>)
        .mock.calls;
      const koffWritesDuringEntry = setRegCalls.filter(
        (args: unknown[]) => args[0] === 0x5c && args[1] === 0xff,
      );
      expect(koffWritesDuringEntry.length).toBeGreaterThanOrEqual(1);

      // Clear mock history to isolate note-on behavior
      (wasm.dsp_set_register as ReturnType<typeof vi.fn>).mockClear();

      // Send a note-on
      sendMessage(processor, { type: 'note-on', voice: 0, pitch: 0x1000 });

      // Verify KOFF=0x00 was written BEFORE KON
      const noteOnSetRegCalls = (
        wasm.dsp_set_register as ReturnType<typeof vi.fn>
      ).mock.calls;
      const koffClearIndex = noteOnSetRegCalls.findIndex(
        (args: unknown[]) => args[0] === 0x5c && args[1] === 0x00,
      );
      expect(koffClearIndex).toBeGreaterThanOrEqual(0);

      // Verify dsp_voice_note_on was called (KON fires)
      expect(wasm.dsp_voice_note_on).toHaveBeenCalledWith(0, 0x1000);

      // Verify KOFF clear happened before SRCN write (register 0x04)
      const srcnWriteIndex = noteOnSetRegCalls.findIndex(
        (args: unknown[]) => args[0] === 0x04,
      );
      expect(koffClearIndex).toBeLessThan(srcnWriteIndex);
    });
  });
});
