---
name: brainstorming
description: Structured ideation, assumption challenging, and multi-perspective option analysis for planning and review.
---

# Brainstorming

Use this skill during planning, review, and any situation that benefits from structured thinking and diverse perspectives.

## When to Use

- Planning a new feature or architectural change
- Evaluating multiple approaches to a problem
- Reviewing designs or implementations for blind spots
- Any situation where assumptions should be challenged

## Techniques

### Assumption Challenging

1. List all assumptions underlying the current approach.
2. For each assumption, ask: "What if this is wrong?"
3. Identify which assumptions are validated and which are just convenience.
4. Flag unvalidated assumptions as risks.

### Option Analysis

1. Generate at least three distinct approaches (not variations of one idea).
2. For each option, identify: strengths, weaknesses, risks, unknowns.
3. Consider second-order effects: what does each option make easier or harder later?
4. Look for hybrid approaches that combine strengths.

### Diverse Perspectives

- Consider the problem from each user persona's viewpoint.
- Consider operational implications (deploy, monitor, debug).
- Consider the worst reasonable failure mode.
- Ask: "What would a skeptic say about this approach?"

### Decision Matrix

When comparing options:

| Criterion   | Weight | Option A | Option B | Option C |
| ----------- | ------ | -------- | -------- | -------- |
| {criterion} | {1-5}  | {1-5}    | {1-5}    | {1-5}    |

Multiply weight × score, sum per option. Highest score wins, but inspect the result — if it doesn't feel right, a criterion is probably missing or mispriced.

## Output

- Summarize findings as a ranked recommendation with rationale.
- Call out the strongest dissenting argument for the recommended option.
- Note any assumptions that should be validated before proceeding.
