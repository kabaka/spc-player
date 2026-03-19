import dspWasmUrl from '../wasm/dsp.wasm?url';

export async function loadDspModule(): Promise<WebAssembly.Module> {
  return WebAssembly.compileStreaming(fetch(dspWasmUrl));
}
