---
status: "accepted"
date: 2026-03-18
decision-makers: []
consulted: []
informed: []
---

# Use WASM-Compiled Reference Encoders for Audio Export with Custom WAV Implementation

## Context and Problem Statement

SPC Player supports exporting audio to four formats: WAV, FLAC, OGG Vorbis, and MP3 (per requirements). The export pipeline (ADR-0003) runs in a Web Worker at maximum speed (faster than real-time), producing resampled PCM data as Float32Array or Int16Array at the target sample rate (32k, 44.1k, 48k, or 96k Hz). TPDF dithering converts float32 to int16 before encoding. The encoder must accept this PCM data and produce the output file format with embedded metadata derived from SPC ID666/xid6 tags (title, artist, game, duration, comments, dumper credit).

Export scenarios include full mix export, per-track export (individual voices as separate files), per-instrument BRR sample export, and batch export for playlists — making encoding performance critical for user experience, as batch-exporting a full playlist generates dozens to hundreds of encoding operations. All processing is client-side with no server backend.

The project already uses a Rust-to-WASM toolchain (ADR-0001) for DSP emulation and a Rust-implemented resampler (ADR-0003). This raises an architectural question: should the audio encoder libraries also follow the Rust/WASM pattern for build pipeline consistency, or should they be selected pragmatically per format regardless of implementation language?

Which encoding libraries should SPC Player use for each export format, and should the project standardize on a single encoding technology approach or adopt a per-format best-fit strategy?

## Decision Drivers

- **Audio quality** — encoders must produce high-fidelity output. Lossless formats (WAV, FLAC) must be bit-perfect. Lossy formats (OGG Vorbis, MP3) must use the best available encoding algorithms with quality-based VBR control.
- **Encoding performance** — batch export of a full playlist (potentially hundreds of tracks) must complete in reasonable time. Encoding runs in a Web Worker without real-time constraints, but 5–10× slower encoding (as typical of pure JS vs. WASM) compounds across batch operations and degrades user experience.
- **Bundle size** — encoder libraries can be lazy-loaded per format (a user who never exports MP3 never downloads the MP3 encoder), but each library's size should still be reasonable. The DSP WASM binary already contributes ~50–100 KB (ADR-0001); encoder WASM modules are additive.
- **License compatibility** — all libraries must use permissive or LGPL-compatible licenses. GPL is excluded. LGPL is acceptable if the library is loaded as a separate, replaceable module (functionally equivalent to dynamic linking). MP3 patents have expired worldwide as of 2017; patent licensing is not a concern.
- **Metadata embedding** — exported files must contain metadata derived from SPC ID666/xid6 tags. WAV uses RIFF INFO chunks; FLAC and OGG Vorbis use Vorbis comments; MP3 uses ID3v2 tags. The encoder library must support metadata injection, or metadata must be writeable independently of the encoding step.
- **Library maintenance and reliability** — the library must be actively maintained or derived from a stable, well-understood codebase (e.g., a WASM compilation of a reference C encoder with a 15–25 year track record). Abandoned JavaScript ports with unfixed bugs are a significant risk for a project with no human developers to triage encoding artifacts.
- **Build pipeline consistency** — the project uses Rust/wasm-pack for DSP emulation (ADR-0001). Adding Emscripten as a second WASM compilation toolchain increases build complexity and contributor onboarding friction. If Rust-based alternatives exist at equivalent quality, they are preferred — but not at the cost of encoder fidelity or reliability.
- **Streaming encoding API** — the encoder should support incremental (chunk-based) encoding rather than requiring the entire PCM buffer in memory at once. A 3-minute track at 96 kHz stereo 16-bit consumes ~66 MB as a single buffer; streaming encoding reduces peak memory usage and enables progress reporting during long exports.
- **TypeScript type availability** — the library should have TypeScript type definitions (published or community `@types`) to ensure type-safe integration. Missing types require authoring and maintaining `.d.ts` declarations in the project.

## Considered Options

- **Option 1: Unified Rust/WASM encoder pipeline** — implement or wrap all encoders in Rust, compile alongside the DSP core via wasm-pack
- **Option 2: Pre-compiled WASM libraries (Emscripten ports of C reference encoders)** — use community-maintained WASM builds of libFLAC, libvorbisenc, and LAME, loaded as separate modules
- **Option 3: Self-compiled C reference encoders via Emscripten** — add Emscripten to the build pipeline, compile libFLAC, libvorbisenc, and LAME from source with custom bindings
- **Option 4: Pure JavaScript encoder libraries** — use JS-only implementations (flac.js, lamejs) for maximum deployment simplicity

WAV encoding is excluded from these options because it is trivial — a 44-byte RIFF header followed by raw PCM data. It will be implemented as a custom TypeScript utility (~50 lines) in all approaches. No library is needed or justified.

## Decision Outcome

Chosen option: **"Pre-compiled WASM libraries (Emscripten ports of C reference encoders)"**, because it delivers reference-encoder audio quality with near-native WASM performance for batch export, avoids adding Emscripten to the project's build pipeline (preserving the Rust-only WASM toolchain for project-owned code), and selects from battle-tested C implementations that have been the definitive encoders for their respective formats for 15–25 years.

Option 1 (unified Rust) was the most architecturally appealing but was rejected because production-quality pure Rust encoder implementations do not exist for FLAC, Vorbis, or MP3. The option collapses into wrapping C libraries through Rust FFI `-sys` crates, which for `wasm32-unknown-unknown` targets requires a C-to-WASM compiler (Emscripten) behind the Rust facade — negating the build pipeline consistency benefit while adding FFI wrapper complexity. Option 3 (self-compiled Emscripten) offers more control over compilation flags and exported functions, but adds a second WASM toolchain as a permanent build dependency for marginal benefit over well-maintained pre-compiled packages. Option 4 (pure JavaScript) is rejected because no production-quality pure JS Vorbis encoder exists, and the performance penalty (~5–20× slower encoding) makes batch export of large playlists impractical.

### Per-Format Library Selections

| Format | Library | Source | License | Metadata System |
| ------ | ------- | ------ | ------- | --------------- |
| WAV | Custom TypeScript | Project code | N/A | RIFF INFO chunk |
| FLAC | libflac.js | Emscripten port of libFLAC | BSD-3-Clause | Vorbis comments |
| OGG Vorbis | ogg-vorbis-encoder-wasm | Emscripten port of libvorbisenc | BSD-like (Xiph) | Vorbis comments |
| MP3 | lame-wasm (or equivalent) | Emscripten port of LAME | LGPL-2.1 | ID3v2 |

**WAV:** Custom TypeScript implementation generating a RIFF/WAVE container with a `fmt ` chunk (PCM format, 16-bit, configurable sample rate and channel count) and a `data` chunk containing raw little-endian int16 PCM samples. Optionally includes a LIST/INFO chunk for basic metadata (INAM for title, IART for artist). This is ~50 lines of code with no external dependency.

**FLAC:** libflac.js provides the reference libFLAC encoder compiled to WebAssembly. libFLAC (maintained by the Xiph.Org Foundation) is the only production-quality FLAC encoder implementation — all other FLAC tools either use libFLAC underneath, are decoder-only, or are incomplete. Default compression level 5 balances encoding speed and file size. Vorbis comments are natively supported for metadata embedding.

**OGG Vorbis:** ogg-vorbis-encoder-wasm (or similar Emscripten port of libvorbisenc) provides the Xiph reference Vorbis encoder compiled to WebAssembly. libvorbisenc is the only production-quality Vorbis encoder implementation — there is no pure Rust, pure JavaScript, or alternative C Vorbis encoder. Default quality 6 produces ~192 kbps VBR output. Vorbis comments are the native metadata container for OGG streams.

**MP3:** A WASM-compiled LAME encoder provides the industry-standard MP3 encoder. LAME is the only open-source MP3 encoder that consistently produces high-quality output — it is the de facto reference encoder for the format. Default VBR quality V2 produces ~190 kbps output. ID3v2 tags provide metadata. LAME's LGPL-2.1 license is satisfied by loading it as a separate, replaceable WASM module — functionally equivalent to dynamic linking (see "LGPL-2.1 Compliance for LAME" below).

### Consequences

- Good, because reference C encoders (libFLAC, libvorbisenc, LAME) are the gold standard for their respective formats — no alternative implementation produces higher quality output for any of the three encoded formats.
- Good, because WASM execution provides near-native encoding speed, enabling batch export of large playlists without excessive wait times.
- Good, because each encoder is lazy-loaded as a separate WASM module via dynamic `import()` — users only download the encoder for the format they actually export to.
- Good, because the Emscripten compilation is handled by community package maintainers, not the project build pipeline — the project's WASM toolchain remains Rust-only (wasm-pack).
- Good, because all three encoded formats (FLAC, OGG Vorbis, MP3) follow the same architectural pattern ("reference C encoder compiled to WASM"), providing consistency across format adapters despite using separate packages.
- Good, because Vorbis comments (FLAC, OGG) and ID3v2 (MP3) metadata embedding is supported by the reference encoders, enabling seamless SPC tag preservation in exported files.
- Good, because WAV encoding adds zero external dependencies and minimal code.
- Bad, because three separate WASM modules (FLAC, Vorbis, MP3) are additional download overhead — estimated 200–500 KB gzipped per module, totaling 600–1500 KB for all three. Lazy-loading limits this to per-format cost, and Service Worker caching eliminates repeat-download cost.
- Bad, because pre-compiled WASM packages may have suboptimal compilation settings (missing SIMD optimizations, non-ideal optimization flags, unnecessary exported functions) that the project cannot control without forking the package.
- Bad, because community-maintained Emscripten ports may lag behind upstream C library releases or become unmaintained, creating a dependency risk that requires monitoring.
- Bad, because LAME's LGPL-2.1 license requires the MP3 encoder module to remain a separate, independently replaceable component — it cannot be bundled into or tree-shaken with the main application code.
- Bad, because TypeScript type definitions may be incomplete or missing for some packages, requiring `.d.ts` declaration files to be authored and maintained by the project.
- Bad, because each pre-compiled package has its own API surface, initialization sequence, and memory management conventions, requiring per-format adapter code rather than a single unified interface.

### Confirmation

1. **Library evaluation** — for each selected package, verify: (a) the npm package has been published within the last 18 months or the upstream C source is stable with no critical unfixed bugs, (b) the WASM build functions correctly in a Web Worker context (not just the main thread), (c) the package's exports are importable via dynamic `import()` for lazy-loading, and (d) the license is as documented.
2. **Encoding fidelity** — for each format, encode a reference PCM buffer (1 kHz sine wave at 44.1 kHz, 16-bit stereo, 10 seconds) and decode the output with a known-good decoder (e.g., ffmpeg). Verify bit-perfect round-trip for lossless formats (WAV, FLAC). For lossy formats, verify spectral fidelity: the decoded output should show a clean 1 kHz peak with no unexpected harmonic distortion, and total harmonic distortion + noise (THD+N) should be within the encoder's published specifications for the configured quality level.
3. **Metadata verification** — export a file with metadata fields populated from a test SPC file's ID666 tags (title, artist, game, dumper, comments). Read the exported file's metadata with an independent tool (ffprobe, mutagen, or MediaInfo) and verify all fields are present, correctly encoded, and use the correct character encoding (UTF-8).
4. **Performance benchmark** — measure encoding throughput (samples per second) for each format in a Web Worker on desktop Chrome. Target: faster than 10× real-time for all formats at 48 kHz stereo (i.e., a 3-minute track encodes in under 18 seconds). Benchmark at each configurable sample rate (32k, 44.1k, 48k, 96k).
5. **Bundle size audit** — measure the gzipped transfer size of each lazy-loaded encoder WASM module. Document sizes and confirm they are individually under 500 KB gzipped.
6. **Streaming encoding test** — verify that each encoder supports processing PCM data in chunks of configurable size (e.g., 4096 samples), not requiring the entire PCM buffer in memory simultaneously. If a library does not support streaming, document the maximum practical export duration at each sample rate given browser memory constraints (typically 2–4 GB for a Web Worker's ArrayBuffer allocation).

## Pros and Cons of the Options

### Option 1: Unified Rust/WASM Encoder Pipeline

All encoders are implemented in pure Rust or wrapped via Rust FFI (`-sys` crates binding to C libraries), then compiled to `wasm32-unknown-unknown` via wasm-pack alongside the DSP emulation core. This maximizes build pipeline consistency with the existing Rust toolchain established in ADR-0001.

- Good, because a single build toolchain (Rust + wasm-pack) would produce all WASM artifacts — no Emscripten, no polyglot build complexity.
- Good, because Rust's type system and memory safety guarantees would apply to encoder bindings, reducing the risk of memory corruption in encoder interop code.
- Good, because encoder WASM output could potentially share linear memory with the DSP core and resampler, eliminating buffer copies between emulation and encoding.
- Bad, because **no production-quality pure Rust encoder exists for FLAC, Vorbis, or MP3**. The Rust audio ecosystem has mature decoders (claxon for FLAC, lewton for Vorbis, minimp3 bindings for MP3) but no encoders. Building production-quality encoders in Rust would be a months-to-years effort per codec — each reference encoder (libFLAC, libvorbisenc, LAME) represents decades of development, optimization, and psychoacoustic tuning by domain experts.
- Bad, because wrapping C reference encoders via Rust `-sys` crates (e.g., `flac-sys`, `lame-sys`) requires cross-compiling C source to `wasm32-unknown-unknown`. Standard `-sys` crate build scripts use the `cc` crate, which expects a native C toolchain — compiling to WASM requires Emscripten as the C compiler. This means the "unified Rust" approach still requires Emscripten, but adds Rust FFI wrapper complexity (unsafe blocks, manual memory management across the FFI boundary, bindgen configuration) on top — worse than using Emscripten directly.
- Bad, because Rust FFI wrappers around C encoder libraries for WASM targets are a niche use case with minimal community precedent, increasing the risk of encountering undocumented interop issues.

### Option 2: Pre-Compiled WASM Libraries (Emscripten Ports of C Reference Encoders)

Use community-maintained npm packages that ship pre-compiled WASM builds of the C reference encoders (libFLAC, libvorbisenc, LAME). The packages are consumed as runtime dependencies, not build dependencies — no Emscripten installation is required in the project's development or CI environment.

**Per-format library evaluation:**

**FLAC — libflac.js (recommended):**
- Good, because it provides the Xiph reference libFLAC encoder — the definitive FLAC implementation — compiled to WASM with full feature support including streaming encoding and compression levels 0–8.
- Good, because Vorbis comment metadata is natively supported through the libFLAC API.
- Good, because BSD-3-Clause license is fully permissive with no copyleft restrictions.
- Neutral, because the WASM binary size is moderate (~200–300 KB gzipped), acceptable for a lazy-loaded module.
- Bad, because the npm package ecosystem for libFLAC WASM ports is fragmented — multiple packages exist with varying maintenance levels, requiring careful evaluation of which fork is most actively maintained.

**FLAC — flac.js (rejected — evaluated under Option 4):**
A pure JavaScript FLAC encoder. Rejected in favor of the WASM reference encoder due to ~5–20× slower encoding performance. See Option 4 analysis.

**FLAC — Rust FLAC encoder (rejected — evaluated under Option 1):**
No production-quality pure Rust FLAC encoder exists. See Option 1 analysis.

**OGG Vorbis — ogg-vorbis-encoder-wasm (recommended):**
- Good, because it provides the Xiph reference libvorbisenc — the only production-quality Vorbis encoder — compiled to WASM with quality-based VBR support (quality -1 to 10).
- Good, because Vorbis comments are the native metadata format for OGG containers, requiring no additional metadata library.
- Good, because the Xiph BSD-like license is fully permissive.
- Bad, because the Vorbis encoder WASM port ecosystem has fewer maintained packages than FLAC or MP3, with some packages last updated several years ago. The underlying C encoder is stable (last major release 2018), so staleness in npm packaging is less concerning than it would be for a rapidly evolving library, but it still creates risk.

**OGG Vorbis — Rust lewton/vorbis (not viable):**
- Bad, because lewton is a Vorbis **decoder** only. It cannot encode audio to Vorbis format. There is no pure Rust Vorbis encoder implementation. This option is technically non-viable and cannot be further evaluated.

**OGG Vorbis — stb_vorbis compiled to WASM (not viable):**
- Bad, because stb_vorbis (Sean Barrett's single-file C library) is a Vorbis **decoder** only. It was designed for game engines that need to decode OGG audio, not encode it. This option is technically non-viable and cannot be further evaluated.

**MP3 — lame-wasm (recommended):**
- Good, because LAME is the de facto reference MP3 encoder, producing the highest-quality MP3 output of any open-source encoder across all bitrate modes (CBR, VBR, ABR).
- Good, because WASM compilation provides near-native encoding speed — critical for batch export of large playlists.
- Good, because ID3v2 tag support is available through the LAME API or can be implemented independently via a lightweight ID3v2 header generator in TypeScript.
- Neutral, because the LGPL-2.1 license is more restrictive than BSD but is satisfied by loading LAME as a separate, replaceable WASM module (see "LGPL-2.1 Compliance" below).
- Bad, because the lame-wasm npm ecosystem is fragmented, with multiple packages of varying quality and maintenance status. Evaluation must verify the specific package builds correctly in Web Worker contexts.

**MP3 — lamejs (rejected — evaluated under Option 4):**
A pure JavaScript port of LAME. Rejected in favor of the WASM-compiled LAME due to ~5–10× slower encoding speed and maintenance concerns. See Option 4 analysis.

**MP3 — Rust mp3lame-encoder (rejected — evaluated under Option 1):**
Uses LAME via Rust FFI bindings. Rejected because it adds Rust FFI wrapper complexity over a direct Emscripten compilation of LAME without improving encoding quality or performance. See Option 1 analysis.

**Overall Option 2 evaluation:**
- Good, because the reference C encoders are the highest-quality implementations for all three encoded formats — they define the quality standard that all other implementations are measured against.
- Good, because WASM compilation preserves the near-native performance characteristics of the C implementations.
- Good, because pre-compiled packages require no Emscripten installation in the project's build pipeline.
- Good, because each encoder is a separate module enabling per-format lazy-loading.
- Neutral, because TypeScript types vary by package — some include type definitions, others require community `@types` packages or project-maintained `.d.ts` declarations.
- Bad, because the project depends on community maintainers to keep pre-compiled packages current and functional.
- Bad, because LAME's LGPL-2.1 imposes a structural constraint on how the MP3 encoder is bundled and distributed.
- Bad, because each package has a different API surface, requiring per-format adapter code.

### Option 3: Self-Compiled C Reference Encoders via Emscripten

Add Emscripten (emcc/em++) to the project's build toolchain and compile libFLAC, libvorbisenc, and LAME from their upstream C source with custom WASM bindings, optimization flags, and exported function lists.

- Good, because full control over WASM compilation settings (optimization level, SIMD, feature flags, stack size, exported functions) enables optimal binary size and performance tuned for the project's exact needs.
- Good, because custom JavaScript/TypeScript bindings can be designed for the project's streaming encoding API — no need to work around pre-compiled packages' API limitations.
- Good, because the project pins to specific upstream C encoder releases, eliminating dependency on npm package maintainers.
- Good, because unused encoder features can be stripped at compile time via preprocessor flags, minimizing WASM binary size.
- Good, because the reference C encoders provide the highest quality output, same as Option 2.
- Bad, because Emscripten becomes a required build-time dependency alongside the Rust toolchain, creating a dual-WASM-toolchain build pipeline that increases CI complexity, build times, and contributor onboarding friction.
- Bad, because maintaining Emscripten build scripts (Makefile patches, emcc flags, `-s EXPORTED_FUNCTIONS` lists, `-s EXPORTED_RUNTIME_METHODS` configuration) for three separate C libraries is significant ongoing effort that compounds with Emscripten version upgrades.
- Bad, because Emscripten version upgrades can introduce breaking changes in the generated WASM bindings layer, creating a class of CI failures entirely unrelated to the project's own code.
- Bad, because the marginal benefit over well-maintained pre-compiled packages (slightly smaller binaries, custom export lists) may not justify the permanent build complexity overhead.

### Option 4: Pure JavaScript Encoder Libraries

Use JavaScript-only encoder implementations for all formats — no WASM modules, no C code compilation, no additional toolchain dependencies.

**Per-format library evaluation:**

**FLAC — flac.js (pure JavaScript):**
- Good, because it is a standard JavaScript module that can be bundled, tree-shaken, and minified using the existing Vite pipeline with no special configuration.
- Good, because debugging uses standard JavaScript source maps — no WASM binary inspection required.
- Bad, because encoding performance is ~5–20× slower than the WASM-compiled reference encoder, making batch export of long playlists at high sample rates (96 kHz) impractically slow.
- Bad, because the implementation is a manual JS translation of the FLAC algorithm, not a port of the reference encoder — subtle algorithmic differences may produce non-identical output compared to libFLAC, though output should still be spec-compliant.
- Bad, because maintenance is sporadic with long gaps between updates.

**OGG Vorbis — no viable pure JavaScript encoder:**
- Bad, because no production-quality pure JavaScript Vorbis encoder exists. The few attempts (partial ports, academic demos) are incomplete, unmaintained, or produce non-compliant output. **This gap alone makes Option 4 non-viable for the full required format matrix.**

**MP3 — lamejs (pure JavaScript port of LAME):**
- Good, because it is the most widely deployed browser-based MP3 encoder, with significant real-world usage demonstrating basic reliability.
- Good, because it requires no WASM — standard JavaScript importable as an npm package.
- Good, because it includes basic ID3v2 tag writing support.
- Bad, because encoding speed is ~5–10× slower than WASM-compiled LAME, significantly impacting batch export performance.
- Bad, because the project has had no meaningful maintenance since 2017 — known bugs in VBR mode remain unfixed, and the codebase does not track LAME upstream improvements from the last 8+ years.
- Bad, because the code is a manual line-by-line JavaScript translation of C, resulting in non-idiomatic JavaScript that is difficult to debug, audit, or extend.
- Bad, because it lacks TypeScript type definitions (community `@types/lamejs` exists but may be incomplete).

**Overall Option 4 evaluation:**
- Good, because no WASM modules or compilation toolchains are needed — encoders are standard JavaScript consumed like any npm dependency.
- Good, because bundle analysis, tree-shaking, and source-map debugging use the existing JavaScript tooling without special WASM considerations.
- Bad, because **no pure JavaScript Vorbis encoder exists at production quality**, making Option 4 fundamentally non-viable for the required four-format export matrix.
- Bad, because JavaScript encoding is 5–20× slower than WASM for computationally intensive codecs, making batch export of large playlists impractical — a 3-minute track that encodes in 2 seconds via WASM could take 10–40 seconds in pure JS, compounding across a 50-track playlist to minutes of wall-clock time.
- Bad, because pure JS encoder libraries are unmaintained one-person ports that diverge from the reference encoder behavior over time, risking subtle audio quality regressions with no upstream fix path.

## More Information

### Metadata Embedding Strategy

Each export format uses a different metadata container. SPC ID666 and xid6 tag fields are mapped to format-native metadata:

| Format | Metadata System | ID666 Field Mapping |
| ------ | --------------- | ------------------- |
| WAV | RIFF LIST/INFO chunk | INAM=title, IART=artist, IPRD=game, ICMT=comment |
| FLAC | Vorbis comments (metadata block) | TITLE, ARTIST, ALBUM=game, COMMENT, DATE |
| OGG Vorbis | Vorbis comments (stream header) | TITLE, ARTIST, ALBUM=game, COMMENT, DATE |
| MP3 | ID3v2 tags (prepended header) | TIT2=title, TPE1=artist, TALB=game, COMM=comment |

All exported files include a comment field: `"Exported by SPC Player — original dump by {dumper}"` (where the dumper field comes from the SPC ID666 tag). If the SPC file has xid6 extended tags with additional fields (publisher, OST title, disc number), these are mapped to the appropriate format-native equivalents where supported.

For MP3, if the WASM-compiled LAME does not expose ID3v2 tag-writing functions through its JavaScript bindings, ID3v2 tags can be constructed independently in TypeScript and prepended to the encoded MP3 data. The ID3v2 header specification is well-documented, and prepending a tag header to an MP3 stream is the standard ID3v2 embedding mechanism — the tag is simply a binary prefix that MP3 decoders skip when seeking the first sync word.

### Encoder Adapter Architecture

Each encoder library has a distinct API, initialization sequence, and memory management model. A common `AudioEncoder` adapter interface normalizes them for the export pipeline:

```typescript
interface AudioEncoder {
  readonly format: ExportFormat;
  init(config: EncoderConfig): Promise<void>;
  encode(samples: Int16Array, channels: number): Promise<void>;
  finalize(): Promise<Blob>;
  cancel(): void;
}

interface EncoderConfig {
  sampleRate: number;
  channels: 1 | 2;
  bitDepth: 16;
  quality?: number;          // Lossy: VBR quality (Vorbis -1–10, LAME V0–V9)
  compressionLevel?: number; // FLAC: 0–8
  metadata?: ExportMetadata;
}
```

Each format-specific adapter wraps the underlying WASM library behind this interface. The export pipeline uses `AudioEncoder` exclusively, isolating format-specific API details within the adapter modules. Lazy-loading is implemented via dynamic `import()` in each adapter's factory function — the WASM module is fetched and instantiated only when the user first exports to that format, then cached in the Web Worker's module registry for subsequent exports.

### Default Encoding Parameters

| Format | Default Setting | Approximate Output Size |
| ------ | --------------- | ----------------------- |
| WAV | 16-bit PCM | ~10 MB/min at 48 kHz stereo |
| FLAC | Compression level 5 | ~5 MB/min at 48 kHz stereo |
| OGG Vorbis | Quality 6 (~192 kbps VBR) | ~1.4 MB/min |
| MP3 | V2 (~190 kbps VBR) | ~1.4 MB/min |

Users can adjust quality/compression settings in the export dialog. Higher FLAC compression levels (6–8) reduce file size at the cost of slower encoding. Higher Vorbis/MP3 quality settings increase bitrate and file size but improve perceptual audio quality, though the difference is subtle above Quality 6 / V2 for typical SPC content (limited to the S-DSP's ~16 kHz bandwidth).

### LGPL-2.1 Compliance for LAME

LAME is licensed under LGPL-2.1. The LGPL permits use in non-LGPL applications provided the LGPL component is dynamically linked — meaning the user must be able to replace the LGPL component with a modified version. Loading LAME as a separate, dynamically-imported WASM module satisfies this requirement:

1. The LAME WASM module is loaded at runtime via dynamic `import()`, not statically linked or bundled into the application's JavaScript.
2. The WASM module is distributed as a separate file (`.wasm` + loader `.js`) that can be independently replaced by the user with a modified or recompiled version.
3. The `AudioEncoder` adapter interface provides a clean abstraction boundary — any LAME-compatible WASM module exposing the expected function exports can substitute the default module.
4. The LAME WASM module, its LGPL-2.1 license text, and attribution notice are distributed alongside the application.

This is functionally equivalent to dynamic linking, which the LGPL explicitly permits without copyleft propagation to the calling application.

### Why Not a Unified Rust Approach?

The Rust audio codec ecosystem has mature **decoders** but immature or nonexistent **encoders**:

| Codec | Rust Decoder | Rust Encoder |
| ----- | ------------ | ------------ |
| FLAC | claxon (mature, maintained) | None at production quality |
| Vorbis | lewton (mature, maintained) | None — lewton is decoder-only |
| MP3 | minimp3 bindings (mature) | None at production quality |

Writing production-quality encoders for three codecs would be a massive engineering effort. Each reference C encoder represents years to decades of development:
- **libFLAC**: developed since 2001, maintained by Xiph.Org Foundation
- **libvorbisenc**: developed since 1998, the only Vorbis encoder with fully tuned psychoacoustic models
- **LAME**: developed since 1998, with extensive psychoacoustic tuning informed by decades of listening tests and ABX comparisons

Reimplementing any one of these in Rust to production quality — matching the reference encoder's output fidelity and handling all edge cases — would be a multi-month effort requiring deep domain expertise in audio codec design. Doing it for all three is unreasonable given that the C reference implementations can be compiled to WASM and used directly.

The Rust `-sys` crate approach (wrapping C libraries via FFI) does not simplify the WASM story: compiling C code to `wasm32-unknown-unknown` through Rust's `cc` crate requires a C-to-WASM compiler, which is Emscripten. This means the "unified Rust" approach would still require Emscripten but with additional complexity from Rust FFI bindings (`unsafe` blocks, manual memory management across the FFI boundary, `bindgen` configuration, and `wasm-bindgen` interop layers).

### Library Risk Mitigation

If a pre-compiled WASM encoder package becomes unmaintained, has critical bugs, or is removed from npm:

1. **Fork and recompile**: The upstream C source code (libFLAC, libvorbisenc, LAME) is stable, widely available, and well-documented. A one-time Emscripten compilation from source is feasible without adopting Emscripten as a permanent build dependency — the resulting WASM module can be committed to the repository as a vendored artifact.
2. **Alternative packages**: The npm ecosystem typically has multiple packages wrapping the same reference C encoder. If one maintainer abandons their package, alternatives likely exist or can be found via search.
3. **Graceful degradation**: If a specific encoder becomes non-viable, the export menu can disable that format while offering alternatives. WAV is always available as a lossless fallback with zero external dependencies.

### Related Decisions

- [ADR-0001](0001-snes-audio-emulation-library.md) — establishes the Rust/wasm-pack toolchain for the DSP emulation core. This ADR decides not to extend that toolchain to encoder libraries, because the Rust ecosystem lacks production-quality encoder implementations for the required codecs.
- [ADR-0003](0003-audio-pipeline-architecture.md) — defines the dual-path audio pipeline. The export path produces resampled PCM at the target sample rate via windowed sinc resampling in WASM, applies TPDF dithering (float32 → int16), and hands Int16Array data to the encoders selected by this ADR. The encoder operates downstream of the resampler and dithering stage.
- [ADR-0007](0007-wasm-build-pipeline.md) — WASM build pipeline for project-authored Rust code, which coexists with the pre-compiled encoder WASM modules selected here.
