export interface DspExports {
  memory: WebAssembly.Memory;

  // Lifecycle
  dsp_init(spcDataPtr: number, spcDataLen: number): number;
  dsp_reset(): void;

  // Rendering
  dsp_render(outputPtr: number, numFrames: number): number;
  dsp_get_output_ptr(): number;

  // Voice control
  dsp_set_voice_mask(mask: number): void;
  dsp_get_voice_state(voiceIndex: number, statePtr: number): number;

  // DSP register access
  dsp_get_register(addr: number): number;
  dsp_set_register(addr: number, value: number): void;

  // Echo buffer telemetry
  dsp_get_echo_buffer_ptr(): number;
  dsp_get_echo_buffer_length(): number;
  dsp_get_fir_coefficients(outPtr: number): number;

  // Instrument note-on/note-off
  dsp_voice_note_on(voice: number, pitch: number): number;
  dsp_voice_note_off(voice: number): number;

  // S-DSP interpolation mode (ADR-0014)
  dsp_set_interpolation_mode(mode: number): void;
  dsp_get_interpolation_mode(): number;

  // Output sinc resampler (ADR-0014)
  dsp_resample_sinc(
    inputPtr: number,
    inputLen: number,
    outputPtr: number,
    outputLen: number,
    ratioNum: number,
    ratioDen: number,
  ): number;
  dsp_resample_sinc_reset(): void;
  dsp_get_resample_output_ptr(): number;

  // Batch register telemetry (Phase D)
  dsp_get_registers(outPtr: number): number;
  dsp_get_cpu_registers(outPtr: number): number;
  dsp_get_ram_ptr(): number;

  // Snapshot / Restore
  dsp_snapshot_size(): number;
  dsp_snapshot(outPtr: number): number;
  dsp_restore(inPtr: number, len: number): number;

  // Memory management
  wasm_alloc(size: number): number;
  wasm_dealloc(ptr: number, size: number): void;
}
