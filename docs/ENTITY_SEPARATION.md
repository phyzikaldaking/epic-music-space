# Entity Separation Policy: Epic Music Space vs Credit Care

This repository supports multiple products inside a monorepo, with strict logical separation:

## Entity boundaries

- **Epic Music Space (EMS)** code lives in EMS-labeled workspaces (`@ems/*`, `apps/web`, `apps/api`).
- **Credit Care** code lives in `apps/credit-care` under package name `@creditcare/app`.
- EMS and Credit Care must not import each other's product-domain code directly.

## Allowed shared surface

- Neutral shared packages only (`packages/db`, `packages/utils`, `packages/ui`) when those packages remain product-agnostic.
- Infrastructure-level sharing (CI, package manager, monorepo tooling, and optionally payment accounts) is allowed.

## Forbidden coupling

- EMS route handlers, UI components, auth flows, or brand constants used in Credit Care.
- Credit Care business logic embedded in EMS applications.
- Environment variable namespaces mixed between entities.

## Implementation note

If a shared module starts to contain product-specific assumptions, split it into entity-specific modules immediately.
