# AI Command Workflow

Epic Music Space now has a repo-local control plane for AI-assisted work. Codex can operate from your machine, GitHub stays the code and review source of truth, Vercel stays the deploy surface, and Doppler becomes the secret source for local, preview, and production environments.

## Command flow

1. Install and sign in once.
2. Pull the `dev` Doppler config into local env files.
3. Run the doctor check before delegating work.
4. Use GitHub PRs and Vercel previews for review.
5. Push `preview` or `prod` secrets from Doppler when environments change.

## Commands

```bash
npm run agent:setup
npm run env:pull
npm run agent:doctor
npm run dev
```

```bash
npm run env:check
npm run env:push:preview
npm run env:push:prod
```

```bash
npm run stripe:listen
npm run supabase:link
```

## What each command does

- `npm run agent:setup`
  Installs missing CLIs when possible and prints the login commands you still need to run: `gh`, `vercel`, `supabase`, `stripe`, `doppler`, and `op`.
- `npm run env:pull`
  Downloads the Doppler `dev` config and writes `.env.local`, `apps/web/.env.local`, and `apps/api/.env`.
- `npm run agent:doctor`
  Verifies CLI presence, auth state, git remote wiring, Vercel project linkage, and required local env keys without printing secret values.
- `npm run env:check`
  Validates the required service keys for `dev`, `preview`, and `prod` against Doppler. If Doppler is not installed yet, it falls back to checking local env files only.
- `npm run env:push:preview`
  Syncs the Doppler `preview` config into Vercel preview env vars and GitHub Actions secrets.
- `npm run env:push:prod`
  Syncs the Doppler `prod` config into Vercel production env vars and GitHub Actions secrets.
- `npm run stripe:listen`
  Forwards Stripe events to `http://localhost:3000/api/webhooks/stripe` by default. Override with `STRIPE_WEBHOOK_FORWARD_URL`.
- `npm run supabase:link`
  Links the local repo to the Supabase project using `SUPABASE_PROJECT_REF` or the project ref derived from `NEXT_PUBLIC_SUPABASE_URL`.

## Low-friction local usage

The scripts prefer local binaries when available, but they can already fall back to `npx` for:

- `gh`
- `vercel`
- `supabase`

That means you can often keep moving even if those CLIs are not globally installed yet.

## Doppler setup

Create one Doppler project with these configs:

- `dev`
- `preview`
- `prod`

Import the env keys from:

- `.env.example`
- `apps/web/.env.example`
- `apps/api/.env.example`

Make sure the Doppler configs include these control-plane keys:

- `GITHUB_REPOSITORY`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `DOPPLER_PROJECT`
- `DOPPLER_CONFIG_DEV`
- `DOPPLER_CONFIG_PREVIEW`
- `DOPPLER_CONFIG_PROD`

Optional but helpful:

- `SUPABASE_PROJECT_REF`
- `STRIPE_WEBHOOK_FORWARD_URL`

## Service ownership

Keep shared workspaces or teams wherever possible:

- GitHub repo under the intended org or team ownership
- Vercel linked to the existing team project
- Supabase project shared with the team
- Stripe account managed from the shared workspace
- Upstash, Resend, and PostHog managed from shared workspaces

## Review and deploy loop

1. Create or update a branch locally with Codex.
2. Push the branch to GitHub.
3. Open a PR.
4. Let GitHub Actions run CI.
5. Use the Vercel preview deployment for review.
6. Merge to `main` for production deploys through Vercel Git integration.

## Notes

- `.env*` and `.vercel` remain ignored.
- The repo no longer carries the unused mobile SBOM and placeholder SonarQube workflows.
- Current CI stays focused on the workflows already relevant to this stack.
