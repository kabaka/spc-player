---
status: 'accepted'
date: 2026-03-21
---

# Bundle Size Budget Increase (210 KB → 250 KB)

## Context and Problem Statement

SPC Player enforces a gzipped JavaScript bundle size budget via `scripts/check-bundle-sizes.mjs`, which runs in CI. The budget covers all main-thread JS chunks, excluding codec and worker chunks that run in separate threads.

The current budget is 210 KB gzipped. After Phase A stabilization, the production bundle is approximately 201 KB gzipped, leaving only ~9.1 KB of headroom. Phases B–F of the implementation roadmap add significant new UI features — a transport bar, playlist sidebar, visualizations, and a help dialog — estimated at 15–22 KB of additional JavaScript. The existing budget cannot accommodate this planned growth.

## Decision Drivers

- **Planned feature growth** — Phases B–F add transport controls, playlist sidebar, visualization renderers, and a help dialog. Conservative estimates put the net new JS at 15–22 KB gzipped.
- **Current headroom exhausted** — 9.1 KB remaining under a 210 KB budget is insufficient for even a single medium-complexity feature.
- **Code-splitting offsets** — `React.lazy()` for `VisualizationStage` and `HelpDialog` moves ~8–10 KB off the critical path into on-demand chunks, partially offsetting new feature code.
- **Performance accountability** — the budget exists to prevent unchecked growth. Any increase must be justified and bounded, with a clear threshold for architectural review.
- **CI enforcement** — the budget is enforced automatically; changing it requires updating the script and documenting the rationale.

## Considered Options

- **Option 1: Increase budget to 250 KB** — raise the total JS budget to 250 KB gzipped, accommodating planned features while requiring architectural review if exceeded.
- **Option 2: Keep 210 KB and aggressively code-split** — maintain the current budget and move all new features behind `React.lazy()` boundaries to stay under 210 KB.
- **Option 3: Remove the budget entirely** — rely on manual review instead of automated enforcement.

## Decision Outcome

Chosen option: **"Increase budget to 250 KB"** (Option 1), because it provides sufficient headroom for planned features while maintaining automated enforcement. The 250 KB threshold is justified by the following analysis:

- Current bundle: ~201 KB gzipped
- Planned additions (Phases B–F): +15–22 KB
- Code-splitting savings (React.lazy for viz + help): −8–10 KB
- Net projected total: ~208–213 KB gzipped
- Buffer for incremental growth: ~37–42 KB

If the bundle exceeds 250 KB, this signals either scope creep or insufficient code-splitting, warranting architectural review before further increases.

### Consequences

- Good, because CI continues to enforce a concrete, documented budget.
- Good, because the budget accommodates all planned features through Phase F without requiring further increases.
- Good, because the 250 KB ceiling establishes a clear review trigger — exceeding it requires investigation, not just another budget bump.
- Bad, because a higher budget is more permissive and could mask gradual bloat if features are added beyond the current roadmap.
- Neutral, because the budget applies only to main-thread JS; codec and worker chunks remain excluded regardless of the threshold.

## Pros and Cons of the Options

### Increase budget to 250 KB

Raise the enforced budget from 210 KB to 250 KB gzipped, with a mandate for architectural review if exceeded.

- Good, because it accommodates all planned Phase B–F features with comfortable headroom.
- Good, because it maintains automated CI enforcement.
- Good, because the increase is bounded and documented, with a clear escalation path.
- Bad, because a higher ceiling is slightly more permissive, reducing pressure to optimize.

### Keep 210 KB and aggressively code-split

Maintain the current 210 KB budget and move all new features behind dynamic `import()` boundaries.

- Good, because it forces maximum code-splitting discipline.
- Bad, because some features (transport bar, playlist sidebar) are always-visible UI that cannot be lazy-loaded — they are part of the critical rendering path.
- Bad, because excessive code-splitting adds loading waterfalls and complexity for marginal size savings on features that users interact with immediately.

### Remove the budget entirely

Delete the bundle size check and rely on developer judgment.

- Good, because it removes a maintenance burden.
- Bad, because bundle size regressions would go undetected until users experience slow load times.
- Bad, because it contradicts the project's philosophy of automated quality enforcement.

## More Information

- `scripts/check-bundle-sizes.mjs` — the CI script enforcing this budget
- ADR-0009 documents the Vite bundler configuration
- The implementation roadmap v2 (`docs/dev/implementation-roadmap-v2.md`) details Phases B–F feature scope
