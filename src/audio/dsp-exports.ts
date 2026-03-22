/**
 * Typed interface for the SPC APU WASM module's exported functions.
 *
 * These map 1:1 to the `#[no_mangle] pub extern "C" fn` exports from
 * `crates/spc-apu-wasm/src/lib.rs`. All pointer arguments refer to
 * offsets within the WASM linear memory (`memory`).
 */
export interface DspExports {
  /** WASM linear memory shared between host and DSP emulation. */
  memory: WebAssembly.Memory;

  // ── Lifecycle ─────────────────────────────────────────────────────

  /** Initialize DSP emulation with SPC file data. Returns 0 on success. */
  dsp_init(spcDataPtr: number, spcDataLen: number): number;

  /** Reset DSP state to power-on defaults without reloading SPC data. */
  dsp_reset(): void;

  // ── Rendering ─────────────────────────────────────────────────────

  /** Render `numFrames` stereo samples into the buffer at `outputPtr`. Returns frames written. */
  dsp_render(outputPtr: number, numFrames: number): number;

  /** Get the pointer to the pre-allocated stereo output buffer in WASM memory. */
  dsp_get_output_ptr(): number;

  // ── Voice control ─────────────────────────────────────────────────

  /** Set the 8-bit voice mute mask. Bit N = 1 mutes voice N. */
  dsp_set_voice_mask(mask: number): void;

  /** Write voice state (envelope, pitch, BRR position) for `voiceIndex` into `statePtr`. Returns bytes written. */
  dsp_get_voice_state(voiceIndex: number, statePtr: number): number;

  // ── DSP register access ───────────────────────────────────────────

  /** Read a single S-DSP register by address (0x00–0x7F). */
  dsp_get_register(addr: number): number;

  /** Write a value to a single S-DSP register. */
  dsp_set_register(addr: number, value: number): void;

  // ── Echo buffer telemetry ─────────────────────────────────────────

  /** Get the pointer to the echo buffer in WASM memory. */
  dsp_get_echo_buffer_ptr(): number;

  /** Get the current echo buffer length in bytes. */
  dsp_get_echo_buffer_length(): number;

  /** Write the 8 FIR filter coefficients to `outPtr`. Returns bytes written. */
  dsp_get_fir_coefficients(outPtr: number): number;

  // ── Instrument note-on/note-off ───────────────────────────────────

  /** Trigger note-on for `voice` at the given raw DSP `pitch` value. Returns 0 on success. */
  dsp_voice_note_on(voice: number, pitch: number): number;

  /** Trigger note-off (key-off) for `voice`. Returns 0 on success. */
  dsp_voice_note_off(voice: number): number;

  // ── S-DSP interpolation mode (ADR-0014) ───────────────────────────

  /** Set the sample interpolation mode: 0 = Gaussian (accurate), 1 = linear, 2 = sinc (high quality). */
  dsp_set_interpolation_mode(mode: number): void;

  /** Get the current interpolation mode. */
  dsp_get_interpolation_mode(): number;

  // ── Output sinc resampler (ADR-0014) ──────────────────────────────

  /** Resample audio using a windowed-sinc filter. Returns number of output samples written. */
  dsp_resample_sinc(
    inputPtr: number,
    inputLen: number,
    outputPtr: number,
    outputLen: number,
    ratioNum: number,
    ratioDen: number,
  ): number;

  /** Reset the sinc resampler's internal filter state. Call between tracks to avoid bleed. */
  dsp_resample_sinc_reset(): void;

  /** Get the pointer to the resampler's output buffer in WASM memory. */
  dsp_get_resample_output_ptr(): number;

  // ── Batch register telemetry (Phase D) ────────────────────────────

  /** Write all 128 S-DSP registers to `outPtr`. Returns bytes written. Used by analysis views. */
  dsp_get_registers(outPtr: number): number;

  /** Write SPC700 CPU register snapshot to `outPtr`. Returns bytes written. */
  dsp_get_cpu_registers(outPtr: number): number;

  /** Get the pointer to the 64 KB SPC700 RAM in WASM memory. */
  dsp_get_ram_ptr(): number;

  // ── Snapshot / Restore ────────────────────────────────────────────

  /** Return the byte size needed for a full DSP state snapshot. */
  dsp_snapshot_size(): number;

  /** Serialize the current DSP state to `outPtr`. Returns bytes written. */
  dsp_snapshot(outPtr: number): number;

  /** Restore DSP state from a snapshot at `inPtr` of length `len`. Returns 0 on success. */
  dsp_restore(inPtr: number, len: number): number;

  // ── Memory management ─────────────────────────────────────────────

  /** Allocate `size` bytes in WASM linear memory. Returns the pointer. */
  wasm_alloc(size: number): number;

  /** Deallocate `size` bytes at `ptr` in WASM linear memory. */
  wasm_dealloc(ptr: number, size: number): void;
}
