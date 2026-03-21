/**
 * Minimal WebM/EBML container muxer for wrapping Opus-encoded audio.
 *
 * WebM is a subset of Matroska (MKV). This muxer produces a valid WebM file
 * containing a single Opus audio track. It writes EBML header, Segment,
 * Tracks, and Cluster elements with SimpleBlock entries.
 *
 * @see https://www.matroska.org/technical/elements.html
 * @see https://www.webmproject.org/docs/container/
 * @see https://datatracker.ietf.org/doc/html/rfc7845 (Opus in WebM/Matroska)
 */

// ---------------------------------------------------------------------------
// EBML Element IDs (big-endian, variable-length VINT)
// ---------------------------------------------------------------------------

/** EBML header element. */
const EBML_ID = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
/** EBML version field. */
const EBML_VERSION_ID = new Uint8Array([0x42, 0x86]);
/** EBML read version field. */
const EBML_READ_VERSION_ID = new Uint8Array([0x42, 0xf7]);
/** EBML max ID length field. */
const EBML_MAX_ID_LENGTH_ID = new Uint8Array([0x42, 0xf2]);
/** EBML max size length field. */
const EBML_MAX_SIZE_LENGTH_ID = new Uint8Array([0x42, 0xf3]);
/** EBML DocType field. */
const EBML_DOCTYPE_ID = new Uint8Array([0x42, 0x82]);
/** EBML DocType version field. */
const EBML_DOCTYPE_VERSION_ID = new Uint8Array([0x42, 0x87]);
/** EBML DocType read version field. */
const EBML_DOCTYPE_READ_VERSION_ID = new Uint8Array([0x42, 0x85]);

/** Segment element. */
const SEGMENT_ID = new Uint8Array([0x18, 0x53, 0x80, 0x67]);
/** Tracks element. */
const TRACKS_ID = new Uint8Array([0x16, 0x54, 0xae, 0x6b]);
/** TrackEntry element. */
const TRACK_ENTRY_ID = new Uint8Array([0xae]);
/** TrackNumber field. */
const TRACK_NUMBER_ID = new Uint8Array([0xd7]);
/** TrackUID field. */
const TRACK_UID_ID = new Uint8Array([0x73, 0xc5]);
/** TrackType field. */
const TRACK_TYPE_ID = new Uint8Array([0x83]);
/** CodecID field. */
const CODEC_ID_ID = new Uint8Array([0x86]);
/** CodecPrivate field. */
const CODEC_PRIVATE_ID = new Uint8Array([0x63, 0xa2]);
/** Audio element. */
const AUDIO_ID = new Uint8Array([0xe1]);
/** SamplingFrequency field. */
const SAMPLING_FREQUENCY_ID = new Uint8Array([0xb5]);
/** Channels field. */
const CHANNELS_ID = new Uint8Array([0x9f]);
/** BitDepth field. */
const BIT_DEPTH_ID = new Uint8Array([0x62, 0x64]);

/** Cluster element. */
const CLUSTER_ID = new Uint8Array([0x1f, 0x43, 0xb6, 0x75]);
/** Cluster Timestamp field. */
const CLUSTER_TIMESTAMP_ID = new Uint8Array([0xe7]);
/** SimpleBlock element. */
const SIMPLE_BLOCK_ID = new Uint8Array([0xa3]);

/** Segment Info element. */
const INFO_ID = new Uint8Array([0x15, 0x49, 0xa9, 0x66]);
/** TimestampScale field (nanoseconds per tick). */
const TIMESTAMP_SCALE_ID = new Uint8Array([0x2a, 0xd7, 0xb1]);
/** MuxingApp field. */
const MUXING_APP_ID = new Uint8Array([0x4d, 0x80]);
/** WritingApp field. */
const WRITING_APP_ID = new Uint8Array([0x57, 0x41]);
/** Duration field. */
const DURATION_ID = new Uint8Array([0x44, 0x89]);

// ---------------------------------------------------------------------------
// EBML encoding utilities
// ---------------------------------------------------------------------------

/** Encode a VINT (variable-length unsigned integer) for EBML element sizes. */
export function encodeVint(value: number): Uint8Array {
  if (value < 0x7f) {
    return new Uint8Array([0x80 | value]);
  }
  if (value < 0x3fff) {
    return new Uint8Array([0x40 | (value >> 8), value & 0xff]);
  }
  if (value < 0x1fffff) {
    return new Uint8Array([
      0x20 | (value >> 16),
      (value >> 8) & 0xff,
      value & 0xff,
    ]);
  }
  if (value < 0x0fffffff) {
    return new Uint8Array([
      0x10 | (value >> 24),
      (value >> 16) & 0xff,
      (value >> 8) & 0xff,
      value & 0xff,
    ]);
  }
  // For very large values, use 8-byte VINT.
  // This handles segment sizes up to ~256 TB, more than sufficient.
  const buf = new Uint8Array(8);
  buf[0] = 0x01;
  buf[1] = (value / 0x1000000000000) & 0xff;
  buf[2] = (value / 0x10000000000) & 0xff;
  buf[3] = (value / 0x100000000) & 0xff;
  buf[4] = (value >> 24) & 0xff;
  buf[5] = (value >> 16) & 0xff;
  buf[6] = (value >> 8) & 0xff;
  buf[7] = value & 0xff;
  return buf;
}

/** Encode a UTF-8 string to bytes. */
function encodeUtf8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/** Encode an unsigned integer to big-endian bytes (variable width). */
function encodeUint(value: number): Uint8Array {
  if (value === 0) return new Uint8Array([0]);
  const bytes: number[] = [];
  let v = value;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v = Math.floor(v / 256);
  }
  return new Uint8Array(bytes);
}

/** Encode a float64 to 8 bytes big-endian. */
function encodeFloat64(value: number): Uint8Array {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, value, false);
  return new Uint8Array(buf);
}

/** Encode a float64 to 4 bytes big-endian (float32). */
function encodeFloat32(value: number): Uint8Array {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setFloat32(0, value, false);
  return new Uint8Array(buf);
}

/** Build an EBML element: ID + size VINT + data. */
function ebmlElement(id: Uint8Array, data: Uint8Array): Uint8Array {
  const size = encodeVint(data.length);
  const result = new Uint8Array(id.length + size.length + data.length);
  result.set(id, 0);
  result.set(size, id.length);
  result.set(data, id.length + size.length);
  return result;
}

/** Build an EBML element containing a uint value. */
function ebmlUintElement(id: Uint8Array, value: number): Uint8Array {
  return ebmlElement(id, encodeUint(value));
}

/** Build an EBML element containing a UTF-8 string. */
function ebmlStringElement(id: Uint8Array, value: string): Uint8Array {
  return ebmlElement(id, encodeUtf8(value));
}

/** Build an EBML element containing a float64. */
function ebmlFloat64Element(id: Uint8Array, value: number): Uint8Array {
  return ebmlElement(id, encodeFloat64(value));
}

/** Build an EBML element containing a float32. */
function ebmlFloat32Element(id: Uint8Array, value: number): Uint8Array {
  return ebmlElement(id, encodeFloat32(value));
}

/** Concatenate multiple Uint8Arrays. */
function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  let totalLength = 0;
  for (const arr of arrays) totalLength += arr.length;
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Opus CodecPrivate (OpusHead)
// ---------------------------------------------------------------------------

/**
 * Build Opus identification header (OpusHead) for use as CodecPrivate.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc7845#section-5.1
 */
export function buildOpusHead(
  sampleRate: number,
  channels: number,
): Uint8Array {
  const head = new Uint8Array(19);
  const view = new DataView(head.buffer);

  // Magic signature "OpusHead"
  const sig = encodeUtf8('OpusHead');
  head.set(sig, 0);

  // Version (must be 1)
  head[8] = 1;

  // Channel count
  head[9] = channels;

  // Pre-skip (samples at 48kHz) — standard Opus pre-skip of 3840 samples
  view.setUint16(10, 3840, true); // little-endian

  // Input sample rate (informational, little-endian)
  view.setUint32(12, sampleRate, true);

  // Output gain (0 dB, little-endian)
  view.setInt16(16, 0, true);

  // Channel mapping family (0 = mono/stereo, no mapping table)
  head[18] = 0;

  return head;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** An encoded audio frame with its timestamp. */
export interface OpusFrame {
  /** Raw Opus frame data. */
  readonly data: Uint8Array;
  /** Timestamp in microseconds. */
  readonly timestampUs: number;
  /** Duration in microseconds. */
  readonly durationUs: number;
}

/** WebM muxer configuration. */
export interface WebmMuxerConfig {
  readonly sampleRate: number;
  readonly channels: number;
  /** Total duration in milliseconds (optional, for the Segment Info). */
  readonly durationMs?: number;
}

/**
 * Mux Opus frames into a WebM container.
 *
 * Produces a complete WebM file with EBML header, Segment Info, Tracks,
 * and Cluster elements containing SimpleBlocks.
 *
 * @param frames - Encoded Opus frames with timestamps.
 * @param config - Muxer configuration.
 * @returns Complete WebM file as Uint8Array.
 */
export function muxOpusWebm(
  frames: readonly OpusFrame[],
  config: WebmMuxerConfig,
): Uint8Array {
  // --- EBML Header ---
  const ebmlHeader = ebmlElement(
    EBML_ID,
    concatBytes(
      ebmlUintElement(EBML_VERSION_ID, 1),
      ebmlUintElement(EBML_READ_VERSION_ID, 1),
      ebmlUintElement(EBML_MAX_ID_LENGTH_ID, 4),
      ebmlUintElement(EBML_MAX_SIZE_LENGTH_ID, 8),
      ebmlStringElement(EBML_DOCTYPE_ID, 'webm'),
      ebmlUintElement(EBML_DOCTYPE_VERSION_ID, 4),
      ebmlUintElement(EBML_DOCTYPE_READ_VERSION_ID, 2),
    ),
  );

  // --- Segment Info ---
  const infoChildren = concatBytes(
    // TimestampScale: 1_000_000 ns = 1 ms per tick (standard for WebM)
    ebmlUintElement(TIMESTAMP_SCALE_ID, 1_000_000),
    ebmlStringElement(MUXING_APP_ID, 'SPC Player'),
    ebmlStringElement(WRITING_APP_ID, 'SPC Player'),
    ...(config.durationMs != null
      ? [ebmlFloat64Element(DURATION_ID, config.durationMs)]
      : []),
  );
  const info = ebmlElement(INFO_ID, infoChildren);

  // --- Tracks ---
  const opusHead = buildOpusHead(config.sampleRate, config.channels);

  const audioElement = ebmlElement(
    AUDIO_ID,
    concatBytes(
      // Opus always resamples internally to 48kHz; WebM spec requires 48000 here
      ebmlFloat32Element(SAMPLING_FREQUENCY_ID, 48000),
      ebmlUintElement(CHANNELS_ID, config.channels),
      ebmlUintElement(BIT_DEPTH_ID, 32),
    ),
  );

  const trackEntry = ebmlElement(
    TRACK_ENTRY_ID,
    concatBytes(
      ebmlUintElement(TRACK_NUMBER_ID, 1),
      ebmlUintElement(TRACK_UID_ID, 1),
      ebmlUintElement(TRACK_TYPE_ID, 2), // 2 = audio
      ebmlStringElement(CODEC_ID_ID, 'A_OPUS'),
      ebmlElement(CODEC_PRIVATE_ID, opusHead),
      audioElement,
    ),
  );

  const tracks = ebmlElement(TRACKS_ID, trackEntry);

  // --- Clusters ---
  // Group frames into clusters, each starting at a keyframe.
  // For audio-only WebM, we use a single cluster for simplicity
  // (most exported files are < 10 min).
  const clusterData = buildCluster(frames);

  // --- Segment ---
  // Segment uses unknown size since we build it all in memory anyway.
  const segmentPayload = concatBytes(info, tracks, clusterData);
  const segmentHeader = concatBytes(
    SEGMENT_ID,
    encodeVint(segmentPayload.length),
  );

  return concatBytes(ebmlHeader, segmentHeader, segmentPayload);
}

/**
 * Build a Cluster element containing all frames as SimpleBlocks.
 * For longer audio, multiple clusters could be used (every ~5s), but
 * a single cluster works for typical SPC exports (< 10 min).
 */
function buildCluster(frames: readonly OpusFrame[]): Uint8Array {
  if (frames.length === 0) {
    return new Uint8Array(0);
  }

  // Cluster timestamp is the timestamp of the first frame (in ms).
  const clusterTimestampMs = Math.floor(frames[0].timestampUs / 1000);

  const blocks: Uint8Array[] = [];

  for (const frame of frames) {
    const blockTimestampMs =
      Math.floor(frame.timestampUs / 1000) - clusterTimestampMs;
    const block = buildSimpleBlock(1, blockTimestampMs, frame.data);
    blocks.push(ebmlElement(SIMPLE_BLOCK_ID, block));
  }

  const clusterPayload = concatBytes(
    ebmlUintElement(CLUSTER_TIMESTAMP_ID, clusterTimestampMs),
    ...blocks,
  );

  return ebmlElement(CLUSTER_ID, clusterPayload);
}

/**
 * Build a SimpleBlock payload (without the element ID/size).
 *
 * SimpleBlock layout:
 * - Track number (VINT)
 * - Relative timestamp (int16 big-endian, ms offset from cluster timestamp)
 * - Flags (1 byte): bit 0 = keyframe
 * - Frame data
 */
export function buildSimpleBlock(
  trackNumber: number,
  relativeTimestampMs: number,
  frameData: Uint8Array,
): Uint8Array {
  const trackVint = encodeVint(trackNumber);
  // Clamp timestamp to int16 range
  const ts = Math.max(-32768, Math.min(32767, relativeTimestampMs));

  const result = new Uint8Array(trackVint.length + 2 + 1 + frameData.length);
  result.set(trackVint, 0);
  let offset = trackVint.length;

  // Relative timestamp (int16 big-endian)
  result[offset] = (ts >> 8) & 0xff;
  result[offset + 1] = ts & 0xff;
  offset += 2;

  // Flags: keyframe (0x80) — all Opus frames are keyframes
  result[offset] = 0x80;
  offset += 1;

  // Frame data
  result.set(frameData, offset);

  return result;
}
