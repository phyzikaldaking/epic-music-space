# Performance Budget Runbook

## CI gate

`npm run perf:budget` runs after `npm run build:web` in CI.

It checks route-level App Router chunks for:

- `/`
- `/marketplace`
- `/radar`
- `/trending`
- `/admin/ops`
- `/admin/risk`

Budgets are intentionally set just above current production-build baselines. Tighten them after reducing shared client JS.

## If the gate fails

1. Identify the route that grew.
2. Check whether a new client component was imported above the page boundary.
3. Move heavy UI to dynamic imports or server components.
4. Avoid importing large visualization, 3D, media, or SDK packages from global providers.
5. Rebuild and rerun:

```bash
npm run build:web
npm run perf:budget
```

## Browser smoke

Run the public browser smoke suite against local or preview:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm --workspace apps/web run test:browser
PLAYWRIGHT_BASE_URL=https://preview.example.com npm --workspace apps/web run test:browser
```

## Latency budgets

Set `PERF_BASE_URL` or `SYNTHETICS_BASE_URL` to enable live latency checks:

```bash
PERF_BASE_URL=https://epicmusicspace.com npm run perf:budget
```
