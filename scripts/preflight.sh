#!/usr/bin/env bash
# Preflight gates run before every push. Catches the failure modes
# we've already burned ourselves on:
#   - `ssr: false` in Server Components (caught by lint + typecheck)
#   - empty/missing env vars (caught by requiredEnv on a dry import)
#   - regression on the focused vitest suites we wrote
#
# Skip with: git push --no-verify

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ "${EMS_PREFLIGHT_SKIP:-0}" == "1" ]]; then
  echo "[preflight] EMS_PREFLIGHT_SKIP=1 — skipping (use sparingly)"
  exit 0
fi

start=$(date +%s)

echo "[preflight] 1/3  Lint (apps/web)"
npm --workspace apps/web run lint --silent

echo "[preflight] 2/3  TypeScript (apps/web)"
# Skip Next's auto-generated .next/types so we don't need a .next dir.
npm --workspace apps/web exec -- tsc --noEmit -p tsconfig.json --excludeFiles ".next/types/**" 2>/dev/null \
  || npm --workspace apps/web exec -- tsc --noEmit -p tsconfig.json

echo "[preflight] 3/3  Vitest (focused suites)"
npm --workspace apps/web exec -- vitest run \
  src/lib/__tests__/requiredEnv.test.ts \
  src/lib/__tests__/studioNewMode.test.ts \
  src/lib/__tests__/vaultRouting.test.ts \
  src/lib/__tests__/prismaDatasourceUrl.test.ts \
  src/lib/__tests__/paymentIdempotencyRoutes.test.ts \
  src/lib/__tests__/routeHardening.test.ts

end=$(date +%s)
echo "[preflight] ✓ green in $((end - start))s"
