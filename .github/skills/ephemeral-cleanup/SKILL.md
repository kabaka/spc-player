---
name: ephemeral-cleanup
description: Pre-commit cleanup of .ephemeral/ — promote valuable content, then remove the rest.
---

# Ephemeral Cleanup

Use this skill before committing to ensure `.ephemeral/` is clean.

## Process

1. List all files in `.ephemeral/`.
2. For each file, determine if the content should be promoted (moved to `docs/`, `src/`, or another permanent location) or discarded.
3. Promote valuable content by moving or copying it to the appropriate permanent location.
4. Run `.github/skills/ephemeral-cleanup/scripts/clean.sh` to remove all remaining ephemeral files.

## What to Promote

- Research findings that fill documentation gaps → `docs/`
- Draft ADRs that are ready → `docs/adr/`
- Reusable scripts or utilities → appropriate source directory
- Test fixtures or reference data → `tests/fixtures/`

## What to Discard

- Intermediate drafts superseded by final versions
- Debug logs and scratch notes
- Agent review output already incorporated into changes
- Temporary test exports

## Cleanup Script

Always use the cleanup script after promoting any valuable content. Never use direct `rm` commands on `.ephemeral/`.

```bash
.github/skills/ephemeral-cleanup/scripts/clean.sh
```
