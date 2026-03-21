/**
 * FLAC encoder adapter wrapping libflac.js (Emscripten port of libFLAC).
 *
 * Lazy-loaded via dynamic import() in the export worker.
 * Produces FLAC files with Vorbis comment metadata.
 *
 * @see docs/design/export-pipeline.md §6
 * @see docs/adr/0006-audio-codec-libraries.md
 */

import type { Encoder, EncoderConfig, ExportMetadata } from './encoder-types';

// ---------------------------------------------------------------------------
// libflac.js type declarations (subset used by this adapter)
// ---------------------------------------------------------------------------

/**
 * libflac.js encoder handle (opaque integer returned by create_libflac_encoder).
 * Using `number` because the WASM interop returns opaque integer handles.
 */
type FlacEncoderHandle = number;

/** Minimal type surface for the libflac.js module. */
interface LibFlac {
  create_libflac_encoder(
    sampleRate: number,
    channels: number,
    bitsPerSample: number,
    compressionLevel: number,
    totalSamples?: number,
    isVerify?: boolean,
  ): FlacEncoderHandle;

  init_encoder_stream(
    encoder: FlacEncoderHandle,
    writeCallback: (
      buffer: Uint8Array,
      bytes: number,
      samples: number,
      currentFrame: number,
    ) => void,
    metadataCallback?: ((metadata: unknown) => void) | null,
    clientData?: unknown,
  ): number;

  FLAC__stream_encoder_set_metadata(
    encoder: FlacEncoderHandle,
    metadataArray: unknown[],
  ): boolean;

  FLAC__metadata_object_vorbiscomment_entry_new(
    field: string,
    value: string,
  ): unknown;

  FLAC__metadata_object_new(type: number): unknown;

  FLAC__metadata_object_vorbiscomment_append_comment(
    metadata: unknown,
    entry: unknown,
  ): boolean;

  FLAC__stream_encoder_process_interleaved(
    encoder: FlacEncoderHandle,
    buffer: Int32Array,
    samples: number,
  ): boolean;

  FLAC__stream_encoder_finish(encoder: FlacEncoderHandle): boolean;
  FLAC__stream_encoder_delete(encoder: FlacEncoderHandle): void;

  ready?: boolean;
  onready?: () => void;

  /** FLAC metadata type constant for Vorbis comments. */
  FLAC__METADATA_TYPE_VORBIS_COMMENT: number;
}

// ---------------------------------------------------------------------------
// Module-level WASM singleton (cached after first load)
// ---------------------------------------------------------------------------

let libflacInstance: LibFlac | null = null;

async function loadLibFlac(): Promise<LibFlac> {
  if (libflacInstance) return libflacInstance;

  try {
    // Dynamic import — Vite code-splits this into a separate chunk.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WASM interop module has no published types
    const mod = (await import('libflacjs')) as any;
    const flac: LibFlac = mod.default ?? mod;

    // Some builds require waiting for the WASM to be ready.
    if (!flac.ready) {
      await new Promise<void>((resolve) => {
        flac.onready = resolve;
      });
    }

    libflacInstance = flac;
    return flac;
  } catch (cause) {
    throw new Error('FLAC encoder WASM module failed to load', { cause });
  }
}

// ---------------------------------------------------------------------------
// Vorbis comment builder
// ---------------------------------------------------------------------------

function applyVorbisComments(
  flac: LibFlac,
  encoder: FlacEncoderHandle,
  metadata: ExportMetadata,
): void {
  const comments: [string, string][] = [];

  if (metadata.title) comments.push(['TITLE', metadata.title]);
  if (metadata.artist) comments.push(['ARTIST', metadata.artist]);
  if (metadata.game) comments.push(['ALBUM', metadata.game]);
  if (metadata.comment) comments.push(['COMMENT', metadata.comment]);
  if (metadata.year) comments.push(['DATE', metadata.year]);
  if (metadata.trackNumber != null) {
    comments.push(['TRACKNUMBER', String(metadata.trackNumber)]);
  }

  if (comments.length === 0) return;

  const vcBlock = flac.FLAC__metadata_object_new(
    flac.FLAC__METADATA_TYPE_VORBIS_COMMENT,
  );
  for (const [field, value] of comments) {
    const entry = flac.FLAC__metadata_object_vorbiscomment_entry_new(
      field,
      value,
    );
    flac.FLAC__metadata_object_vorbiscomment_append_comment(vcBlock, entry);
  }

  flac.FLAC__stream_encoder_set_metadata(encoder, [vcBlock]);
}

// ---------------------------------------------------------------------------
// FlacEncoder class
// ---------------------------------------------------------------------------

/**
 * Create a new FLAC encoder instance.
 * @param injectedModule - Pre-loaded libflac module (for testing). If omitted, loads via dynamic import.
 */
export function createFlacEncoder(injectedModule?: LibFlac): Encoder {
  return new FlacEncoder(injectedModule);
}

/** FLAC encoder adapter implementing the streaming Encoder interface. */
export class FlacEncoder implements Encoder {
  private flac: LibFlac | null = null;
  private handle: FlacEncoderHandle | null = null;
  private config: EncoderConfig | null = null;
  private outputChunks: Uint8Array[] = [];
  private initialized = false;
  private readonly injectedModule: LibFlac | undefined;

  constructor(injectedModule?: LibFlac) {
    this.injectedModule = injectedModule;
  }

  async init(config: EncoderConfig): Promise<void> {
    this.config = config;
    this.outputChunks = [];
    this.initialized = false;

    const flac = this.injectedModule ?? (await loadLibFlac());
    this.flac = flac;

    const compression = config.compression ?? 5;

    const handle = flac.create_libflac_encoder(
      config.sampleRate,
      config.channels,
      config.bitsPerSample,
      compression,
      /* totalSamples */ 0,
      /* isVerify */ false,
    );

    if (!handle || handle === 0) {
      throw new Error('FLAC encoder: failed to create encoder instance');
    }

    this.handle = handle;

    // Apply Vorbis comment metadata before initializing the stream.
    if (config.metadata) {
      applyVorbisComments(flac, handle, config.metadata);
    }

    // Initialize the encoder stream with a write callback that collects output.
    const result = flac.init_encoder_stream(
      handle,
      (buffer: Uint8Array, bytes: number) => {
        this.outputChunks.push(new Uint8Array(buffer.subarray(0, bytes)));
      },
      null,
    );

    if (result !== 0) {
      flac.FLAC__stream_encoder_delete(handle);
      this.handle = null;
      throw new Error(
        `FLAC encoder: init_encoder_stream failed (code ${result})`,
      );
    }

    this.initialized = true;
  }

  encode(samples: Int16Array): void {
    if (!this.initialized || !this.flac || !this.handle || !this.config) {
      throw new Error('FlacEncoder: init() must be called before encode()');
    }

    // libflac.js expects Int32Array with interleaved samples.
    // Widen int16 → int32 (no precision loss).
    const int32 = new Int32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      int32[i] = samples[i];
    }

    const samplesPerChannel = samples.length / this.config.channels;
    const ok = this.flac.FLAC__stream_encoder_process_interleaved(
      this.handle,
      int32,
      samplesPerChannel,
    );

    if (!ok) {
      throw new Error(
        'FlacEncoder: encoding failed during process_interleaved',
      );
    }
  }

  finalize(): Uint8Array {
    if (!this.initialized || !this.flac || !this.handle) {
      throw new Error('FlacEncoder: init() must be called before finalize()');
    }

    this.flac.FLAC__stream_encoder_finish(this.handle);

    // Concatenate all output chunks into a single FLAC file.
    let totalLength = 0;
    for (const chunk of this.outputChunks) {
      totalLength += chunk.length;
    }

    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of this.outputChunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  dispose(): void {
    if (this.flac && this.handle) {
      this.flac.FLAC__stream_encoder_delete(this.handle);
    }
    this.handle = null;
    this.flac = null;
    this.config = null;
    this.outputChunks = [];
    this.initialized = false;
  }
}
