---
name: git-workflow
description: Git branching strategy, merge practices, and version control conventions for SPC Player.
---

# Git Workflow

Use this skill when making commits, creating branches, or managing the Git history.

## Branching Model

Simple trunk-based development:

- **`main`**: always deployable. Protected branch.
- **Feature branches**: `feat/description`, `fix/description`, `chore/description`.
- No long-lived branches. Merge quickly.
- No `develop` or `staging` branches — keep it simple.

## Branch Naming

```
feat/add-channel-mixer
fix/audio-crackle-on-pause
chore/update-dependencies
docs/add-export-guide
refactor/extract-dsp-module
test/add-brr-decode-tests
```

- Prefix matches the conventional commit type.
- Use kebab-case.
- Keep it short but descriptive.

## Commit Conventions

Follow Conventional Commits (see `conventional-commits` skill):

```
feat: add channel mute/solo controls
fix: resolve audio crackle when pausing
docs: add BRR encoding reference
chore: update vitest to 3.x
```

- One logical change per commit.
- Write commits as imperative present tense ("add", not "added").
- Reference issues when relevant: `fix: resolve crackle (#42)`.

## Merge Strategy

- **Squash merge** for feature branches: keeps main history clean.
- Write a clear squash commit message summarizing the change.
- Delete the branch after merging.

## Pull Request Conventions

- Title follows conventional commit format.
- Description includes: what changed, why, and how to test.
- Link to relevant issues or ADRs.
- All CI checks must pass before merge.
- At least one review (from code-reviewer agent or human).

## Tags and Releases

- Tag format: `YYYY.MM.DD` (date-based versioning).
- If multiple releases in a day: `YYYY.MM.DD.N` (N = sequence).
- Create a GitHub Release with auto-generated notes.
- Tags are created on `main` only.

## Forbidden Actions

- Never force-push to `main`.
- Never commit directly to `main` (use PRs).
- Never commit secrets, credentials, or `.env` files.
- Never commit `.ephemeral/` contents.
