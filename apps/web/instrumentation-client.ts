// Next.js 15+ resolves the client-side instrumentation entry from
// instrumentation-client.ts (the legacy sentry.client.config.ts is
// silently ignored on newer versions). We re-export the existing config
// from the same module so DSN / sampling tweaks have a single source of
// truth.
export * from "./sentry.client.config";
import "./sentry.client.config";
