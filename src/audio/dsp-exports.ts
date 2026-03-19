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

  // Memory management
  wasm_alloc(size: number): number;
  wasm_dealloc(ptr: number, size: number): void;
}
