---
name: security-threat-modeling
description: STRIDE-based threat modeling for client-side web applications processing untrusted binary files.
---

# Security Threat Modeling

Use this skill when analyzing the attack surface, identifying threats, and designing mitigations.

## Framework: STRIDE

| Threat | Relevant to SPC Player? | Primary Concern |
| ------ | ----------------------- | --------------- |
| **S**poofing | Low | No authentication/identity system |
| **T**ampering | Medium | IndexedDB data, service worker cache, SPC file modification |
| **R**epudiation | Low | No audit trail needed for single-user app |
| **I**nformation Disclosure | Low | No sensitive data; SPC files are not private |
| **D**enial of Service | Medium | Malformed SPC causing infinite loop, memory exhaustion |
| **E**levation of Privilege | Medium | XSS via metadata display, prototype pollution |

## Attack Surface

### Untrusted Input: SPC Files

- Binary format with fixed structure but user-supplied content.
- ID666 tags contain arbitrary strings (title, artist, comments).
- Malformed files could trigger buffer overruns in WASM, infinite loops in CPU emulation, or excessive memory allocation.

### Dependencies

- npm packages: supply chain risk. Audit regularly.
- WASM modules: compiled from trusted source, but verify build reproducibility.

### Web Platform

- XSS via metadata injection into DOM.
- Service worker tampering (MITM during updates).
- IndexedDB data tampering (local attacker).

## Mitigations

- Validate SPC file structure before processing. Check header magic bytes, size bounds, offset validity.
- Sanitize all string fields before rendering in the DOM. Use `textContent`, not `innerHTML`.
- Set Content Security Policy: no `unsafe-inline`, no `unsafe-eval`, no external scripts.
- Use Subresource Integrity for CDN assets.
- Limit CPU emulation cycles per frame to prevent infinite loops.
- Cap memory allocation in WASM to prevent exhaustion.
- Run `npm audit` in CI. Block on critical vulnerabilities.

## When to Model

- When adding new input sources (file formats, MIDI input, URL parameters).
- When adding new dependencies.
- When changing the service worker update flow.
- During major architectural changes.
