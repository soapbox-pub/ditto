#!/usr/bin/env bash
#
# check-mr.sh -- Validate merge request descriptions in CI.
#
# Runs as a GitLab CI job on merge_request_event pipelines.
# Maintainers bypass all checks. Everyone else must fill out the MR template.
#
# Required CI variables (provided automatically by GitLab):
#   CI_MERGE_REQUEST_DESCRIPTION  -- the MR description body
#   CI_MERGE_REQUEST_AUTHOR       -- the MR author's GitLab username (available in 17.9+)
#
# Fallback: If CI_MERGE_REQUEST_AUTHOR is unavailable (older GitLab),
# the script uses GITLAB_USER_LOGIN (the user who triggered the pipeline).

set -euo pipefail

# ---------------------------------------------------------------------------
# Maintainer allowlist -- these users skip all checks.
# ---------------------------------------------------------------------------
MAINTAINERS=(
  "alexgleason"
  "chadcurtis"
)

AUTHOR="${CI_MERGE_REQUEST_AUTHOR:-${GITLAB_USER_LOGIN:-}}"
DESCRIPTION="${CI_MERGE_REQUEST_DESCRIPTION:-}"

# ---------------------------------------------------------------------------
# Maintainer bypass
# ---------------------------------------------------------------------------
for m in "${MAINTAINERS[@]}"; do
  if [[ "$AUTHOR" == "$m" ]]; then
    echo "Maintainer detected ($AUTHOR) -- skipping MR description checks."
    exit 0
  fi
done

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
ERRORS=()

# 1. Linked issue (Closes #123, Fixes #123, Resolves #123, or just #123)
if ! echo "$DESCRIPTION" | grep -qiP '(closes|fixes|resolves)\s+#\d+'; then
  # Also accept a bare "#123" on the Closes line (template default)
  if ! echo "$DESCRIPTION" | grep -qP 'Closes\s+#\d+'; then
    ERRORS+=("Missing linked issue. Add 'Closes #<number>' to your MR description.")
  fi
fi

# 2. Live preview URL (or explicit N/A)
if echo "$DESCRIPTION" | grep -qiP '(https?://\S+\.(surge\.sh|netlify\.app|vercel\.app|pages\.dev)\S*)'; then
  : # Found a preview URL
elif echo "$DESCRIPTION" | grep -qiP 'N/?A\s*(-|--|:)?\s*(no\s+UI|no\s+visual|non-visual)'; then
  : # Explicitly marked as no UI changes
else
  ERRORS+=("Missing live preview URL. Deploy your branch (e.g. npx surge dist) and include the link, or write 'N/A -- no UI changes' if there are none.")
fi

# 3. Screenshots (image markdown or explicit N/A)
if echo "$DESCRIPTION" | grep -qP '!\[.*\]\(.*\)'; then
  : # Found markdown image
elif echo "$DESCRIPTION" | grep -qiP '/uploads/'; then
  : # Found GitLab upload reference
elif echo "$DESCRIPTION" | grep -qiP 'N/?A\s*(-|--|:)?\s*(no\s+UI|no\s+visual|non-visual)'; then
  : # Explicitly marked as no UI changes
else
  ERRORS+=("Missing screenshots. Include before/after screenshots, or write 'N/A -- no UI changes' if there are none.")
fi

# 4. Self-review checklist -- count checked vs unchecked boxes
CHECKED=$(echo "$DESCRIPTION" | grep -coP '\[x\]' || true)
UNCHECKED=$(echo "$DESCRIPTION" | grep -coP '\[ \]' || true)
TOTAL=$((CHECKED + UNCHECKED))

if [[ "$TOTAL" -eq 0 ]]; then
  ERRORS+=("MR template checklist is missing. Please use the default MR template.")
elif [[ "$UNCHECKED" -gt 0 ]]; then
  ERRORS+=("$UNCHECKED checklist item(s) are unchecked. Complete all items in the self-review checklist before requesting review.")
fi

# 5. "What Changed" section has content (not just the HTML comment)
WHAT_CHANGED=$(echo "$DESCRIPTION" | sed -n '/## What Changed/,/^##/p' | grep -v '^##' | grep -v '<!--' | grep -v -- '-->' | sed '/^\s*$/d')
if [[ -z "$WHAT_CHANGED" ]]; then
  ERRORS+=("The 'What Changed' section is empty. Describe what you changed and why.")
fi

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
if [[ ${#ERRORS[@]} -gt 0 ]]; then
  echo ""
  echo "============================================================"
  echo "  MR DESCRIPTION CHECK FAILED"
  echo "============================================================"
  echo ""
  echo "Your merge request description is incomplete."
  echo "Please read CONTRIBUTING.md and fix the following:"
  echo ""
  for i in "${!ERRORS[@]}"; do
    echo "  $((i + 1)). ${ERRORS[$i]}"
  done
  echo ""
  echo "This check exists to ensure every MR meets our quality bar."
  echo "See: CONTRIBUTING.md"
  echo "============================================================"
  exit 1
fi

echo "MR description checks passed."
