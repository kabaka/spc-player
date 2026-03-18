---
name: root-cause-analysis
description: Active RCA methodology with hypothesis testing, evidence gathering, and systematic fault isolation.
---

# Root Cause Analysis

Use this skill when investigating bugs, failures, or unexpected behavior. Active RCA means testing hypotheses, not guessing from code.

## Process

### 1. Reproduce

- Create a minimal reproduction of the issue.
- Document exact steps, inputs, and environment.
- If the issue is non-deterministic, identify the conditions that affect frequency.
- If you cannot reproduce, say so. Do not proceed with guesses.

### 2. Gather Evidence

- Collect logs, error messages, stack traces.
- Compare working vs. broken cases — what differs?
- Check recent changes (git log, diff) for likely culprits.
- Instrument code with targeted logging if needed (remove after).

### 3. Hypothesize

List possible causes ranked by likelihood. For each hypothesis:

- What evidence supports it?
- What evidence contradicts it?
- How can it be tested?

### 4. Test

For each hypothesis (starting with most likely):

- Design a test that would confirm or rule it out.
- Execute the test. Record the result.
- Move to the next hypothesis if ruled out.
- If confirmed, verify it explains all observed symptoms.

### 5. Fix

- Apply the minimal fix that addresses the root cause.
- Avoid band-aids that fix the symptom but not the cause.
- Write a regression test that fails without the fix and passes with it.

### 6. Verify

- Confirm the fix resolves the original issue.
- Confirm no other tests are broken.
- Confirm the regression test is meaningful (not tautological).

### 7. Document

- Commit message explains the root cause and fix.
- If the cause was architectural, flag for the architect.
- If the cause reveals a pattern (could happen elsewhere), search for similar issues.

## Anti-Patterns

- **Reading code and guessing**: not RCA. You must test hypotheses.
- **Fixing the symptom**: the bug will return. Find the cause.
- **Changing things until it works**: not systematic. You won't know what fixed it.
- **Assuming the reporter is wrong**: they usually aren't.

## Scratch Space

Use `.ephemeral/` for debug scripts, reproduction cases, and temporary instrumentation. Never `/tmp/`.
