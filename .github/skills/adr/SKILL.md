---
name: adr
description: Author MADR 4.0.0 architecture decision records for significant technical decisions.
---

# ADR Authoring (MADR 4.0.0)

Use this skill when creating or updating Architecture Decision Records. All significant technical decisions must be documented as ADRs.

## When to Use

- New technology or framework selection
- Module boundary or API design decisions
- Build-vs-buy evaluations
- Changes to the data model or storage strategy
- Infrastructure or deployment changes
- Any decision that would confuse a future developer without documentation

## Process

1. Copy the MADR template from `references/MADR-TEMPLATE.md`.
2. Fill in all required sections. Remove optional sections only if genuinely irrelevant.
3. Number sequentially: `NNNN-slug.md` (e.g., `0002-ui-framework-selection.md`).
4. Place in `docs/adr/`.
5. Set status to `proposed` for drafts. Set to `accepted` before committing.

## Template Sections

- **Status/Date** (YAML frontmatter): track lifecycle.
- **Context and Problem Statement**: what decision is needed and why.
- **Decision Drivers**: forces and constraints influencing the decision.
- **Considered Options**: all options evaluated (minimum two).
- **Decision Outcome**: which option was chosen, with justification.
- **Consequences**: good and bad impacts of the decision.
- **Pros and Cons of the Options**: detailed analysis of each option.
- **More Information**: links, follow-ups, related ADRs.

## Quality Criteria

- A new developer should understand the decision without external context.
- Each option must have at least one pro and one con.
- The chosen option must be justified against every decision driver.
- Superseded ADRs link to the new ADR; they are never deleted.

## References

See `references/MADR-TEMPLATE.md` for the full MADR 4.0.0 template.
