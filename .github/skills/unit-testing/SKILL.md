---
name: unit-testing
description: Unit test authoring conventions, mocking strategy, assertion patterns, and coverage expectations.
---

# Unit Testing

Use this skill when writing or reviewing unit tests.

## Framework

Use the project's chosen test framework (Vitest or equivalent). Use Context7 to look up current API documentation.

## Conventions

- Colocate tests with source files: `parser.test.ts` next to `parser.ts`.
- Use descriptive test names: `it('returns empty array when SPC has no ID666 tags')`.
- One assertion per test where practical. Multiple assertions are fine when testing one logical behavior.
- Arrange-Act-Assert structure.

## What to Unit Test

- Pure functions: SPC parsing, BRR decoding math, envelope calculations, utility functions.
- State reducers and selectors.
- Data transformation logic.
- Validation and sanitization functions.
- Format conversion (sample rate, bit depth, encoding).

## What Not to Unit Test

- DOM rendering (use integration tests).
- Web Audio API behavior (use integration/E2E tests).
- Third-party library internals.
- Simple pass-through functions with no logic.

## Mocking

- Mock external dependencies (IndexedDB, Web Audio, fetch).
- Do not mock the code under test.
- Use dependency injection to make mocking easy.
- Prefer fake implementations over stub/spy libraries for complex mocks.

## Coverage

- Strive for high coverage of `src/core/` (parsing, DSP math, encoding logic).
- Don't chase 100% coverage everywhere. Cover logic, not boilerplate.
- Coverage should not decrease with any PR.

## Audio-Specific Testing

- Compare DSP output against known-good reference data (golden files).
- Test edge cases: silence, maximum amplitude, zero-length samples, loop boundaries.
- Use typed arrays for PCM comparison with tolerance for floating-point precision.
