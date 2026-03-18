---
name: github-research
description: GitHub search techniques, ecosystem analysis, and open-source reference implementation discovery.
---

# GitHub Research

Use this skill when searching GitHub for reference implementations, prior art, or ecosystem analysis.

## When to Use

- Finding existing SPC/SNES emulator implementations for reference.
- Evaluating open-source libraries before adopting.
- Understanding how others solved similar problems.
- Checking for existing tools or components to avoid reinventing.

## GitHub Search Techniques

### Code Search

```
language:typescript audioworklet spc
language:rust spc700 emulator
language:c "brr decode" snes
```

- Filter by language to find relevant implementations.
- Use exact phrases for specific terms.
- Search for function/variable names when looking for implementations.

### Repository Search

- Search by topic: `topic:snes topic:emulator`
- Sort by stars or recent activity.
- Check README, license, and last commit date.

### Advanced Qualifiers

| Qualifier | Example | Purpose |
| --------- | ------- | ------- |
| `language:` | `language:typescript` | Filter by language |
| `stars:` | `stars:>100` | Popular repos |
| `pushed:` | `pushed:>2024-01-01` | Recently active |
| `license:` | `license:mit` | License filter |
| `topic:` | `topic:web-audio` | Topic tags |
| `in:readme` | `spc player in:readme` | Search in README |

## Reference Repos to Know

For SPC/SNES audio:

- SPC emulator implementations in C/C++/Rust.
- BRR codec implementations.
- SNES emulator audio subsystems.
- Web Audio-based music players.

## Evaluation Criteria for Reference Code

1. **License compatibility**: must be compatible with MIT.
2. **Code quality**: is it well-structured and documented?
3. **Accuracy**: does it produce correct output? (Compare against known-good emulators.)
4. **Relevance**: does it solve the same problem we have?
5. **Portability**: can concepts be applied to our TypeScript/WASM stack?

## How to Use Reference Code

- **Study, don't copy**: understand the algorithm, then implement independently.
- **Credit**: cite reference implementations in code comments or ADRs.
- **Verify**: test our implementation against the same test cases.
- **License compliance**: if adapting code, follow the source license requirements.

## Recording Findings

- Save research notes in `.ephemeral/research/`.
- Include repository URLs, key findings, and relevance assessment.
- Promote actionable findings to ADRs or architecture docs.
