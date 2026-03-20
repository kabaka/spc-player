/**
 * BRR (Bit Rate Reduction) sample decoder.
 *
 * Decodes SNES S-DSP BRR-encoded samples from SPC RAM into 16-bit PCM.
 * This is a pure TypeScript implementation that reads BRR blocks directly
 * from the SPC file's 64 KB RAM dump — no WASM dependency required.
 *
 * BRR is a 4-bit ADPCM codec used by the SNES S-DSP. Each 9-byte block
 * encodes 16 PCM samples (compression ratio ~3.5:1). Four adaptive filter
 * modes provide prediction-based compression.
 *
 * References:
 *   - fullsnes "S-DSP BRR Samples" (nocash)
 *   - bsnes/higan S-DSP implementation (byuu)
 *   - SPC_DSP by blargg (Shay Green)
 */

/** Size of the SPC700 RAM (64 KB). */
const SPC_RAM_SIZE = 0x10000;

/** Bytes per BRR block: 1 header + 8 data bytes. */
const BRR_BLOCK_BYTES = 9;

/** PCM samples decoded from one BRR block. */
const SAMPLES_PER_BLOCK = 16;

/** Maximum BRR blocks before forced termination (prevents infinite loops). */
const MAX_BRR_BLOCKS = 0x10000 / BRR_BLOCK_BYTES;

/** Source directory entry size: 2-byte start + 2-byte loop address. */
const DIR_ENTRY_BYTES = 4;

/** Maximum number of source directory entries. */
const MAX_DIR_ENTRIES = 256;

/** Native S-DSP output sample rate. */
const NATIVE_SAMPLE_RATE = 32000;

/** Information about a BRR sample entry in the source directory. */
export interface BrrSampleInfo {
  /** Source directory index (0–255). */
  index: number;
  /** Start address of BRR data in SPC RAM. */
  startAddress: number;
  /** Loop address of BRR data in SPC RAM. */
  loopAddress: number;
  /** Whether the sample has a loop point set (loop address differs from start). */
  hasLoop: boolean;
  /** Estimated number of BRR blocks (scanned to end flag). */
  blockCount: number;
  /** Estimated number of PCM samples. */
  sampleCount: number;
}

/** Decoded BRR sample data. */
export interface BrrSample {
  /** Decoded 16-bit signed PCM samples. */
  pcm: Int16Array;
  /** Sample index where loop begins, or null if no loop. */
  loopPoint: number | null;
  /** Always 32000 Hz (native S-DSP rate). */
  sampleRate: number;
  /** Number of BRR blocks that were decoded. */
  blockCount: number;
}

/**
 * Decode a single BRR sample from SPC RAM by its source directory index.
 *
 * The source directory is located at `DIR * 0x100` in SPC RAM, where DIR
 * is the value of DSP register 0x5D. Each entry contains a 2-byte start
 * address and a 2-byte loop address (both little-endian).
 *
 * @param spcRam - The 64 KB SPC700 RAM dump (Uint8Array of length 65536).
 * @param dirPage - DIR register value (DSP register 0x5D); directory base = dirPage * 0x100.
 * @param dirEntryIndex - Source directory entry index (0–255).
 * @returns Decoded BRR sample, or null if the entry is invalid.
 */
export function decodeBrrSample(
  spcRam: Uint8Array,
  dirPage: number,
  dirEntryIndex: number,
): BrrSample | null {
  if (spcRam.length < SPC_RAM_SIZE) return null;
  if (dirEntryIndex < 0 || dirEntryIndex >= MAX_DIR_ENTRIES) return null;

  const dirBase = (dirPage * 0x100) & 0xffff;
  const entryOffset = dirBase + dirEntryIndex * DIR_ENTRY_BYTES;

  // Read start and loop addresses (16-bit little-endian, wrapping within 64 KB)
  const startAddr = readU16LE(spcRam, entryOffset & 0xffff);
  const loopAddr = readU16LE(spcRam, (entryOffset + 2) & 0xffff);

  if (startAddr === 0 && loopAddr === 0) return null;

  // First pass: count blocks to determine output buffer size.
  const blockCount = countBrrBlocks(spcRam, startAddr);
  if (blockCount === 0) return null;

  // Allocate output buffer.
  const pcm = new Int16Array(blockCount * SAMPLES_PER_BLOCK);

  // Decode BRR blocks. Two previous samples are needed for filter prediction.
  let old = 0;
  let older = 0;
  let addr = startAddr;
  let loopPoint: number | null = null;
  let hasLoopFlag = false;

  for (let block = 0; block < blockCount; block++) {
    const headerAddr = addr & 0xffff;
    const header = spcRam[headerAddr];

    const shift = (header >> 4) & 0x0f;
    const filter = (header >> 2) & 0x03;
    const isEnd = (header & 0x01) !== 0;
    const isLoop = (header & 0x02) !== 0;

    // Decode 16 samples from the 8 data bytes following the header.
    const outOffset = block * SAMPLES_PER_BLOCK;

    for (let byteIdx = 0; byteIdx < 8; byteIdx++) {
      const dataAddr = (headerAddr + 1 + byteIdx) & 0xffff;
      const dataByte = spcRam[dataAddr];

      // Each byte contains two 4-bit signed nibbles (high nibble first).
      for (let nibbleIdx = 0; nibbleIdx < 2; nibbleIdx++) {
        const rawNibble =
          nibbleIdx === 0 ? (dataByte >> 4) & 0x0f : dataByte & 0x0f;

        // Sign-extend the 4-bit nibble to a signed integer.
        const signed = rawNibble >= 8 ? rawNibble - 16 : rawNibble;

        // Apply shift. Shift values 13–15 are treated specially:
        // the nibble is forced to the 1-bit sign extension
        // (results in -2048 or 0), matching hardware behavior.
        let sample: number;
        if (shift <= 12) {
          sample = (signed << shift) >> 1;
        } else {
          // Shifts 13-15: use sign bit only, shift left by 11
          sample = signed < 0 ? -2048 : 0;
        }

        // Apply filter (adaptive prediction using previous samples).
        sample = applyFilter(filter, sample, old, older);

        // Clamp to 16-bit signed range.
        // The S-DSP clips to 15-bit signed (-16384..16383) after the filter,
        // then shifts left by 1 to produce a 16-bit result.
        sample = clamp16(sample);

        older = old;
        old = sample;

        pcm[outOffset + byteIdx * 2 + nibbleIdx] = sample;
      }
    }

    // Mark loop point if the end+loop flags are set.
    if (isEnd && isLoop) {
      hasLoopFlag = true;
    }

    if (isEnd) break;

    addr = (addr + BRR_BLOCK_BYTES) & 0xffff;
  }

  // Compute loop point as a sample index.
  // The loop address from the directory points to the BRR block where the
  // loop starts. Convert that to a sample offset within the decoded PCM.
  if (hasLoopFlag && loopAddr !== startAddr) {
    const loopBlockOffset = calculateBlockOffset(startAddr, loopAddr);
    if (loopBlockOffset !== null && loopBlockOffset < blockCount) {
      loopPoint = loopBlockOffset * SAMPLES_PER_BLOCK;
    }
  }

  return {
    pcm,
    loopPoint,
    sampleRate: NATIVE_SAMPLE_RATE,
    blockCount,
  };
}

/**
 * List all valid BRR sample entries from the source directory.
 *
 * Scans the 256 directory entries and returns info for each that points
 * to a plausible BRR sample. Entries with both start and loop addresses
 * at zero, or that point to obviously invalid data, are excluded.
 *
 * @param spcRam - The 64 KB SPC700 RAM dump.
 * @param dirPage - DIR register value (DSP register 0x5D).
 * @returns Array of sample info objects for valid entries.
 */
export function listBrrSamples(
  spcRam: Uint8Array,
  dirPage: number,
): BrrSampleInfo[] {
  if (spcRam.length < SPC_RAM_SIZE) return [];

  const dirBase = (dirPage * 0x100) & 0xffff;
  const samples: BrrSampleInfo[] = [];
  // Track seen start addresses to deduplicate entries pointing to the same sample.
  const seenAddresses = new Set<number>();

  for (let i = 0; i < MAX_DIR_ENTRIES; i++) {
    const entryOffset = (dirBase + i * DIR_ENTRY_BYTES) & 0xffff;
    const startAddr = readU16LE(spcRam, entryOffset);
    const loopAddr = readU16LE(spcRam, (entryOffset + 2) & 0xffff);

    // Skip entries where both addresses are zero (unused).
    if (startAddr === 0 && loopAddr === 0) continue;

    // Skip duplicates (multiple directory entries can reference the same sample).
    if (seenAddresses.has(startAddr)) continue;
    seenAddresses.add(startAddr);

    const blockCount = countBrrBlocks(spcRam, startAddr);
    if (blockCount === 0) continue;

    samples.push({
      index: i,
      startAddress: startAddr,
      loopAddress: loopAddr,
      hasLoop: loopAddr !== startAddr,
      blockCount,
      sampleCount: blockCount * SAMPLES_PER_BLOCK,
    });
  }

  return samples;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Apply BRR filter prediction.
 *
 * The four BRR filter modes use fixed-point coefficients that match the
 * SNES S-DSP hardware exactly. These coefficients come from blargg's
 * SPC_DSP and bsnes/higan implementations.
 *
 * Filter equations (integer math, matching hardware):
 *   0: out = sample
 *   1: out = sample + old * 15/16
 *   2: out = sample + old * 61/32 - older * 15/16
 *   3: out = sample + old * 115/64 - older * 13/16
 *
 * The divisions are implemented as right-shifts. The intermediate
 * result is clipped to 15-bit signed (-16384..16383) by the caller.
 */
function applyFilter(
  filter: number,
  sample: number,
  old: number,
  older: number,
): number {
  switch (filter) {
    case 0:
      return sample;

    case 1:
      // sample + old * 15/16
      // = sample + old - old/16
      // The hardware computes: sample + old + ((-old) >> 4)
      return sample + old + (-old >> 4);

    case 2:
      // sample + old * 61/32 - older * 15/16
      // = sample + 2*old + ((-3*old) >> 5) - older + (older >> 4)
      // The hardware uses: old*2 + ((-old*3) >> 5) - older + (older >> 4)
      return sample + (old << 1) + ((-old * 3) >> 5) - older + (older >> 4);

    case 3:
      // sample + old * 115/64 - older * 13/16
      // = sample + 2*old + ((-13*old) >> 6) - older + ((older*3) >> 4)
      // The hardware uses: old*2 + ((-old*13) >> 6) - older + ((older*3) >> 4)
      return (
        sample + (old << 1) + ((-old * 13) >> 6) - older + ((older * 3) >> 4)
      );

    default:
      return sample;
  }
}

/**
 * Clamp a sample to 16-bit signed range using the S-DSP clipping behavior.
 *
 * The S-DSP clips the filter output to 15-bit signed (-16384..16383),
 * then shifts left by 1 to produce the final 16-bit sample. This
 * matches blargg's SPC_DSP implementation.
 */
function clamp16(value: number): number {
  // Clip to 15-bit signed range.
  if (value > 0x3fff) value = 0x3fff;
  else if (value < -0x4000) value = -0x4000;
  // Shift left by 1 to produce 16-bit result.
  return value << 1;
}

/** Read a 16-bit little-endian unsigned integer from a byte array. */
function readU16LE(data: Uint8Array, offset: number): number {
  return data[offset & 0xffff] | (data[(offset + 1) & 0xffff] << 8);
}

/**
 * Count the number of BRR blocks from a start address until the end flag.
 *
 * Returns 0 if the start address appears to point to invalid data
 * (e.g., the first block would exceed RAM bounds with no end flag found
 * within a reasonable range).
 */
function countBrrBlocks(spcRam: Uint8Array, startAddr: number): number {
  let addr = startAddr & 0xffff;
  let count = 0;

  while (count < MAX_BRR_BLOCKS) {
    const header = spcRam[addr];
    count++;

    if ((header & 0x01) !== 0) {
      // End flag is set — this is the last block.
      return count;
    }

    addr = (addr + BRR_BLOCK_BYTES) & 0xffff;
  }

  // Reached maximum without finding end flag — likely not a valid sample.
  return 0;
}

/**
 * Calculate the block offset of a loop address relative to the start address.
 *
 * Returns the zero-based block index, or null if the loop address doesn't
 * align to a valid block boundary from the start.
 */
function calculateBlockOffset(
  startAddr: number,
  loopAddr: number,
): number | null {
  // Both addresses are in the 64 KB address space.
  const start = startAddr & 0xffff;
  const loop = loopAddr & 0xffff;

  // Calculate byte distance, handling wrapping.
  let distance: number;
  if (loop >= start) {
    distance = loop - start;
  } else {
    distance = 0x10000 - start + loop;
  }

  // Must be aligned to BRR block boundaries.
  if (distance % BRR_BLOCK_BYTES !== 0) return null;

  return distance / BRR_BLOCK_BYTES;
}
