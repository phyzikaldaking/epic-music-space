# Credit Care App Workspace

This workspace is reserved for the **Credit Care** product and legal entity.

## Separation contract

- Do **not** import from `apps/web`, `apps/api`, or any EMS-specific code.
- Shared infrastructure should go through neutral packages in `packages/*`.
- Payment infrastructure (e.g., Stripe account) may be shared operationally, but product logic and branding stay isolated.

## Next steps

1. Add Credit Care-specific app framework and routes.
2. Create `creditcare.*` environment variables and deployment targets.
3. Keep all Credit Care data models and business rules separate from EMS domain models.
