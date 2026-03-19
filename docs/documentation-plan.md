# SPC Player — Documentation Plan

## Goal

Keep documentation organized, bounded, and useful. Prevent the unbounded growth that often afflicts AI-driven projects.

## Documentation Structure

```text
docs/
  requirements.md           # Project requirements (this is the source of truth)
  architecture.md           # High-level architecture overview
  agent-skill-inventory.md  # Inventory of all agents and skills
  documentation-plan.md     # This file
  adr/                      # Architecture Decision Records (MADR 4.0.0)
    0001-record-architecture-decisions.md
    ...
  guides/                   # End-user documentation
    getting-started.md
    ...
  dev/                      # Developer documentation
    onboarding.md
    testing.md
    deployment.md
    ...
```

## Rules

1. **ADRs are append-only.** Superseded ADRs are marked as such but never deleted. New ADRs reference the ones they supersede.

2. **No ephemeral docs in `docs/`.** Agent working notes, handoff documents, and scratch files go in `.ephemeral/` (gitignored). Session memory is also available for cross-turn context.

3. **No RCA documents in `docs/`.** RCA findings should be captured as:
   - A fix commit with a clear conventional commit message.
   - A brief note in the relevant ADR or dev doc if the finding changes architecture.
   - An inline code comment if the fix is non-obvious.

4. **Changelogs are auto-generated** from conventional commit messages. No manually maintained CHANGELOG file.

5. **User guides are feature-scoped.** One guide per major feature. Guides are updated in the same PR that changes the feature.

6. **Developer docs describe the current state.** They are updated in-place, not appended to. Historical context lives in ADRs and git history.

7. **README stays minimal.** It links to docs/ for details. It does not duplicate content.

## Bounded Growth Controls

| Document type     | Growth pattern                    | Bound                               |
| ----------------- | --------------------------------- | ----------------------------------- |
| ADRs              | Append-only, one per decision     | Natural bound: decisions are finite |
| User guides       | One per feature, updated in-place | Bounded by feature count            |
| Dev docs          | Updated in-place                  | Fixed set of topics                 |
| Requirements      | Single file, updated in-place     | Single document                     |
| Architecture      | Single file, updated in-place     | Single document                     |
| Ephemeral/scratch | Gitignored, cleaned regularly     | Not in repo                         |
