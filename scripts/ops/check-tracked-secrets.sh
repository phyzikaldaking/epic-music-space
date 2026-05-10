#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

pattern='sk_live_[A-Za-z0-9]{20,}'

if matches=$(git grep -nI -E "$pattern" -- . 2>/dev/null); then
  echo "[secrets] possible live Stripe secret found in tracked files:"
  echo "$matches"
  echo
  echo "[secrets] remove the key, rotate it in Stripe, and move it to untracked env storage before pushing."
  exit 1
fi

echo "[secrets] no live Stripe secrets found in tracked files"
