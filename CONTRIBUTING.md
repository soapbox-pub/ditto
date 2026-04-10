# Contributing to Ditto

We welcome contributions, but we have high standards. Ditto is a carefully designed product with a specific vision, and every merge request must meet that bar. This guide exists to help you succeed.

**Required reading before you start:**

- [Ditto Philosophy](https://about.ditto.pub/philosophy) -- the product vision. Your change must align with it.
- [Contributing Guide](https://about.ditto.pub/contributing) -- the upstream contribution process.
- `AGENTS.md` in this repo -- the codebase conventions. Your AI tool should load this file.

## What we accept

### Bug fixes

One bug, one merge request. Fix exactly one thing. Don't bundle unrelated changes, don't sneak in refactors, don't "clean up while you're in there." Small, focused MRs get reviewed fast. Large ones sit.

Before starting, comment on the issue saying you'd like to work on it. For straightforward bug fixes a maintainer may not respond -- that's fine, go ahead. But if there's any ambiguity about scope or approach, wait for confirmation.

### New features and significant changes

New features require explicit maintainer approval before you write any code. Comment on the issue explaining your intended approach and wait for a thumbs-up. MRs submitted without this confirmation will be closed.

If you have an idea for a feature that doesn't have an issue yet:

1. Build it as a standalone Nostr app first (see [Contributing Guide](https://about.ditto.pub/contributing)).
2. Prove it works and get user feedback.
3. Open an issue to discuss integration, or comment on an existing one.
4. Wait for a maintainer to approve the direction.
5. Only then: submit a merge request.

**Unsolicited feature MRs will be closed without review.** Our open issues are our internal roadmap -- just because an issue exists doesn't mean we want an external contributor to implement it. Some issues require deep product context. When in doubt, ask first.

## Required tools

- **Claude Opus 4.6** (or the latest frontier model) -- not Sonnet, not GPT-4o, not local models. Quality depends on model quality.
- **An AI coding agent with plan/research mode** -- [OpenCode](https://opencode.ai), [Shakespeare](https://shakespeare.diy), Cursor, or similar.
- **Node.js 22+** and npm 10.9.4+.

## The contribution workflow

Follow these steps in order. Skipping steps is the most common reason MRs are rejected.

### 1. Understand the issue

Read the issue thoroughly. If anything is unclear, ask in the issue comments before writing code. Understand not just *what* to change, but *why* -- what problem does this solve for users?

### 2. Read the codebase conventions

Read `AGENTS.md` in the repo root. This is the single source of truth for how code should be written in this project. Your AI tool should load this file automatically. If it doesn't, paste it in or configure your tool to read it.

### 3. Read the philosophy

Read the [Ditto Philosophy](https://about.ditto.pub/philosophy). Ditto is a carnival, not a platform. Your change should feel like it belongs in Ditto -- not like it was transplanted from a generic social media template.

### 4. Plan before you code

Start your AI tool in **plan mode** (or research/think mode). Spend the first few prompts:

- Exploring the existing codebase to understand how similar features are implemented
- Reading the files you'll need to modify
- Proposing an approach

Do not write code until you have a plan. The most expensive mistake is implementing the wrong approach.

### 5. Implement

Switch to code mode and implement your plan. Use Opus 4.6 or equivalent.

### 6. Run the test suite

```sh
npm run test
```

This runs type-checking, linting, unit tests, and a production build. All must pass. Do not submit an MR with a failing test suite.

### 7. Self-review

Run this prompt against your diff (copy the full `git diff` output and paste it to your AI tool along with this prompt):

```
Review this diff as if you are a senior maintainer of this codebase who has to
maintain it long-term. For each finding, state the file, line, and issue.

- [ ] Does the diff contain changes that weren't requested? Flag anything out of scope.
- [ ] Is there dead code, commented-out blocks, or debug artifacts left in?
- [ ] Are there placeholder comments like "// In a real app..." or "// TODO: implement"?
- [ ] For every value displayed to a user, can you trace it from source to render without a gap?
- [ ] Are error, loading, and empty states all handled -- and in the right order?
- [ ] Does a mutation reflect in the UI without requiring a manual refresh?
- [ ] Is there a new read/write path that assumes fresh data but could get a stale cache?
- [ ] For replaceable/addressable Nostr events: is fetchFreshEvent used before mutation?
- [ ] Does anything new block the critical render path or fire N+1 network requests?
- [ ] Are Nostr queries efficient (combined kinds, relay-level filtering vs client-side)?
- [ ] Are user inputs used in queries or rendered as content without sanitization?
- [ ] Were existing patterns/conventions in AGENTS.md ignored in favor of something novel?
- [ ] Are secrets, keys, or env-specific values hardcoded?
- [ ] Does the code use the `any` type anywhere?
- [ ] Is the code Capacitor-compatible (no `<a download>`, no `window.open()`)?

Skip anything a linter or type checker would catch. Focus on logic, data flow, and intent.

Then answer: "If you were the people who have to maintain this codebase and deal
with all long-term issues, what would be your biggest concerns about this
implementation?"
```

Address every finding before submitting.

### 8. Deploy a live preview

Deploy your branch so reviewers can test it without pulling your code:

```sh
npm run build
npx surge dist your-branch-name.surge.sh
```

Or use Netlify, Vercel, or any static hosting. Include the live preview URL in your MR description.

### 9. Take screenshots

Capture before and after screenshots of any UI changes. Include them directly in the MR description. If your change has no visual component, state that explicitly.

### 10. Submit

Fill out every field in the MR template. Incomplete MRs will not be reviewed.

## What gets your MR closed without review

- No linked issue
- Unsolicited features without maintainer approval on the issue
- Incomplete MR template (missing checklist, screenshots, or preview URL)
- Changes that go beyond what was asked for (scope creep)
- Placeholder code, dead code, or debug artifacts
- Evidence of low-quality AI generation ("In a real application..." comments, hallucinated APIs, generic template code)
- Failing test suite
- No evidence of planning (code-first, think-later approach produces recognizable patterns)
- Changes that conflict with the [Ditto Philosophy](https://about.ditto.pub/philosophy)

## MR review process

1. The CI pipeline validates your MR description automatically. If it fails, read the error message and fix your MR description.
2. Maintainers will review your MR when all CI checks pass and the template is complete.
3. If changes are requested, address them promptly. Stale MRs will be closed.

We appreciate your interest in contributing. These standards exist because reviewing a low-quality MR takes 3x longer than doing the work ourselves. Help us help you by following the process.
