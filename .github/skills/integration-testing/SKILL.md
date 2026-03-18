---
name: integration-testing
description: Integration test patterns for component interactions, service wiring, and audio pipeline verification.
---

# Integration Testing

Use this skill when writing tests that verify interactions between multiple modules or services.

## Scope

Integration tests verify that modules work together correctly. They test the seams between components, not individual units.

## What to Integration Test

- Audio pipeline: SPC parser → DSP emulator → audio output buffer.
- Storage layer: service → IndexedDB → retrieval and verification.
- State management: user action → state change → UI update (component integration).
- Worker communication: main thread → worker → response handling.
- Export pipeline: DSP output → encoder → file output verification.

## Location

- Place in `tests/integration/`.
- Name files descriptively: `audio-pipeline.test.ts`, `storage-service.test.ts`.

## Patterns

### Test Isolation

- Each test gets a fresh state. No shared mutable state between tests.
- Use `beforeEach` for setup, `afterEach` for cleanup.
- Clean up IndexedDB databases after tests.

### Real vs. Mock

- Use real implementations where practical. That's the point of integration testing.
- Mock only true external boundaries: network requests, hardware APIs.
- Use a real (in-memory or test) IndexedDB instance, not a mock.

### Assertions

- Verify end-to-end data flow, not intermediate steps.
- For audio: compare output buffers against reference data.
- For storage: write, read back, and verify equality.
- For state: trigger action, verify resulting state and side effects.

## Performance

- Integration tests can be slower than unit tests. That's expected.
- Set reasonable timeouts for async operations (audio rendering, IDB transactions).
- Don't run integration tests in watch mode by default.

## CI

- Integration tests run after unit tests in the CI pipeline.
- Failures in integration tests should block deployment.
