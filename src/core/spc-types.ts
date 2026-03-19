import type { SpcParseError, SpcParseWarning } from '@/types/errors';
import type { Result } from '@/types/result';

/** Complete parsed SPC file data. */
export interface SpcFile {
  /** Raw SPC700 64KB RAM. Transferred to WASM for emulation. */
  readonly ram: Uint8Array; // Always exactly 65,536 bytes

  /** DSP register snapshot (128 bytes). Transferred to WASM for emulation. */
  readonly dspRegisters: Uint8Array; // Always exactly 128 bytes

  /** IPL ROM (64 bytes). May be zero-filled if file was truncated. */
  readonly iplRom: Uint8Array; // Always exactly 64 bytes

  /** SPC700 CPU initial register state. */
  readonly cpuRegisters: SpcCpuRegisters;

  /** Parsed metadata from ID666 and xid6 tags. */
  readonly metadata: SpcMetadata;

  /** Default channel disable bitmask from header. */
  readonly defaultChannelDisables: number; // 0x00–0xFF, bit N = voice N disabled

  /** Parsing warnings encountered (non-fatal issues). */
  readonly warnings: readonly SpcParseWarning[];
}

/** SPC700 CPU register state as stored in the file header. */
export interface SpcCpuRegisters {
  readonly pc: number; // 16-bit program counter
  readonly a: number; // 8-bit accumulator
  readonly x: number; // 8-bit X index
  readonly y: number; // 8-bit Y index
  readonly sp: number; // 8-bit stack pointer
  readonly psw: number; // 8-bit processor status word
}

/** Merged metadata from ID666 and xid6 (xid6 overrides). */
export interface SpcMetadata {
  /** Song title. Empty string if not available. */
  readonly title: string;

  /** Game title. Empty string if not available. */
  readonly gameTitle: string;

  /** Artist/composer name. Empty string if not available. */
  readonly artist: string;

  /** Name of the person who dumped this SPC. Empty string if not available. */
  readonly dumperName: string;

  /** Comments. Empty string if not available. */
  readonly comments: string;

  /** Dump date, normalized to ISO 8601 (YYYY-MM-DD) when parseable.
   *  May be a raw string if only partially parseable, or null if absent. */
  readonly dumpDate: string | null;

  /** Emulator used for dumping. */
  readonly emulatorUsed: string;

  /** Song play duration in seconds (before fade starts).
   *  Default: 180 if not specified in file. */
  readonly songLengthSeconds: number;

  /** Fade duration in milliseconds.
   *  Default: 10000 if not specified in file. */
  readonly fadeLengthMs: number;

  /** OST (Official Soundtrack) title. Null if not available (xid6 only). */
  readonly ostTitle: string | null;

  /** OST disc number. Null if not available (xid6 only). */
  readonly ostDisc: number | null;

  /** OST track number. Null if not available (xid6 only). */
  readonly ostTrack: number | null;

  /** Publisher. Null if not available (xid6 only). */
  readonly publisher: string | null;

  /** Copyright year. Null if not available (xid6 only). */
  readonly copyrightYear: number | null;

  /**
   * Timing from xid6, if present. When available, these override
   * the simple songLength/fadeLength. All values in 1/64000th second ticks.
   */
  readonly xid6Timing: Xid6Timing | null;

  /** Source format detection result. */
  readonly id666Format: 'text' | 'binary';
}

/** Extended timing data from xid6 tags. */
export interface Xid6Timing {
  /** Intro (non-looping) length in ticks. */
  readonly introLengthTicks: number;

  /** Single loop iteration length in ticks. */
  readonly loopLengthTicks: number;

  /** End (post-loop, pre-fade) length in ticks. */
  readonly endLengthTicks: number;

  /** Fade length in ticks. */
  readonly fadeLengthTicks: number;

  /** Number of loop iterations. Null when xid6 tag 0x35 is absent. */
  readonly loopCount: number | null;
}

/** Raw ID666 tag values before merging with xid6. */
export interface Id666Tags {
  readonly title: string;
  readonly gameTitle: string;
  readonly dumperName: string;
  readonly comments: string;
  readonly dumpDate: string | null;
  readonly songLengthSeconds: number | null;
  readonly fadeLengthMs: number | null;
  readonly artist: string;
  readonly defaultChannelDisables: number;
  readonly emulatorUsed: number;
  readonly detectedFormat: 'text' | 'binary';
}

/** Raw xid6 tag values. Only fields present in the xid6 block are set. */
export interface Xid6Tags {
  title?: string;
  gameTitle?: string;
  artist?: string;
  dumperName?: string;
  dumpDate?: string | null;
  emulatorUsed?: number;
  comments?: string;
  ostTitle?: string;
  ostDisc?: number;
  ostTrack?: number;
  publisher?: string;
  copyrightYear?: number;
  introLengthTicks?: number;
  loopLengthTicks?: number;
  endLengthTicks?: number;
  fadeLengthTicks?: number;
  mutedVoices?: number;
  loopCount?: number;
  amplificationLevel?: number;
}

/** Parser output: success with SpcFile (which contains warnings), or failure. */
export type SpcParseResult = Result<SpcFile, SpcParseError>;
