---
name: library-evaluation
description: Evaluate build-vs-buy decisions and compare libraries using structured criteria and evidence.
---

# Library Evaluation

Use this skill when deciding between building a component from scratch or adopting an existing library, and when comparing multiple library options.

## When to Use

- Selecting a framework, library, or tool
- Deciding whether to build custom or use existing
- Evaluating a dependency for security, maintenance, or fitness
- Periodic review of existing dependencies

## Build vs. Buy Decision

Ask these questions before writing custom code:

1. **Does a mature library exist?** Check npm, GitHub, and community recommendations.
2. **Does it fit our constraints?** Client-side only, reasonable bundle size, TypeScript support, permissive license.
3. **Is it maintained?** Recent commits, responsive to issues, multiple contributors.
4. **What's the cost of adoption?** Integration effort, learning curve, API surface we'd actually use.
5. **What's the cost of building?** Development time, testing, ongoing maintenance.
6. **What's the switching cost?** How tightly would we couple to this library?

Default to using a library when a good one exists. Build custom only when:

- No library fits the specific requirements (e.g., SNES DSP emulation).
- The library would be the majority of the bundle for a small feature.
- The library is unmaintained and the domain is simple enough to own.

## Comparison Criteria

| Criterion          | How to Assess                                               |
| ------------------ | ----------------------------------------------------------- |
| Bundle size        | Check bundlephobia.com or `npm pack`                        |
| TypeScript support | Native types preferred over @types/                         |
| Maintenance        | Commit frequency, issue response time, release cadence      |
| Community          | GitHub stars, npm downloads, Stack Overflow activity        |
| License            | Must be MIT, Apache-2.0, BSD, or similar permissive license |
| API quality        | Is the API ergonomic? Does it encourage correct usage?      |
| Tree-shakability   | Does it support ESM and dead-code elimination?              |
| Dependencies       | Fewer transitive deps = less supply chain risk              |
| Browser support    | Must work on all target platforms                           |

## Output

Present findings as a comparison table with a recommendation and rationale. Note risks and migration path if the library becomes unmaintained.
