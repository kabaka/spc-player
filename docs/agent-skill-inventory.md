# SPC Player — Agent & Skill Inventory

## Agents

All agents live in `.github/agents/` as `.agent.md` files. Only the orchestrator is user-invocable.

| Agent                    | Role                                                                    |
| ------------------------ | ----------------------------------------------------------------------- |
| orchestrator             | Delegates all tasks; maintains context across multi-step workflows      |
| architect                | System design, ADRs, technology selection, dependency decisions         |
| debugger                 | Debugging, root cause analysis, issue triage                            |
| ux-designer              | UI layout, interaction design, visual hierarchy, motion design          |
| ux-researcher            | User research, usability heuristics, persona-driven analysis            |
| devops                   | CI/CD pipelines, build configuration, deployment, GitHub Actions        |
| sre                      | Reliability, performance budgets, monitoring, observability             |
| dba                      | Data modeling, IndexedDB schema, storage strategy, migration            |
| qa                       | Test planning, coverage analysis, bug verification, acceptance criteria |
| frontend-developer       | UI implementation, component architecture, state management             |
| test-developer           | Unit, integration, and E2E test authoring and maintenance               |
| linter                   | Code style enforcement, lint rule configuration, auto-fix               |
| snes-developer           | SNES hardware/software, SPC700, S-DSP, BRR, sound driver internals      |
| reverse-engineer         | Binary format analysis, protocol decoding, undocumented behavior        |
| researcher               | Technical research, library evaluation, specification review            |
| security                 | Threat modeling, CSP, input validation, dependency auditing             |
| audio-engineer           | Digital audio, DSP algorithms, DACs, resampling, codec selection        |
| technical-writer         | User docs, developer docs, API docs, changelog                          |
| performance-engineer     | Profiling, bundle analysis, runtime optimization, Core Web Vitals       |
| accessibility-specialist | WCAG compliance, screen reader support, keyboard navigation             |
| pwa-specialist           | Service workers, caching strategies, offline support, manifest          |
| code-reviewer            | Peer review, code quality, consistency, best practices                  |
| graphic-designer         | Visual assets, iconography, color systems, typography                   |
| api-designer             | Internal API contracts, message protocols, worker interfaces            |
| wasm-engineer            | WebAssembly compilation, memory management, JS interop                  |

## Skills

All skills live in `.github/skills/{name}/SKILL.md`. Names are lowercase with hyphens.

### Architecture & Planning

| Skill              | Purpose                                                      |
| ------------------ | ------------------------------------------------------------ |
| adr                | MADR 4.0.0 architecture decision records                     |
| brainstorming      | Structured ideation, assumption challenging, option analysis |
| library-evaluation | Evaluate build-vs-buy, compare libraries, assess maturity    |

### Development

| Skill                | Purpose                                                        |
| -------------------- | -------------------------------------------------------------- |
| code-style           | TypeScript conventions, naming, formatting, idioms             |
| file-organization    | Project structure, module boundaries, import conventions       |
| conventional-commits | Commit message format, scope conventions, breaking changes     |
| date-versioning      | Date-based version scheme, continuous release                  |
| react-typescript     | React + TypeScript patterns, hooks, component design           |
| api-design           | Internal API contracts, type-safe interfaces, worker protocols |
| wasm-integration     | WASM build pipeline, memory management, JS bridge              |

### Testing

| Skill               | Purpose                                                    |
| ------------------- | ---------------------------------------------------------- |
| unit-testing        | Unit test authoring, mocking, assertions, coverage         |
| integration-testing | Component integration, service integration, test isolation |
| e2e-testing         | Playwright E2E tests, user flow simulation, assertions     |

### Quality & Review

| Skill                  | Purpose                                                        |
| ---------------------- | -------------------------------------------------------------- |
| peer-review            | Code review checklists, feedback quality, review cycles        |
| linting                | ESLint/Prettier config, rule selection, auto-fix               |
| correctness            | Logical correctness verification, edge cases, invariants       |
| performance-evaluation | Profiling methodology, metrics, bottleneck analysis            |
| root-cause-analysis    | Active RCA methodology, evidence gathering, hypothesis testing |

### Security

| Skill                    | Purpose                                                       |
| ------------------------ | ------------------------------------------------------------- |
| security-threat-modeling | STRIDE, attack surface analysis, threat enumeration           |
| security-code-review     | OWASP top 10, CSP, input validation, dependency audit         |
| security-testing         | Security-focused testing, fuzzing strategy, pen-test planning |

### UX & Design

| Skill             | Purpose                                                          |
| ----------------- | ---------------------------------------------------------------- |
| ux-design         | Interaction patterns, visual hierarchy, information architecture |
| ux-research       | Heuristic evaluation, persona analysis, usability testing        |
| accessibility     | WCAG 2.2, ARIA, keyboard nav, screen reader patterns             |
| responsive-design | Breakpoints, touch targets, viewport adaptation                  |
| music-player-ux   | Audio player conventions, waveform display, transport controls   |
| graphic-design    | Color systems, typography, iconography, visual consistency       |
| dark-light-mode   | Theme switching, CSS custom properties, system preference        |

### SNES & Audio

| Skill              | Purpose                                                                |
| ------------------ | ---------------------------------------------------------------------- |
| spc-format         | SPC file structure, ID666 tags, xid6, memory layout                    |
| snes-audio         | S-DSP, S-SMP/SPC700, BRR encoding, echo, envelopes                     |
| snes-hardware      | SNES architecture, memory map, timing                                  |
| audio-fundamentals | PCM, sample rates, bit depth, dithering, resampling                    |
| audio-codecs       | WAV, FLAC, OGG, MP3 encoding/decoding in browser                       |
| web-audio-api      | AudioContext, AudioWorklet, Web Audio graph, latency                   |
| platform-audio     | Platform-specific audio behaviors, autoplay policies, background audio |
| midi-integration   | Web MIDI API, note mapping, velocity, device discovery                 |

### Infrastructure & Ops

| Skill            | Purpose                                                         |
| ---------------- | --------------------------------------------------------------- |
| pwa-development  | Manifest, service worker lifecycle, install prompts, updates    |
| cache-management | Cache busting, versioned assets, stale-while-revalidate         |
| deep-linking     | URL routing, state serialization, share URLs                    |
| offline-storage  | IndexedDB patterns, storage quotas, data migration              |
| ci-cd            | GitHub Actions, matrix builds, deployment, caching              |
| otel             | OpenTelemetry client-side instrumentation, semantic conventions |

### Documentation

| Skill                   | Purpose                                      |
| ----------------------- | -------------------------------------------- |
| user-documentation      | End-user guides, tutorials, FAQ              |
| developer-documentation | Architecture docs, onboarding, API reference |

### Process & Research

| Skill                 | Purpose                                                     |
| --------------------- | ----------------------------------------------------------- |
| web-research          | Search strategies, source evaluation, information synthesis |
| github-research       | GitHub search, issue/PR mining, ecosystem analysis          |
| git-workflow          | Branching strategy, merge practices, history hygiene        |
| ephemeral-files       | Temp file conventions, .ephemeral/ usage, cleanup           |
| ephemeral-cleanup     | Pre-commit cleanup of .ephemeral/, promote-or-discard       |
| cross-platform        | Platform detection, feature detection, graceful degradation |
| browser-compatibility | Can I Use checks, polyfills, vendor prefixes                |
