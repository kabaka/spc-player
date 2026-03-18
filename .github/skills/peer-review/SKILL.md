---
name: peer-review
description: Code and design review checklists, feedback quality standards, and iterative review process.
---

# Peer Review

Use this skill when conducting code reviews, design reviews, or plan reviews.

## Review Process

1. **Understand intent**: read the description/context before looking at code.
2. **Check correctness**: does the change do what it claims?
3. **Check completeness**: are tests, docs, and edge cases covered?
4. **Check quality**: is the code readable, maintainable, consistent?
5. **Check safety**: any security, performance, or accessibility concerns?
6. **Provide feedback**: specific, actionable, categorized.

## Feedback Categories

- **Blocking**: must be fixed before approval. Correctness bugs, security issues, missing tests for new behavior.
- **Suggestion**: recommended improvement. Style preference, alternative approach, readability enhancement.
- **Praise**: call out particularly good work. Positive reinforcement matters.
- **Question**: seek clarification. Not a request for change.

## Feedback Quality

- Be specific: point to the exact location and explain the concern.
- Suggest a fix: don't just say "this is wrong" — propose an alternative.
- Explain why: "this could cause X because Y" is better than "don't do this."
- Be kind: critique the code, not the author.
- Distinguish taste from substance: if it works and meets standards, approve it even if you'd write it differently.

## Checklist

- [ ] Change matches the stated intent / acceptance criteria
- [ ] Tests cover new behavior and edge cases
- [ ] No obvious logic errors or off-by-one mistakes
- [ ] Error handling is appropriate
- [ ] Code follows project style conventions
- [ ] No security concerns (input validation, XSS, etc.)
- [ ] No performance regressions
- [ ] Accessibility is not degraded
- [ ] Documentation is updated if behavior changed
- [ ] Commit messages follow conventional commits
- [ ] No stray debug code, console.log, or TODO without issue reference

## Iterative Review

When reviewing plans or designs through multiple cycles:

- Each review round should provide fresh, independent feedback.
- Don't repeat feedback already addressed — check the latest version.
- Plans should be updated in-place, not made longer with each cycle.
- Converge toward approval: if major issues are resolved, approve with minor suggestions.
