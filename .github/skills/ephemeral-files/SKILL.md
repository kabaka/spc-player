---
name: ephemeral-files
description: Usage conventions for .ephemeral/ scratch directory — research notes, drafts, and temporary artifacts.
---

# Ephemeral Files

Use this skill when creating temporary files for research, drafts, debugging, or scratch work.

## Purpose

The `.ephemeral/` directory is a gitignored scratch space for temporary artifacts that should not be committed. It replaces the use of system temp directories (e.g., `/tmp/`) to keep work visible and organized.

## Directory Structure

```
.ephemeral/
├── research/          # Research notes, web findings, comparisons
├── drafts/            # Draft documents, WIP content
├── debug/             # Debug logs, test outputs, repro cases
├── scratch/           # Anything temporary that doesn't fit elsewhere
└── exports/           # Temporary audio exports for testing
```

## Rules

1. **Never commit**: `.ephemeral/` is in `.gitignore`. Nothing here should be committed.
2. **Always use `.ephemeral/`**: never create scratch files in `/tmp/`, the home directory, or anywhere outside the project.
3. **Organize**: use subdirectories by purpose (`research/`, `debug/`, etc.).
4. **Name descriptively**: `research/brr-decode-comparison.md`, not `notes.txt`.
5. **Promote or delete**: if content is valuable, move it to a proper location (docs, code). Otherwise, delete it.
6. **No secrets**: don't store credentials, tokens, or sensitive data in ephemeral files.
7. **Subagent output**: write code and tests directly to their final locations. Write plans, research, reviews, and lengthy reports to `.ephemeral/` and return the file path to the orchestrator. The orchestrator passes paths — not content — to downstream agents.

## Common Use Cases

### Research Notes

```markdown
# .ephemeral/research/dsp-pitch-calculation.md

Investigating how S-DSP calculates pitch from the pitch register...
Sources:

- [link to fullsnes documentation]
- [link to reference implementation]

Findings:

- Pitch register is 14-bit, value represents...
```

### Debug Artifacts

```
.ephemeral/debug/crackle-repro.spc    # File that reproduces a bug
.ephemeral/debug/waveform-dump.bin     # Raw audio output for analysis
```

### Draft Documents

```
.ephemeral/drafts/adr-003-draft.md    # ADR draft before promoting to docs/decisions/
```

## Cleanup

- Clean up ephemeral files when they're no longer needed.
- Agents should create files here freely but also clean up after themselves.
- The directory can be safely deleted at any time: `rm -rf .ephemeral/*`
