/* eslint-disable @typescript-eslint/no-non-null-assertion -- test assertions validate non-null before use */
import { describe, expect, it } from 'vitest';

import { decodeBrrSample, listBrrSamples } from './brr-decoder';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create a 64 KB SPC RAM buffer filled with zeros. */
function createRam(): Uint8Array {
  return new Uint8Array(0x10000);
}

/**
 * Build a BRR block (9 bytes) from parameters and nibble values.
 *
 * @param shift - Shift amount (0–15).
 * @param filter - Filter mode (0–3).
 * @param end - End flag.
 * @param loop - Loop flag.
 * @param nibbles - 16 signed nibble values (-8..7).
 */
function makeBrrBlock(
  shift: number,
  filter: number,
  end: boolean,
  loop: boolean,
  nibbles: number[],
): Uint8Array {
  if (nibbles.length !== 16) {
    throw new Error(`Expected 16 nibbles, got ${nibbles.length}`);
  }

  const block = new Uint8Array(9);
  // Header: bits 7-4 = shift, bits 3-2 = filter, bit 1 = loop, bit 0 = end
  block[0] =
    ((shift & 0x0f) << 4) |
    ((filter & 0x03) << 2) |
    (loop ? 2 : 0) |
    (end ? 1 : 0);

  for (let i = 0; i < 8; i++) {
    const hi = nibbles[i * 2] & 0x0f;
    const lo = nibbles[i * 2 + 1] & 0x0f;
    block[1 + i] = (hi << 4) | lo;
  }
  return block;
}

/**
 * Write a source directory entry into SPC RAM.
 *
 * @param ram - SPC RAM buffer.
 * @param dirPage - DIR register value (directory base = dirPage * 0x100).
 * @param index - Entry index (0–255).
 * @param startAddr - BRR sample start address.
 * @param loopAddr - BRR sample loop address.
 */
function writeDirEntry(
  ram: Uint8Array,
  dirPage: number,
  index: number,
  startAddr: number,
  loopAddr: number,
): void {
  const base = (dirPage * 0x100 + index * 4) & 0xffff;
  ram[base] = startAddr & 0xff;
  ram[base + 1] = (startAddr >> 8) & 0xff;
  ram[base + 2] = loopAddr & 0xff;
  ram[base + 3] = (loopAddr >> 8) & 0xff;
}

/** Write a BRR block into SPC RAM at the given address. */
function writeBlock(ram: Uint8Array, addr: number, block: Uint8Array): void {
  for (let i = 0; i < block.length; i++) {
    ram[(addr + i) & 0xffff] = block[i];
  }
}

/**
 * Manually apply BRR decoding for one block to produce expected PCM.
 * This mirrors the algorithm in brr-decoder.ts for test verification.
 */
function decodeBlockReference(
  shift: number,
  filter: number,
  nibbles: number[],
  prevOld: number,
  prevOlder: number,
): { samples: number[]; old: number; older: number } {
  let old = prevOld;
  let older = prevOlder;
  const samples: number[] = [];

  for (const rawNibble of nibbles) {
    const signed = rawNibble >= 8 ? rawNibble - 16 : rawNibble;

    let sample: number;
    if (shift <= 12) {
      sample = (signed << shift) >> 1;
    } else {
      sample = signed < 0 ? -2048 : 0;
    }

    // Apply filter
    switch (filter) {
      case 0:
        break;
      case 1:
        sample = sample + old + (-old >> 4);
        break;
      case 2:
        sample = sample + (old << 1) + ((-old * 3) >> 5) - older + (older >> 4);
        break;
      case 3:
        sample =
          sample + (old << 1) + ((-old * 13) >> 6) - older + ((older * 3) >> 4);
        break;
    }

    // Clamp to 15-bit signed, then shift left by 1
    if (sample > 0x3fff) sample = 0x3fff;
    else if (sample < -0x4000) sample = -0x4000;
    sample = sample << 1;

    older = old;
    old = sample;
    samples.push(sample);
  }

  return { samples, old, older };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BRR Decoder', () => {
  describe('decodeBrrSample', () => {
    it('decodes a single block with filter 0 (no prediction)', () => {
      const ram = createRam();
      const dirPage = 0x20;

      // Place a BRR block at address 0x1000
      const nibbles = [0, 1, 2, 3, 4, 5, 6, 7, 0, -1, -2, -3, -4, -5, -6, -7];
      const block = makeBrrBlock(2, 0, true, false, nibbles);
      writeBlock(ram, 0x1000, block);

      // Write directory entry 0: start=0x1000, loop=0x1000
      writeDirEntry(ram, dirPage, 0, 0x1000, 0x1000);

      const result = decodeBrrSample(ram, dirPage, 0);
      expect(result).not.toBeNull();

      const expected = decodeBlockReference(
        2,
        0,
        nibbles.map((n) => n & 0x0f),
        0,
        0,
      );
      expect(result!.pcm.length).toBe(16);
      expect(Array.from(result!.pcm)).toEqual(expected.samples);
      expect(result!.loopPoint).toBeNull();
      expect(result!.sampleRate).toBe(32000);
      expect(result!.blockCount).toBe(1);
    });

    it('decodes multiple blocks', () => {
      const ram = createRam();
      const dirPage = 0x20;

      // Two blocks at address 0x2000
      const nib1 = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
      const nib2 = [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2];
      const block1 = makeBrrBlock(3, 0, false, false, nib1);
      const block2 = makeBrrBlock(3, 0, true, false, nib2);
      writeBlock(ram, 0x2000, block1);
      writeBlock(ram, 0x2009, block2);

      writeDirEntry(ram, dirPage, 0, 0x2000, 0x2000);

      const result = decodeBrrSample(ram, dirPage, 0);
      expect(result).not.toBeNull();
      expect(result!.pcm.length).toBe(32);
      expect(result!.blockCount).toBe(2);
    });

    it('decodes with filter 1 (1-tap prediction)', () => {
      const ram = createRam();
      const dirPage = 0x20;

      const nibbles = [3, 2, 1, 0, -1, -2, -3, -4, 4, 3, 2, 1, 0, -1, -2, -3];
      const block = makeBrrBlock(4, 1, true, false, nibbles);
      writeBlock(ram, 0x3000, block);
      writeDirEntry(ram, dirPage, 0, 0x3000, 0x3000);

      const result = decodeBrrSample(ram, dirPage, 0);
      expect(result).not.toBeNull();

      const expected = decodeBlockReference(
        4,
        1,
        nibbles.map((n) => n & 0x0f),
        0,
        0,
      );
      expect(Array.from(result!.pcm)).toEqual(expected.samples);
    });

    it('decodes with filter 2 (2-tap prediction)', () => {
      const ram = createRam();
      const dirPage = 0x20;

      const nibbles = [2, 3, -1, 0, 1, -2, 4, -3, 0, 1, 2, -1, -2, 3, -4, 1];
      const block = makeBrrBlock(5, 2, true, false, nibbles);
      writeBlock(ram, 0x3000, block);
      writeDirEntry(ram, dirPage, 0, 0x3000, 0x3000);

      const result = decodeBrrSample(ram, dirPage, 0);
      expect(result).not.toBeNull();

      const expected = decodeBlockReference(
        5,
        2,
        nibbles.map((n) => n & 0x0f),
        0,
        0,
      );
      expect(Array.from(result!.pcm)).toEqual(expected.samples);
    });

    it('decodes with filter 3 (2-tap prediction, variant 2)', () => {
      const ram = createRam();
      const dirPage = 0x20;

      const nibbles = [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 0, 0];
      const block = makeBrrBlock(6, 3, true, false, nibbles);
      writeBlock(ram, 0x3000, block);
      writeDirEntry(ram, dirPage, 0, 0x3000, 0x3000);

      const result = decodeBrrSample(ram, dirPage, 0);
      expect(result).not.toBeNull();

      const expected = decodeBlockReference(
        6,
        3,
        nibbles.map((n) => n & 0x0f),
        0,
        0,
      );
      expect(Array.from(result!.pcm)).toEqual(expected.samples);
    });

    it('detects loop point from end+loop flags and directory loop address', () => {
      const ram = createRam();
      const dirPage = 0x20;

      // Three blocks: block 0, block 1 (loop target), block 2 (end+loop)
      const nib = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const block0 = makeBrrBlock(0, 0, false, false, nib);
      const block1 = makeBrrBlock(0, 0, false, false, nib);
      const block2 = makeBrrBlock(0, 0, true, true, nib); // end=1, loop=1

      writeBlock(ram, 0x4000, block0);
      writeBlock(ram, 0x4009, block1);
      writeBlock(ram, 0x4012, block2);

      // Loop address points to block 1 (offset 9 bytes from start)
      writeDirEntry(ram, dirPage, 0, 0x4000, 0x4009);

      const result = decodeBrrSample(ram, dirPage, 0);
      expect(result).not.toBeNull();
      expect(result!.blockCount).toBe(3);
      // Loop point is at block 1 → sample index 16
      expect(result!.loopPoint).toBe(16);
    });

    it('returns null loop point when end flag is set but loop flag is not', () => {
      const ram = createRam();
      const dirPage = 0x20;

      const nib = [1, 2, 3, 4, 5, 6, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const block = makeBrrBlock(2, 0, true, false, nib); // end=1, loop=0
      writeBlock(ram, 0x5000, block);
      writeDirEntry(ram, dirPage, 0, 0x5000, 0x5000);

      const result = decodeBrrSample(ram, dirPage, 0);
      expect(result).not.toBeNull();
      expect(result!.loopPoint).toBeNull();
    });

    it('handles shift amounts 13-15 (hardware special case)', () => {
      const ram = createRam();
      const dirPage = 0x20;

      // Shift 13 with positive and negative nibbles
      const nibbles = [1, -1, 7, -8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const block = makeBrrBlock(13, 0, true, false, nibbles);
      writeBlock(ram, 0x6000, block);
      writeDirEntry(ram, dirPage, 0, 0x6000, 0x6000);

      const result = decodeBrrSample(ram, dirPage, 0);
      expect(result).not.toBeNull();

      const expected = decodeBlockReference(
        13,
        0,
        nibbles.map((n) => n & 0x0f),
        0,
        0,
      );
      expect(Array.from(result!.pcm)).toEqual(expected.samples);

      // Positive nibbles produce 0, negative nibbles produce -2048 (before clamp16)
      // After clamp16 (clip 15-bit then <<1): 0→0, -2048→-4096
      expect(result!.pcm[0]).toBe(0); // nibble 1 → positive → 0
      expect(result!.pcm[1]).toBe(-4096); // nibble -1 → negative → -2048 → -4096
    });

    it('handles shift amount 15 the same as 13', () => {
      const ram = createRam();
      const dirPage = 0x20;

      const nibbles = [1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const blockS13 = makeBrrBlock(13, 0, true, false, nibbles);
      const blockS15 = makeBrrBlock(15, 0, true, false, nibbles);

      writeBlock(ram, 0x6000, blockS13);
      writeDirEntry(ram, dirPage, 0, 0x6000, 0x6000);
      const result13 = decodeBrrSample(ram, dirPage, 0);

      writeBlock(ram, 0x6000, blockS15);
      const result15 = decodeBrrSample(ram, dirPage, 0);

      expect(result13).not.toBeNull();
      expect(result15).not.toBeNull();
      expect(Array.from(result13!.pcm)).toEqual(Array.from(result15!.pcm));
    });

    it('returns null for invalid directory entry index', () => {
      const ram = createRam();
      expect(decodeBrrSample(ram, 0x20, -1)).toBeNull();
      expect(decodeBrrSample(ram, 0x20, 256)).toBeNull();
    });

    it('returns null for RAM buffer too small', () => {
      const tinyRam = new Uint8Array(100);
      expect(decodeBrrSample(tinyRam, 0x20, 0)).toBeNull();
    });

    it('returns null when directory entry points to zero addresses', () => {
      const ram = createRam();
      // Entry 0 at dirPage 0x20 is already all zeros
      expect(decodeBrrSample(ram, 0x20, 0)).toBeNull();
    });

    it('clamps output to 16-bit range for extreme filter output', () => {
      const ram = createRam();
      const dirPage = 0x20;

      // Large shift with filter 1 can produce values that need clamping.
      // Use shift=12 with max nibble value 7 and filter 1 to push output high.
      const nibbles = [7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7];
      const block = makeBrrBlock(12, 1, true, false, nibbles);
      writeBlock(ram, 0x7000, block);
      writeDirEntry(ram, dirPage, 0, 0x7000, 0x7000);

      const result = decodeBrrSample(ram, dirPage, 0);
      expect(result).not.toBeNull();

      // All samples should be within 16-bit signed range
      for (const sample of result!.pcm) {
        expect(sample).toBeGreaterThanOrEqual(-32768);
        expect(sample).toBeLessThanOrEqual(32767);
      }

      // Verify against reference decoder
      const expected = decodeBlockReference(
        12,
        1,
        nibbles.map((n) => n & 0x0f),
        0,
        0,
      );
      expect(Array.from(result!.pcm)).toEqual(expected.samples);
    });

    it('decodes a silence block (all zero nibbles) correctly', () => {
      const ram = createRam();
      const dirPage = 0x20;

      const nibbles = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const block = makeBrrBlock(0, 0, true, false, nibbles);
      writeBlock(ram, 0x8000, block);
      writeDirEntry(ram, dirPage, 0, 0x8000, 0x8000);

      const result = decodeBrrSample(ram, dirPage, 0);
      expect(result).not.toBeNull();
      expect(result!.pcm.length).toBe(16);

      // All zeros
      for (let i = 0; i < 16; i++) {
        expect(result!.pcm[i]).toBe(0);
      }
    });

    it('filter prediction carries state across blocks', () => {
      const ram = createRam();
      const dirPage = 0x20;

      // Block 1: filter 0, generates non-zero samples
      const nib1 = [7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7];
      // Block 2: filter 1, prediction depends on block 1's last samples
      const nib2 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

      const block1 = makeBrrBlock(4, 0, false, false, nib1);
      const block2 = makeBrrBlock(0, 1, true, false, nib2);

      writeBlock(ram, 0x9000, block1);
      writeBlock(ram, 0x9009, block2);
      writeDirEntry(ram, dirPage, 0, 0x9000, 0x9000);

      const result = decodeBrrSample(ram, dirPage, 0);
      expect(result).not.toBeNull();
      expect(result!.pcm.length).toBe(32);

      // Block 1 output via reference
      const ref1 = decodeBlockReference(
        4,
        0,
        nib1.map((n) => n & 0x0f),
        0,
        0,
      );
      // Block 2 depends on block 1's last two samples
      const ref2 = decodeBlockReference(
        0,
        1,
        nib2.map((n) => n & 0x0f),
        ref1.old,
        ref1.older,
      );

      expect(Array.from(result!.pcm.slice(0, 16))).toEqual(ref1.samples);
      expect(Array.from(result!.pcm.slice(16, 32))).toEqual(ref2.samples);
    });
  });

  describe('listBrrSamples', () => {
    it('lists samples from the source directory', () => {
      const ram = createRam();
      const dirPage = 0x20; // Directory at 0x2000

      // Place two valid samples at addresses that don't collide with the directory
      const nib = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const block = makeBrrBlock(2, 0, true, false, nib);

      writeBlock(ram, 0x1000, block);
      writeBlock(ram, 0x3000, block);

      writeDirEntry(ram, dirPage, 0, 0x1000, 0x1000);
      writeDirEntry(ram, dirPage, 3, 0x3000, 0x3000);

      const samples = listBrrSamples(ram, dirPage);
      expect(samples.length).toBe(2);

      expect(samples[0].index).toBe(0);
      expect(samples[0].startAddress).toBe(0x1000);
      expect(samples[0].blockCount).toBe(1);
      expect(samples[0].sampleCount).toBe(16);
      expect(samples[0].hasLoop).toBe(false);

      expect(samples[1].index).toBe(3);
      expect(samples[1].startAddress).toBe(0x3000);
    });

    it('skips entries with zero start and loop addresses', () => {
      const ram = createRam();
      const dirPage = 0x20;

      // Only entry 5 is valid
      const nib = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const block = makeBrrBlock(0, 0, true, false, nib);
      writeBlock(ram, 0x1000, block);
      writeDirEntry(ram, dirPage, 5, 0x1000, 0x1000);

      const samples = listBrrSamples(ram, dirPage);
      expect(samples.length).toBe(1);
      expect(samples[0].index).toBe(5);
    });

    it('deduplicates entries pointing to the same start address', () => {
      const ram = createRam();
      const dirPage = 0x20;

      const nib = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const block = makeBrrBlock(0, 0, true, false, nib);
      writeBlock(ram, 0x1000, block);

      // Two entries pointing to the same sample
      writeDirEntry(ram, dirPage, 0, 0x1000, 0x1000);
      writeDirEntry(ram, dirPage, 1, 0x1000, 0x1000);

      const samples = listBrrSamples(ram, dirPage);
      expect(samples.length).toBe(1);
    });

    it('reports hasLoop when loop address differs from start', () => {
      const ram = createRam();
      const dirPage = 0x20;

      // Two blocks: block 0 and block 1 (end+loop)
      const nib = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      writeBlock(ram, 0x1000, makeBrrBlock(0, 0, false, false, nib));
      writeBlock(ram, 0x1009, makeBrrBlock(0, 0, true, true, nib));

      writeDirEntry(ram, dirPage, 0, 0x1000, 0x1009);

      const samples = listBrrSamples(ram, dirPage);
      expect(samples.length).toBe(1);
      expect(samples[0].hasLoop).toBe(true);
      expect(samples[0].loopAddress).toBe(0x1009);
    });

    it('returns empty array for RAM buffer too small', () => {
      const tinyRam = new Uint8Array(100);
      expect(listBrrSamples(tinyRam, 0x20)).toEqual([]);
    });
  });

  describe('BRR algorithm correctness', () => {
    it('produces known output for a hand-computed filter 0 block', () => {
      // Manual computation:
      // shift=2, filter=0, nibbles=[1, -1, 2, -2, ...]
      // For filter 0: sample = (signed << shift) >> 1
      // nibble  1 → signed  1 → (1 << 2) >> 1 = 2 → clamp16 → 4
      // nibble -1 → signed -1 → (-1 << 2) >> 1 = -2 → clamp16 → -4
      // nibble  2 → signed  2 → (2 << 2) >> 1 = 4 → clamp16 → 8
      // nibble -2 → signed -2 → (-2 << 2) >> 1 = -4 → clamp16 → -8
      const ram = createRam();
      const dirPage = 0x20;

      const nibbles = [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 0, 0];
      const block = makeBrrBlock(2, 0, true, false, nibbles);
      writeBlock(ram, 0xa000, block);
      writeDirEntry(ram, dirPage, 0, 0xa000, 0xa000);

      const result = decodeBrrSample(ram, dirPage, 0)!;

      // Expected: (signed << 2) >> 1, then << 1 via clamp16
      // = signed << 2 >> 1 << 1 = signed << 2
      // Wait, clamp16 does: clip to 15-bit, then << 1
      // For filter 0: sample = (signed << shift) >> 1
      // So for nibble 1, shift 2: (1 << 2) >> 1 = 2
      // clamp16(2) → clip to 15-bit (2 is fine) → 2 << 1 = 4
      expect(result.pcm[0]).toBe(4); // nibble 1
      expect(result.pcm[1]).toBe(-4); // nibble -1
      expect(result.pcm[2]).toBe(8); // nibble 2
      expect(result.pcm[3]).toBe(-8); // nibble -2
      expect(result.pcm[14]).toBe(0); // nibble 0
      expect(result.pcm[15]).toBe(0); // nibble 0
    });

    it('produces known output for filter 1 with non-zero initial state', () => {
      // For filter 1 with shift=0:
      // sample = (signed << 0) >> 1 + old + ((-old) >> 4)
      // First nibble: signed=1 → base = (1<<0)>>1 = 0 (integer truncation)
      // old=0, so filtering adds 0. After clamp16: 0.
      //
      // With shift=2 and nibble=1:
      // base = (1 << 2) >> 1 = 2
      // old=0 → sample = 2, clamp16 = 4
      // Next nibble 1: base = 2, old=4, filter1: 2 + 4 + ((-4) >> 4) = 2 + 4 + (-1) = 5
      // clamp16(5) = 10
      const ram = createRam();
      const dirPage = 0x20;

      const nibbles = [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const block = makeBrrBlock(2, 1, true, false, nibbles);
      writeBlock(ram, 0xb000, block);
      writeDirEntry(ram, dirPage, 0, 0xb000, 0xb000);

      const result = decodeBrrSample(ram, dirPage, 0)!;
      // nibble 1, shift 2, filter 1:
      // base = (1 << 2) >> 1 = 2
      // old=0, older=0 → sample=2 → clamp16=4
      expect(result.pcm[0]).toBe(4);

      // nibble 1, shift 2, filter 1:
      // base = 2, old=4 → 2 + 4 + ((-4) >> 4) = 2 + 4 + (-1) = 5
      // clamp16(5) = 10
      expect(result.pcm[1]).toBe(10);

      // nibble 0, shift 2, filter 1:
      // base = 0, old=10 → 0 + 10 + ((-10) >> 4) = 10 + (-1) = 9
      // clamp16(9) = 18
      expect(result.pcm[2]).toBe(18);
    });

    it('clips high values to 32766 (0x3FFF << 1)', () => {
      const ram = createRam();
      const dirPage = 0x20;

      // Use filter 1 with high shift and max nibbles to force clipping.
      // shift=12, filter=1, nibble=7 repeated.
      // First sample: (7 << 12) >> 1 = 14336. clamp16(14336) = 14336 << 1 = 28672
      // Second: base=14336, old=28672 → 14336+28672+((-28672)>>4) = 14336+28672-1792 = 41216
      // clip to 0x3FFF=16383, then << 1 = 32766
      const nibbles = [7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7];
      const block = makeBrrBlock(12, 1, true, false, nibbles);
      writeBlock(ram, 0xc000, block);
      writeDirEntry(ram, dirPage, 0, 0xc000, 0xc000);

      const result = decodeBrrSample(ram, dirPage, 0)!;
      // After the first few samples, values should saturate at 32766
      for (let i = 2; i < 16; i++) {
        expect(result.pcm[i]).toBe(32766);
      }
    });
  });
});
