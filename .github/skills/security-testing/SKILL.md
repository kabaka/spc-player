---
name: security-testing
description: Security-focused testing strategies including fuzzing, boundary testing, and CSP validation.
---

# Security Testing

Use this skill when planning or writing security-focused tests.

## Test Categories

### Input Validation Testing

- Test SPC parser with malformed files: truncated, oversized, corrupted header, invalid offsets.
- Test with zero-length files, files with all zeros, files with all 0xFF.
- Test ID666 tag fields with: empty strings, very long strings, control characters, HTML/script injection attempts, null bytes.
- Test URL parameters with injection attempts.

### Boundary Testing

- Buffer overread: provide offsets that point past end of file.
- Integer overflow: test calculations with values near INT_MAX/INT_MIN.
- Memory exhaustion: provide files that claim enormous sizes.
- CPU exhaustion: provide SPC programs that loop infinitely.

### CSP Validation

- Verify CSP meta tag is present in production build.
- Verify no inline scripts or styles in production HTML.
- Verify no use of `eval` or equivalent in production bundle.
- Test that CSP violations are reported (if CSP reporting is configured).

### Dependency Auditing

- Run `npm audit` in CI.
- Block deployment on critical/high severity vulnerabilities.
- Review new dependency additions for: license, maintenance status, known issues.

### Service Worker Security

- Verify service worker only caches same-origin resources.
- Verify service worker update applies correctly (no stale code serving).
- Test behavior when cache is corrupted or evicted.

## Fuzzing Strategy

For the SPC parser, consider:

- Mutation-based fuzzing: take valid SPC files, randomly mutate bytes.
- Generation-based fuzzing: generate SPC-like structures with invalid field combinations.
- Verify that all fuzzed inputs either parse correctly or produce a clean error — never a crash.

## Integration with CI

- Security tests run as part of the integration test suite.
- `npm audit` runs on every CI build.
- CSP validation runs against the production build.
