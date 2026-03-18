---
name: correctness
description: Logical correctness verification, edge case analysis, invariant checking, and bug prevention.
---

# Correctness

Use this skill when verifying that code behaves correctly, especially for DSP emulation, binary parsing, and audio processing.

## Verification Approaches

### Invariant Checking

- Identify invariants: conditions that must always hold.
- Assert invariants at boundaries (function entry/exit, state transitions).
- Examples: buffer length matches expected size, sample values are in valid range, array indices are in bounds.

### Edge Case Analysis

For any function, systematically check:

- Empty input (zero-length arrays, null, undefined).
- Boundary values (0, 1, max, min, off-by-one).
- Invalid input (malformed data, out-of-range values).
- Overflow/underflow (integer overflow in sample calculations, buffer overrun).
- Concurrency (AudioWorklet runs on a separate thread — shared state races).

### Reference Comparison

For DSP emulation:

- Compare output against known-good reference implementations (bsnes/higan, blargg's SPC_DSP).
- Use bit-exact comparison for integer operations.
- Use epsilon comparison for floating-point operations.
- Document any intentional deviations from reference behavior.

### State Machine Verification

For stateful components (envelope generators, playback state, service worker lifecycle):

- Enumerate all valid states and transitions.
- Verify that invalid transitions are rejected or handled gracefully.
- Test that state is consistent after every transition.

## Binary Parsing Safety

SPC files are untrusted input. Verify:

- All offset calculations are bounds-checked.
- No reads past the end of the buffer.
- String fields are validated and sanitized before display.
- Malformed files produce clear errors, not crashes or undefined behavior.

## When to Use

- Reviewing or writing parsing code.
- Reviewing or writing DSP emulation.
- Reviewing any code that handles untrusted input.
- Verifying a bug fix actually addresses the root cause.
