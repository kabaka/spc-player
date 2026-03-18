---
name: web-research
description: Web search strategies, source evaluation, and research workflows for technical investigation.
---

# Web Research

Use this skill when conducting technical research, evaluating libraries, or investigating unfamiliar topics.

## Research Workflow

1. **Define the question**: be specific about what you need to learn.
2. **Search**: use targeted queries. Combine terms for precision.
3. **Evaluate sources**: prefer primary sources, official docs, reputable references.
4. **Verify**: cross-reference findings across multiple sources.
5. **Document**: record findings and sources in `.ephemeral/research/` or directly in relevant docs.

## Source Hierarchy (most to least reliable)

1. Official documentation and specifications.
2. Source code and reference implementations.
3. Peer-reviewed papers and technical standards (e.g., RFCs).
4. Reputable blogs from known experts or organizations.
5. Stack Overflow answers with high scores and recent dates.
6. Forum posts, wiki pages, and tutorials.

## Search Strategies

- **Exact phrase**: `"SPC700 instruction set"` — find exact matches.
- **Site-specific**: `site:developer.mozilla.org AudioWorklet` — search within a domain.
- **Filetype**: `filetype:pdf SNES audio architecture` — find specific document types.
- **Recency**: filter by date for API compatibility questions.
- **Negation**: `-deprecated` — exclude irrelevant results.

## Evaluating Libraries

When researching libraries or tools, assess:

| Factor | What to Check |
| ------ | ------------- |
| Maintenance | Last commit, release frequency, open issues |
| Quality | Test coverage, TypeScript support, documentation |
| Size | Bundle size (bundlephobia), tree-shakeable |
| License | Must be MIT/Apache-2.0/BSD compatible |
| Adoption | npm downloads, GitHub stars (as a secondary signal) |
| Security | Known vulnerabilities (npm audit, Snyk) |

## Recording Research

- Use `.ephemeral/research/` for raw notes and exploration.
- Promote conclusions to relevant docs or ADRs.
- Always cite sources with URLs.
- Note the date of research — web content changes.

## Anti-Patterns

- Don't trust a single source for critical decisions.
- Don't use outdated information (check publication dates).
- Don't copy code from the web without understanding it.
- Don't assume Stack Overflow answers are correct — verify.
