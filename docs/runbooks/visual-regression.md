# Visual regression cron

A daily-ish cron that boots a Vercel Sandbox microVM with headless Chrome
and walks the public golden-path pages (`/`, `/marketplace`, `/auth/signin`,
`/trust`). It compares the agent-browser **accessibility snapshot** (the
role/name tree, not pixels) against a stored baseline, and pages on:

- **Required content missing** — a critical literal disappeared (e.g. the
  marketplace page no longer contains the word "Marketplace"). Severity
  `error`. This catches deploys that ship a broken page.
- **Structural drift** — the accessibility tree hash changed compared to
  the stored baseline. Severity `warn`. Most often this is a benign UI
  change you want to ack; sometimes it's a regression worth investigating.
- **Probe error** — sandbox boot failed, page didn't load, or chromium
  crashed. Severity `error`.

The route lives at [`/api/cron/visual-regression`](../../apps/web/src/app/api/cron/visual-regression/route.ts).
Pages flow through the shared [pager util](../../apps/web/src/lib/pager.ts).

## First-time setup

### 1. Configure Vercel sandbox auth

On Vercel, OIDC is automatic — `VERCEL_OIDC_TOKEN` is injected at runtime.
For local dev or non-Vercel hosting, set:

```
VERCEL_TOKEN=<personal access token>
VERCEL_TEAM_ID=<team id>
VERCEL_PROJECT_ID=<project id>
```

Without these, the route returns a no-op 200 (`skipped: sandbox-not-configured`).
This lets you wire the cron into `vercel.json` without breaking dev.

### 2. Bake the sandbox snapshot

The cold-boot path installs Chromium system libs + agent-browser every run
(~30 s). Bake a snapshot once for sub-second startup:

```bash
node scripts/ops/create-sandbox-snapshot.mjs
```

It prints `AGENT_BROWSER_SNAPSHOT_ID=snap_xxxxx`. Copy that into the Vercel
project env vars and redeploy.

### 3. Wire the cron

Add to `vercel.json`:

```json
{ "path": "/api/cron/visual-regression", "schedule": "30 11 * * *" }
```

11:30 UTC = early-morning US, low traffic, after most content has been
indexed. Adjust to match your traffic shape.

### 4. First run sets baselines

The first execution doesn't have a baseline in Redis to compare against —
it just records the current hashes. Subsequent runs compare. If you change
the targets list in [route.ts](../../apps/web/src/app/api/cron/visual-regression/route.ts),
treat that run as a re-baseline.

## When it pages

### required content missing

Severity: error. Fix immediately — a critical page literal is gone, which
usually means the page is broken or a route was renamed.

1. Hit the URL yourself in a browser. Confirm the missing string is really
   absent (not just rate-limited / cached oddly).
2. Check the latest deploy. Probably the regression.
3. Roll back the deploy or land a fix.

### structural drift

Severity: warn. **Don't reflexively ack.** Look at the URL and decide:

- **Benign**: you intentionally changed the page. Reset the baseline by
  deleting the Redis key:
  ```bash
  redis-cli -u "$REDIS_URL" DEL "vr:baseline:/marketplace"
  ```
  The next run records the new hash and the alarm clears.
- **Real regression**: a Cards section disappeared, a button moved into a
  nav menu that's broken on mobile, etc. Treat like a bug. Don't reset the
  baseline until the regression is fixed.

### probe error

Severity: error. Read the error message in the alert payload.

- `chromium deps install failed`: the Amazon Linux base updated and dnf
  can't find a package. Re-run `scripts/ops/create-sandbox-snapshot.mjs`
  to pick up new packages and refresh `AGENT_BROWSER_SNAPSHOT_ID`.
- `smoke test failed`: chromium can't launch. Usually a system-libs
  problem. Same fix as above.
- HTTP errors hitting our own URLs: the site is down, or `getSiteUrl()`
  is misconfigured.

## Adding new targets

Edit `TARGETS` in
[route.ts](../../apps/web/src/app/api/cron/visual-regression/route.ts).
Each target needs at least one `required` literal — pick something
load-bearing on that page (a heading, a CTA copy, a price label) that
should always render.

After deploying, the new target's first run records its baseline. Don't
add five at once and expect them to all match — they won't have baselines
yet. Stage the rollout.

## What NOT to do

- Don't switch to pixel-level diffing without a strong reason. Pixels flap
  on font loads, antialiasing, animations, and live data; you'll learn to
  ignore the pager, which is worse than not having one.
- Don't auto-update the baseline on drift. The whole point of the alert is
  that drift is suspicious. Auto-updating turns the cron into telemetry.
- Don't run the cron more than once per day per target. Each run boots a
  microVM and runs Chrome — the cost adds up. Hourly is overkill for the
  things this catches.
- Don't bake a snapshot and forget it. Re-bake when agent-browser releases
  a new chromium pin, or when probes start failing on dnf install.
