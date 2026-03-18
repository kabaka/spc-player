---
status: "proposed"
date: 2026-03-18
decision-makers: []
consulted: []
informed: []
---

# Test Framework Selection: Vitest + React Testing Library + Playwright

## Context and Problem Statement

SPC Player requires comprehensive test coverage across three testing layers: unit tests for pure logic (SPC parsing, DSP math, state management), integration tests for component interactions and service wiring, and end-to-end tests for complete user workflows. The requirements document specifies pre-commit hooks running lint, type-check, and unit tests, with a CI pipeline running lint → type-check → unit → integration → E2E → deploy. AGENTS.md defines the conventions: unit tests colocated with source files (`*.test.ts`), integration tests in `tests/integration/`, and E2E tests in `tests/e2e/`.

ADR-0002 recommended "Vitest + React Testing Library + Playwright" as part of a sub-stack table within the UI framework decision, but this recommendation was embedded in a different architectural concern and was not formally evaluated. The testing layer of this project has unique challenges that warrant dedicated analysis: the audio pipeline runs WASM inside an AudioWorklet on a separate thread (ADR-0003), the DSP emulation core uses raw WASM exports with no JavaScript glue (ADR-0007), and the application must function as an offline PWA across Chrome, Safari, and Firefox. These constraints — worker-thread execution, binary module loading, real-time audio processing, IndexedDB persistence, Web MIDI input, and service worker lifecycle — require specific testing capabilities that must be validated against each candidate framework.

Which combination of test frameworks should SPC Player use for unit, integration, and E2E testing?

## Decision Drivers

- **Vite-native test runner integration** — shared Vite config, transforms, module resolution, and plugin pipeline eliminate configuration duplication and ensure tests resolve modules identically to the production build
- **React component testing with accessibility verification** — query-by-role pattern reinforces WCAG 2.2 AA compliance; tests that pass also validate ARIA semantics
- **AudioWorklet and WASM testing challenges** — the DSP emulation core runs WASM in an AudioWorklet (ADR-0003, ADR-0007); tests must handle worker threads, binary module loading via `WebAssembly.compileStreaming`, and the Module-transfer pattern
- **E2E testing of audio playback** — verifying real Web Audio API output (non-silent audio, correct sample rate), SPC file uploads, and playback state transitions requires a real browser environment
- **Cross-browser E2E coverage** — requirements specify Chrome, Safari (WebKit), and Firefox as P0/P1 targets; the E2E framework must support all three with a single test suite
- **CI/CD integration with GitHub Actions** — headless browser execution, parallel test sharding across CI workers, and machine-readable output (JUnit XML, JSON) for status checks
- **Test isolation and parallelization** — fast CI requires tests to run in parallel without shared mutable state; the framework must support concurrent test execution with deterministic results
- **Mocking capabilities** — Web Audio API (`AudioContext`, `AudioWorkletNode`, `AnalyserNode`), IndexedDB, Web MIDI API, `fetch`, and `MessagePort` must be mockable for unit and integration tests that run outside a browser
- **Coverage reporting** — statement, branch, and function coverage with support for TypeScript source maps; V8 or Istanbul provider integration for CI enforcement
- **Developer experience** — watch mode with file-change detection, fast re-run on save, clear error output with source-mapped stack traces, and Vitest UI for interactive debugging
- **AI agent code quality** — LLMs author all test code; the framework must have strong representation in training data to produce idiomatic, correct tests without human review

## Considered Options

- **Option 1: Vitest + React Testing Library + Playwright** — Vite-native unit/integration runner, React component testing via RTL, Playwright for cross-browser E2E
- **Option 2: Jest + React Testing Library + Cypress** — established Jest ecosystem, Cypress for E2E with interactive runner
- **Option 3: Vitest + React Testing Library + Cypress** — Vite-native unit runner with Cypress for E2E
- **Option 4: Jest + React Testing Library + Playwright** — Jest for unit/integration with Playwright for E2E

## Decision Outcome

Chosen option: **"Vitest + React Testing Library + Playwright"**, because it is the only combination that satisfies all decision drivers simultaneously — Vitest's native Vite integration eliminates configuration drift between tests and production builds, React Testing Library's query-by-role pattern enforces accessibility compliance at the test layer, and Playwright is the only E2E framework that provides true cross-browser coverage across Chromium, WebKit, and Firefox with a single API. This combination also has the strongest AI agent code quality due to dominant representation in modern LLM training data and produces the fastest CI pipeline through Vitest's thread-based parallelization and Playwright's test sharding.

### Consequences

- Good, because Vitest shares the Vite config, transforms, and plugin pipeline with the production build — TypeScript, CSS Modules, WASM `?url` imports, and path aliases resolve identically in tests and application code, eliminating an entire class of "works in tests, breaks in production" bugs.
- Good, because React Testing Library's `getByRole`, `getByLabelText`, and `getByText` queries enforce accessible markup — a component that cannot be found by its ARIA role is both untestable and inaccessible, creating a natural feedback loop for WCAG compliance.
- Good, because Playwright supports Chromium, WebKit, and Firefox from a single test suite, matching the P0/P1 browser targets in the requirements document, with consistent APIs and behavior across all three engines.
- Good, because Vitest's `vi.mock()` and `vi.fn()` provide comprehensive mocking for Web Audio API, IndexedDB, Web MIDI, and other browser APIs in unit tests, with ESM-native module mocking that works without Babel transforms.
- Good, because Playwright's `setInputFiles` supports buffer uploads from memory, enabling SPC file upload testing without filesystem dependencies — critical for testing the binary file loading workflow.
- Good, because both Vitest and Playwright support parallel execution and CI sharding: Vitest runs tests across worker threads, and Playwright distributes tests across multiple CI machines via `--shard`, keeping the CI pipeline fast as the test suite grows.
- Good, because Vitest provides built-in V8 and Istanbul coverage providers with source map support, integrating directly with CI coverage threshold enforcement without additional tooling.
- Good, because both frameworks have excellent LLM training data representation — Vitest is the default test runner for Vite projects (established 2022+), and Playwright is the most widely adopted cross-browser E2E framework (Microsoft-backed, first-class TypeScript support).
- Bad, because the project has two test runners with different APIs (`vitest` for unit/integration, `playwright test` for E2E), requiring developers and AI agents to understand both — though this is inherent in the unit-vs-E2E split and unavoidable with any combination.
- Bad, because AudioWorklet and WASM testing in Vitest's Node.js environment requires mocking, as `AudioWorkletProcessor`, `WebAssembly.compileStreaming`, and `MessagePort` are not available — real AudioWorklet integration must be verified at the E2E layer or via Vitest's browser mode.
- Bad, because Playwright E2E tests are inherently slower than unit tests (browser launch, page navigation, rendering) — the testing pyramid must be carefully maintained to keep the fast-feedback loop dominated by unit tests.

### Confirmation

- Verify Vitest resolves `?url` WASM imports, CSS Modules, and TypeScript path aliases identically to the Vite production build by creating a smoke test that imports from each module category.
- Confirm React Testing Library's `getByRole` queries work with Radix UI primitives (Dialog, Tabs, Slider, Toggle) in Vitest's jsdom environment — render each component and verify role-based queries find the correct elements.
- Run a Playwright E2E test across Chromium, WebKit, and Firefox that loads an SPC file via `setInputFiles`, starts playback, and verifies the AudioContext is in "running" state — confirming cross-browser audio pipeline functionality.
- Measure CI pipeline time with the full test suite (unit + integration + E2E across 3 browsers) and confirm it completes within a reasonable budget (target: under 10 minutes for the full pipeline on GitHub Actions).
- Verify Vitest coverage reporting produces accurate source-mapped coverage for TypeScript files in `src/core/` using the V8 provider.

## Pros and Cons of the Options

### Option 1: Vitest + React Testing Library + Playwright

Vitest (unit/integration) with React Testing Library for component testing and Playwright (E2E) for cross-browser workflow testing. Vitest shares the Vite configuration, using jsdom or happy-dom for DOM simulation in unit tests. Playwright runs against the production build in real browsers.

- Good, because Vitest is built on Vite and shares its configuration — `vitest.config.ts` extends `vite.config.ts`, inheriting plugins, resolve aliases, and transform pipelines. WASM `?url` imports, CSS Modules, and TypeScript paths work in tests without separate configuration.
- Good, because Vitest's ESM-native module mocking (`vi.mock()`) handles ES module imports correctly without Babel transforms, producing cleaner and more reliable mocks than Jest's CommonJS-based hoisting.
- Good, because Vitest provides built-in coverage via V8 (fast, native) or Istanbul (broader compatibility) providers, with AST-aware remapping (experimental in 3.2) for accurate source-mapped TypeScript coverage.
- Good, because Vitest supports watch mode with Vite's HMR-aware module graph — changing a source file re-runs only tests that depend on the changed module, not the entire suite.
- Good, because Vitest 3.x supports browser mode via Playwright or WebdriverIO providers, offering a future upgrade path to run component tests in a real browser if jsdom limitations become problematic for Web Audio or WASM testing.
- Good, because Vitest's `projects` configuration (formerly workspace) supports multiple test configurations — unit tests with jsdom pool and integration tests with different settings can coexist in one config file, matching the project's need for colocated unit tests and separate integration tests.
- Good, because React Testing Library's query priority hierarchy (`getByRole` > `getByLabelText` > `getByText` > `getByTestId`) systematically guides tests toward accessible markup, creating a natural enforcement mechanism for WCAG 2.2 AA.
- Good, because Playwright provides first-class support for Chromium, WebKit, and Firefox through a single API, with identical assertion and locator APIs across all browser engines.
- Good, because Playwright's auto-wait mechanism eliminates manual `waitFor` calls and reduces flakiness — locators automatically wait for elements to be actionable before interacting with them.
- Good, because Playwright supports file upload via buffer (`setInputFiles` with in-memory data), network interception (`route`), and device emulation (viewport, touch, user agent) — covering all E2E scenarios for a PWA.
- Good, because Playwright's test generator (`codegen`) and trace viewer (`show-trace`) provide powerful debugging tools for E2E test authoring and failure investigation.
- Good, because both Vitest and Playwright have strong, growing representation in LLM training data — AI agents generate idiomatic test code in both frameworks with high consistency.
- Neutral, because two separate test runners (`vitest` and `playwright test`) have different CLIs, configuration formats, and assertion APIs — but this is inherent in any non-monolithic test setup and both support standard `expect` assertions.
- Bad, because Vitest's jsdom environment lacks real Web Audio API, `AudioWorkletProcessor`, `WebAssembly.compileStreaming`, and other browser APIs — testing the AudioWorklet-WASM integration path at the unit/integration layer requires mocking these APIs or using Vitest browser mode (which adds complexity).
- Bad, because the Vitest + Playwright combination requires two dependency trees (vitest + @testing-library/react + jsdom for unit, @playwright/test for E2E), increasing `node_modules` size.

### Option 2: Jest + React Testing Library + Cypress

Jest (unit/integration) with React Testing Library for component testing and Cypress (E2E) for user workflow testing. Jest requires separate transform configuration for TypeScript, CSS Modules, and other Vite-specific features. Cypress runs tests in a Chromium-based browser with an interactive test runner.

- Good, because Jest is the most established JavaScript test runner with the largest ecosystem — extensive documentation, plugins, and community support.
- Good, because Jest has the strongest LLM training data representation of any JavaScript test runner, producing highly idiomatic AI-generated tests.
- Good, because React Testing Library's query-by-role pattern works identically with Jest and Vitest — the component testing experience is framework-agnostic.
- Good, because Cypress's interactive test runner provides visual debugging with time-travel snapshots — each test step is captured and can be inspected after the run.
- Good, because Cypress has built-in screenshot and video capture on failure, simplifying E2E debugging in CI.
- Bad, because Jest does not share the Vite configuration — TypeScript transforms, CSS Module resolution, path aliases, and WASM `?url` imports must be separately configured via `jest.config.ts` with `ts-jest` or `@swc/jest`, creating configuration drift between the test and production environments.
- Bad, because Jest's module mocking uses CommonJS hoisting semantics (`jest.mock()` is hoisted to the top of the file), which produces subtle bugs with ESM-native code — the project uses ES modules throughout, making Jest's mocking model an impedance mismatch.
- Bad, because **Cypress has limited cross-browser support** — it primarily supports Chromium-based browsers (Chrome, Edge, Electron). Firefox support is experimental, and **WebKit/Safari support is experimental** (added in Cypress 10.8 using Playwright's WebKit engine internally) **with no full feature parity guarantee**. This makes Safari verification — a P0 browser target for SPC Player — unreliable compared to Playwright's native, production-grade WebKit support.
- Bad, because Cypress runs tests inside the browser's same-origin context, which prevents testing multi-origin scenarios and makes testing service worker lifecycle difficult.
- Bad, because Cypress's command queue architecture is unique and differs from standard async/await patterns — AI agents must learn Cypress-specific chaining patterns (`.should()`, `.then()`, `.within()`), reducing consistency with the rest of the codebase.
- Bad, because Jest is slower than Vitest for TypeScript projects — Jest must transform every file through Babel or SWC before execution, while Vitest uses Vite's native esbuild transform which is significantly faster.
- Bad, because Jest + Cypress together is a heavier dependency footprint than Vitest + Playwright, with Cypress's Electron-based runner being particularly large (~500 MB).

### Option 3: Vitest + React Testing Library + Cypress

Vitest (unit/integration) with React Testing Library for component testing and Cypress (E2E) for user workflow testing. This hybrid gets Vite-native unit testing while using Cypress for E2E.

- Good, because Vitest shares the Vite config for unit and integration tests — same benefits as Option 1 for the unit/integration layer.
- Good, because Vitest's ESM-native mocking, watch mode, and coverage integration are superior to Jest's.
- Good, because Cypress's interactive runner provides excellent DX for developing E2E tests locally.
- Neutral, because Cypress component testing exists as an alternative to React Testing Library, but RTL's role-based queries provide stronger accessibility enforcement.
- Bad, because **Cypress's WebKit (Safari) support is experimental and not production-ready** — the same limitation as Option 2. SPC Player's P0 requirement for Safari compatibility cannot be reliably verified in E2E tests with Cypress compared to Playwright's native WebKit support.
- Bad, because Cypress does not support native test sharding across CI workers — parallelization requires Cypress Cloud (paid service), while Playwright's sharding is built-in and free.
- Bad, because Cypress's service worker testing story is weak — intercepting and testing PWA offline scenarios, install prompts, and cache strategies is significantly harder than with Playwright's native service worker interception.
- Bad, because mixing Vitest (modern, ESM-native) with Cypress (its own bundler and execution model) creates a conceptual split where the unit layer uses one module system and the E2E layer uses another.
- Bad, because file upload testing in Cypress uses `cy.fixture()` and `selectFile()` which are less flexible than Playwright's `setInputFiles` with in-memory buffers — important for testing binary SPC file loading.

### Option 4: Jest + React Testing Library + Playwright

Jest (unit/integration) with React Testing Library for component testing and Playwright (E2E) for cross-browser user workflow testing. This gets Playwright's cross-browser capability while using the established Jest ecosystem.

- Good, because Playwright provides true cross-browser E2E testing (Chromium, WebKit, Firefox) — same benefits as Option 1 for the E2E layer.
- Good, because Jest has the most established ecosystem with extensive documentation and plugins.
- Good, because Jest has the strongest LLM training data representation for unit testing patterns.
- Good, because Playwright's auto-wait, test sharding, and trace viewer provide excellent E2E DX and CI integration.
- Bad, because Jest requires separate configuration for TypeScript, CSS Modules, path aliases, and WASM imports — the Vite config is not shared, creating the same configuration drift problem as Option 2.
- Bad, because Jest's CommonJS-based module mocking (`jest.mock()`) is an impedance mismatch with the project's ESM-native codebase, producing subtle mock hoisting bugs.
- Bad, because Jest transform speed is slower than Vitest for TypeScript files — every test file must be transformed via `ts-jest`, `@swc/jest`, or `babel-jest` before execution.
- Bad, because using Jest + Playwright splits the "modern Vite ecosystem" from the unit test layer — Playwright is modern and ESM-aware, but Jest pulls the project back toward CommonJS patterns and Babel transforms.
- Neutral, because this combination is viable if the project were not Vite-based — Jest + Playwright is a reasonable stack for webpack or other bundler projects, but it loses the key advantage of Vite-native testing that Vitest provides.

## More Information

### Testing Layer Responsibilities

The three testing layers map to the project's architecture (from `docs/architecture.md`) as follows:

| Layer | Tool | Scope | Location | What It Covers |
|-------|------|-------|----------|----------------|
| Unit | Vitest + RTL | Individual functions, components in isolation | Colocated `*.test.ts` | SPC parsing, DSP math, BRR decoding, ADSR envelope calculations, state reducers, utility functions, React component rendering with role-based queries |
| Integration | Vitest | Module interactions, service wiring | `tests/integration/` | Audio pipeline (parser → DSP → output buffer), storage layer (service → IndexedDB → retrieval), state management flows, worker communication protocols, export pipeline |
| E2E | Playwright | Complete user workflows in real browsers | `tests/e2e/` | Load SPC → play → mute track → verify audio, playlist CRUD and reorder, export flow (select → encode → download), settings persistence across reload, PWA install and offline, deep linking, keyboard navigation |

### Vitest Configuration Strategy

A single `vitest.config.ts` extending the base Vite config, using Vitest's `projects` (formerly workspace) feature to define separate configurations for colocated unit tests and integration tests:

```typescript
// vitest.config.ts
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(viteConfig, defineConfig({
  test: {
    projects: [
      {
        // Unit tests: colocated with source, jsdom environment
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['./tests/setup/unit.ts'],
        },
      },
      {
        // Integration tests: separate directory, jsdom or node environment
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'jsdom',
          setupFiles: ['./tests/setup/integration.ts'],
          testTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/*.d.ts',
        'src/wasm/**',
      ],
    },
  },
}));
```

### Playwright Configuration Strategy

Playwright configured to run against the production build across three browser engines, with SPC fixture files for binary upload testing:

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['junit', { outputFile: 'test-results/e2e-results.xml' }], ['html']]
    : 'html',
  use: {
    baseURL: 'http://localhost:4173', // Vite preview server
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'npm run preview',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
});
```

### Testing Challenges and Mitigation Strategies

The following project-specific testing challenges require deliberate strategies at the framework level:

**AudioWorklet processor testing.** AudioWorklet code runs in a separate thread without DOM access. Unit testing the `process()` method requires extracting the DSP rendering logic from the AudioWorklet class and testing it in isolation. The AudioWorklet registration (`registerProcessor`) and `MessagePort` communication are tested at the E2E layer in a real browser. Vitest browser mode provides a future path for component-level AudioWorklet testing if jsdom mocks prove insufficient.

**WASM module integration testing.** The raw WASM exports (ADR-0007) use `extern "C"` functions with integer and float parameters. Integration tests verify the TypeScript `DspExports` interface matches the actual WASM exports by instantiating the compiled `.wasm` binary in Node.js via `WebAssembly.compile` and `WebAssembly.instantiate` (both available in Node.js). This validates the contract without running in a browser.

**Real-time audio pipeline testing.** Timing-sensitive audio behavior (latency, gapless playback, fade-out) cannot be reliably tested in jsdom. E2E tests verify audio pipeline behavior by checking `AudioContext.state`, reading `AnalyserNode` data to confirm non-silent output, and verifying playback duration. These tests accept wider tolerances than deterministic unit tests.

**IndexedDB persistence testing.** The unit/integration test setup adds `fake-indexeddb` as a dev dependency and configures it in the setup files (`tests/setup/unit.ts`, `tests/setup/integration.ts`) to provide an in-memory IndexedDB implementation. Integration tests for the storage layer use this polyfill to verify write-read-verify cycles without a real browser. E2E tests verify persistence across page reloads.

**Web MIDI device simulation.** Unit tests mock the `navigator.requestMIDIAccess` API to simulate MIDI input events. E2E MIDI testing is limited to verifying the MIDI permission flow and connection UI — actual MIDI device simulation in headless browsers is unreliable and is excluded from automated testing scope.

**PWA feature testing.** Playwright provides first-class service worker interception and can test offline scenarios by disabling network access (`context.setOffline(true)`). Install prompt testing uses Playwright's Chrome DevTools Protocol integration. These features are a critical differentiator over Cypress, which lacks native service worker testing.

**Performance regression testing.** Vitest's `bench` API provides micro-benchmarking for DSP emulation functions (BRR decoding, resampling, envelope calculation). E2E performance testing uses Playwright's Chrome DevTools Protocol to measure Web Audio `render` callback timing. Performance thresholds are enforced in CI but with tolerance ranges to accommodate CI runner variability.

**Resampler accuracy testing.** ADR-0014 introduces a sinc resampler (Lanczos-3 polyphase FIR) as a core audio quality feature. Unit tests verify resampler correctness by passing a known swept-sinusoid input through the resampler and analyzing the output spectrum via FFT — confirming that frequencies below 16 kHz pass at unity gain (±0.1 dB) and frequencies above 16 kHz are attenuated by at least 60 dB. Deterministic round-trip tests compare the resampler's output sample-by-sample against pre-computed reference values for both linear and sinc modes. This catches coefficient computation errors, off-by-one bugs in phase selection, and incorrect accumulator updates that would produce subtle quality degradation difficult to detect by ear.

**Reference render comparison testing.** Per ADR-0001's confirmation criteria, integration tests compare rendered SPC output sample-by-sample against known-good reference renders (bsnes/higan output). A "golden file" test suite runs a curated set of reference SPC files through the emulation pipeline and diffs the output against pre-computed reference WAV files. These tests are too slow for pre-commit hooks but run as a CI validation step to catch emulation regressions.

### CI Pipeline Integration

The test suite integrates with GitHub Actions as defined in the requirements:

```
lint → type-check → unit tests → integration tests → E2E tests → deploy
```

- **Unit tests** (`npx vitest run --project unit`): run first, fastest feedback. Coverage report generated and checked against thresholds.
- **Integration tests** (`npx vitest run --project integration`): run after unit tests pass.
- **E2E tests** (`npx playwright test`): run last against the production build (`npm run build && npm run preview`). Playwright's `--shard` flag distributes across CI matrix jobs when the suite grows large.
- **Pre-commit hooks**: lint + type-check + unit tests (integration and E2E are too slow for pre-commit).

### Related Decisions

- UI framework selection (ADR-0002) — chose React, which determines the integration testing library (React Testing Library).
- Audio pipeline architecture (ADR-0003) — AudioWorklet + WASM pipeline constrains what can be tested at each layer.
- WASM build pipeline (ADR-0007) — raw WASM exports with `extern "C"` functions define the WASM integration testing contract.
- State management architecture (ADR-0005) — Zustand store testing uses Vitest with direct store access.
- CSS methodology (ADR-0004) — CSS Modules are resolved by Vitest through shared Vite config.
- Bundler configuration (ADR-0009, pending) — Vite configuration is shared between bundler and test runner.
