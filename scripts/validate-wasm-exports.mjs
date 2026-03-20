/**
 * Validates that the compiled WASM binary exports match the expected
 * DspExports interface. Fails CI if any expected export is missing
 * or has the wrong kind.
 *
 * Usage: node scripts/validate-wasm-exports.mjs [path/to/dsp.wasm]
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Expected exports derived from src/audio/dsp-exports.ts DspExports interface.
// Keep this list in sync with that interface.
const EXPECTED_EXPORTS = [
  { name: 'memory', kind: 'memory' },
  { name: 'dsp_init', kind: 'function' },
  { name: 'dsp_reset', kind: 'function' },
  { name: 'dsp_render', kind: 'function' },
  { name: 'dsp_get_output_ptr', kind: 'function' },
  { name: 'dsp_set_voice_mask', kind: 'function' },
  { name: 'dsp_get_voice_state', kind: 'function' },
  { name: 'dsp_get_register', kind: 'function' },
  { name: 'dsp_set_register', kind: 'function' },
  { name: 'wasm_alloc', kind: 'function' },
  { name: 'wasm_dealloc', kind: 'function' },
];

const wasmPath = resolve(process.argv[2] ?? 'src/wasm/dsp.wasm');

const bytes = await readFile(wasmPath);
const module = await WebAssembly.compile(bytes);
const actualExports = WebAssembly.Module.exports(module);

const exportMap = new Map(actualExports.map((e) => [e.name, e.kind]));

const missing = [];
const kindMismatch = [];

for (const expected of EXPECTED_EXPORTS) {
  const actualKind = exportMap.get(expected.name);
  if (actualKind === undefined) {
    missing.push(expected.name);
  } else if (actualKind !== expected.kind) {
    kindMismatch.push(
      `${expected.name}: expected ${expected.kind}, got ${actualKind}`,
    );
  }
}

if (missing.length === 0 && kindMismatch.length === 0) {
  console.log(
    `✓ All ${EXPECTED_EXPORTS.length} expected WASM exports present and correct`,
  );
  process.exit(0);
}

if (missing.length > 0) {
  console.error(`Missing WASM exports:\n  ${missing.join('\n  ')}`);
}
if (kindMismatch.length > 0) {
  console.error(`Export kind mismatches:\n  ${kindMismatch.join('\n  ')}`);
}

// Log actual exports for debugging
console.error(
  `\nActual WASM exports: ${actualExports.map((e) => `${e.name} (${e.kind})`).join(', ')}`,
);
process.exit(1);
