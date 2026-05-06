#!/usr/bin/env bash
# Set GitHub branch protection on `main` for this repo.
#
# Idempotent: reapplying produces the same final state.
# Requires `gh` CLI authenticated as a repo admin (`gh auth login` with
# `repo` scope) and the GitHub API permission to administer the branch.
#
# Usage:
#   scripts/ops/setup-branch-protection.sh                # apply
#   scripts/ops/setup-branch-protection.sh --dry-run      # show plan only
set -euo pipefail

OWNER_REPO=$(gh repo view --json owner,name --jq '"\(.owner.login)/\(.name)"')
BRANCH="main"

# These names must match the `name:` field of each CI job that should
# block merges. Add new required checks here when CI grows.
REQUIRED_CHECKS=(
  "baseline-checks"
  "quality-gates"
  "dependency-audit"
  "secret-scan"
)

read -r -d '' PAYLOAD <<JSON || true
{
  "required_status_checks": {
    "strict": true,
    "checks": [
      $(printf '{"context":"%s"},\n' "${REQUIRED_CHECKS[@]}" | sed '$ s/,$//')
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1,
    "require_last_push_approval": true
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": true
}
JSON

if [[ "${1:-}" == "--dry-run" ]]; then
  echo "Would PUT to /repos/$OWNER_REPO/branches/$BRANCH/protection with:"
  echo "$PAYLOAD" | jq .
  exit 0
fi

echo "Applying branch protection to $OWNER_REPO@$BRANCH …"
echo "$PAYLOAD" | gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  --input - \
  "/repos/$OWNER_REPO/branches/$BRANCH/protection" \
  > /dev/null

echo "✓ Branch protection set on $BRANCH."
echo
echo "Next steps:"
echo "  • Verify required reviewers in GitHub UI if you want CODEOWNERS."
echo "  • Add additional required checks here as CI grows."
echo "  • Re-run after every CI rename to refresh the check names."
