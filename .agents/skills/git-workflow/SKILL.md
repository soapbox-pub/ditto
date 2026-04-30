---
name: git-workflow
description: Ditto's git conventions — validating changes before committing, writing commit messages that match project style, and attributing regressions with a Regression-of trailer so the release changelog skill can filter them from the "Fixed" section.
---

# Git Workflow

Ditto expects every completed task to end with a git commit. This skill covers the pre-commit validation loop, commit-message conventions, and the `Regression-of:` trailer used by the release skill to filter intra-release regressions from the changelog.

## Pre-commit Validation

**Your task is not finished until the code type-checks and builds without errors.** In priority order:

1. **Type Checking** (required) — `tsc --noEmit`
2. **Building/Compilation** (required) — `vite build`
3. **Linting** (recommended; fix anything critical) — `eslint`
4. **Tests** (if available) — `vitest run`
5. **Git commit** (required)

The full `npm run test` script runs all of these in sequence; running it is equivalent to steps 1–4.

## Using Git

Use `git status` and `git diff` to review changes, and `git log` to learn the project's commit-message conventions before writing a new one. If you make a mistake, `git checkout` restores files.

When your changes are complete and validated, create a commit with a message that focuses on **why** the change was made (not just **what**). Summaries should fit on one line; a body is warranted for non-trivial changes.

**Always commit when you are finished making changes. Non-negotiable — every completed task ends with a commit. Don't leave uncommitted changes.**

## Contributing Guide

When preparing changes for a merge request, also follow the guidelines in `CONTRIBUTING.md`. It includes a self-review checklist (step 8) that should be run against your diff before committing.

## Attributing Regressions

When a commit fixes a bug that was introduced by an identifiable prior commit, add a `Regression-of:` trailer at the bottom of the commit message body referencing the offending commit's short SHA:

```
Fix missing background on expanded emoji picker in feeds

The compose box overhaul accidentally dropped the bg-background class
when refactoring the picker out of QuickReactMenu.

Regression-of: 3aa08ba9
```

This is a standard Git trailer (compatible with `git interpret-trailers`) that records the cause-and-effect link directly in history. It is consumed by the `release` skill to detect intra-release regressions and exclude them from the changelog's "Fixed" section, and it makes future debugging and post-mortems substantially faster.

### When to add it

- The commit fixes a bug (not a new feature, refactor, or doc change).
- The introducing commit is identifiable with reasonable effort.

### When to skip it

- The bug is pre-existing with no clear single origin.
- The behavior was always wrong (no regression).
- The introducing commit cannot be determined after a brief search.

### Finding the introducing commit

- `git log -S '<removed-or-changed-string>'` — find commits that touched a specific string.
- `git log --oneline -- path/to/file` — list all commits touching a file.
- `git blame -L <start>,<end> -- path/to/file` — find who last changed specific lines.

This convention is **strongly recommended but not required.** When the origin is non-obvious, prioritize shipping the fix over hunting indefinitely.
