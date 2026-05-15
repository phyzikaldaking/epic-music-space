# EMS Guardian Rollback Policy

## Automatic rollback triggers

- Build failure after deploy
- Smoke test failure
- Studio route crash
- API health failure
- Freeze detector failure
- Severe runtime exception spikes

## Rollback strategy

1. Identify last green deployment.
2. Promote previous stable deployment.
3. Open incident issue.
4. Lock production merges until Guardian passes.
5. Generate AI repair PR.

## Manual override

Production rollback can always be manually triggered through Vercel.
