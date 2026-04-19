# EMS (Epic Music Space) — Production Readiness Blueprint

## Scope of this assessment

This repository currently contains no application source code, infrastructure code, dependency manifests, or runtime configuration beyond Git metadata and a placeholder file. Because there are no implementational artifacts to inspect, this blueprint is a **systems-level architecture and security plan** that should be applied as code is added.

---

## A) Critical Issues (must fix immediately)

1. **No deployable codebase exists yet**
   - No frontend, backend, DB schema, API contract, IaC, or environment manifests are present.
   - Impact: no meaningful runtime hardening or performance optimization can be executed.

2. **No security controls codified**
   - Missing baseline controls: auth model, RBAC, secrets management policy, dependency scanning, and secure headers policy.
   - Impact: high risk of insecure defaults once code begins landing.

3. **No CI/CD guardrails**
   - No pipeline enforcing tests, static analysis, vulnerability checks, secret scanning, or branch protections.
   - Impact: supply-chain and regression risk from day one.

4. **No observability strategy**
   - Logging standards, tracing, metrics, alerting, SLOs, and incident response are undefined.
   - Impact: blind operations and long MTTR in production.

---

## B) High-Leverage Improvements

1. **Bootstrap a monorepo with clear domains**
   - `apps/web` (frontend), `apps/api` (backend), `packages/shared` (types/schemas), `infra` (Terraform/Vercel/Supabase), `docs`.

2. **Establish contract-first APIs**
   - OpenAPI or tRPC schemas as a single source of truth.
   - Generate clients/types to prevent drift.

3. **Adopt zero-trust service boundaries early**
   - JWT with short TTL + refresh strategy.
   - Service-to-service auth via signed tokens.

4. **Create platform engineering defaults**
   - PR templates, issue templates, CODEOWNERS, semantic versioning, changelog automation.

5. **Enforce architecture decision records (ADRs)**
   - Track decisions for DB, auth, cache, queue, AI components.

---

## C) Security Fixes / Hardening Plan

### 1) Identity & access
- Use managed auth (e.g., Supabase Auth / Auth0 / Clerk) with:
  - MFA for admin roles.
  - RBAC role matrix (`listener`, `artist`, `moderator`, `admin`, `service`).
  - Principle of least privilege across DB/service accounts.

### 2) Secrets & key management
- Prohibit secrets in repo.
- Enforce pre-commit and CI secret scans (gitleaks/trufflehog).
- Store secrets in managed vaults (Vercel encrypted env + cloud secret manager).
- Rotate keys on schedule with incident-triggered emergency rotation runbook.

### 3) API protection
- Strict CORS allowlist by environment.
- Add security headers:
  - CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy.
- Rate limit login and mutation endpoints.
- Add WAF and bot mitigation for public endpoints.

### 4) OWASP alignment
- Input validation at boundary (Zod/JSON schema).
- Parameterized DB queries only.
- Centralized error handling with safe messages.
- CSRF protection for cookie-backed auth.

### 5) Supply-chain security
- Pin action versions in GitHub workflows.
- Enable Dependabot + security updates.
- Generate SBOM (CycloneDX) in CI.
- Block vulnerable dependencies with severity thresholds.

---

## D) Performance Upgrades

### Frontend
- SSR/ISR strategy for discovery pages.
- Route-level code splitting and image optimization.
- CDN edge caching with stale-while-revalidate.
- RUM metrics capture: LCP, INP, CLS.

### Backend/API
- Read-through cache for hot catalog endpoints.
- Queue heavy jobs (audio analysis, transcoding, recommendations).
- Use connection pooling and query budgets.
- Add idempotency keys for payment/subscription mutations.

### Database
- Start with Postgres + partitioning strategy for high-volume events.
- Add indexes for feed/search/recommendation lookups.
- Archive cold data to cheaper storage tiers.
- Use read replicas for heavy read traffic.

### AI services
- Introduce offline feature generation pipeline.
- Cache model outputs with TTL and invalidation keys.
- Add evaluation harness + hallucination/quality checks.

---

## E) Optimized Architecture Blueprint

### Suggested target architecture

1. **Client Layer**
   - Web app on Vercel (edge/static mix).
   - Optional mobile client reusing shared API contracts.

2. **API Layer**
   - BFF/API gateway with auth, rate limiting, request validation.
   - Domain services:
     - User/Profile Service
     - Music Catalog Service
     - Recommendation Service (AI)
     - Billing/Subscription Service

3. **Data Layer**
   - Postgres (primary + read replicas)
   - Redis (cache, session, queues)
   - Object storage (audio assets, artwork)
   - Analytics warehouse (events and BI)

4. **Async/Event Layer**
   - Message broker (e.g., Kafka/PubSub/SQS) for event-driven workflows.
   - Workers for transcoding, moderation, embeddings, notifications.

5. **Security & Compliance Layer**
   - Centralized IAM, secrets manager, audit logs.
   - WAF, DDoS protection, anomaly detection.
   - Encryption at rest + in transit (TLS 1.2+).

6. **Observability Layer**
   - Structured logs + trace IDs.
   - Metrics + distributed tracing.
   - SLO dashboards + paging alerts.

7. **Delivery Layer**
   - GitHub Actions CI + protected branches.
   - Progressive rollout (preview → staging → production).
   - Rollback automation and canary deployment support.

---

## Immediate implementation sequence (first 2 weeks)

1. Initialize monorepo structure + baseline lint/test/format.
2. Add auth + RBAC skeleton and API contract definitions.
3. Add DB migrations + seed strategy.
4. Add CI security gates (SAST, dependency scan, secret scan).
5. Add observability SDK + centralized logging.
6. Build first vertical slice (sign-up → browse → play preview).

---

## Production readiness checklist (must-pass before launch)

- [ ] Threat model completed and reviewed.
- [ ] AuthN/AuthZ penetration-tested.
- [ ] Security headers and CORS validated.
- [ ] P95 API latency and error budgets within SLO.
- [ ] Load test at projected peak x3 complete.
- [ ] Disaster recovery drill validated.
- [ ] Alerting and on-call runbooks tested.
- [ ] Data retention and privacy policies enforced.
- [ ] CI/CD gates mandatory on main branch.
- [ ] Rollback tested in staging and production.
