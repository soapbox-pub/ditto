## Related Issue

<!-- Link the GitLab issue. MRs without a linked issue will not be reviewed. -->

Closes #

## What Changed

<!-- 1-3 sentences: what you changed and why. -->

## Live Preview

<!-- REQUIRED for UI changes. Deploy your branch and paste the URL. -->
<!-- Example: npx surge dist your-branch.surge.sh -->
<!-- Write "N/A -- no UI changes" only if this MR has zero visual impact. -->

## Screenshots

<!-- REQUIRED for UI changes. Show before and after. -->
<!-- Write "N/A -- no UI changes" only if this MR has zero visual impact. -->

| Before | After |
|--------|-------|
|        |       |

## Philosophy Alignment

<!-- How does this change align with the Ditto Philosophy? -->
<!-- https://about.ditto.pub/philosophy -->
<!-- For bug fixes: "Bug fix -- restores intended behavior" is acceptable. -->

## How to Test

<!-- Steps a reviewer can follow to verify this works. -->

1.
2.
3.

## Self-Review Checklist

<!-- Complete ALL items. MRs with unchecked boxes will not be reviewed. -->
<!-- Check a box: replace [ ] with [x] -->

### Process

- [ ] I read `AGENTS.md` before starting
- [ ] I read the [Ditto Philosophy](https://about.ditto.pub/philosophy)
- [ ] I used plan/research mode before writing code
- [ ] I used Claude Opus 4.6 (or equivalent frontier model)

### Code quality

- [ ] My diff contains ONLY changes related to the linked issue
- [ ] No dead code, commented-out blocks, or debug artifacts
- [ ] No placeholder comments (e.g. "// In a real app...")
- [ ] Error, loading, and empty states are handled
- [ ] Existing codebase patterns and conventions were followed

### Testing

- [ ] I ran `npm run test` locally and it passes
- [ ] I tested the change manually in the browser
- [ ] I ran the self-review prompt from [CONTRIBUTING.md](CONTRIBUTING.md) and addressed all findings

### Submission

- [ ] I deployed a live preview and included the URL above (or marked N/A)
- [ ] I included before/after screenshots above (or marked N/A)
