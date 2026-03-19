import dspWasmUrl from '../wasm/dsp.wasm?url';

export async function loadDspWasmBytes(): Promise<ArrayBuffer> {
  const response = await fetch(dspWasmUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch WASM: ${response.status} ${response.statusText}`,
    );
  }
  return response.arrayBuffer();
}
