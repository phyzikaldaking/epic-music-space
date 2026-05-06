// Next.js 15+ resolves the client-side instrumentation entry from
// instrumentation-client.ts (the legacy sentry.client.config.ts is
// silently ignored on newer versions). We re-export the existing config
// from the same module so DSN / sampling tweaks have a single source of
// truth.
export * from "./sentry.client.config";
import "./sentry.client.config";
import { initBotId } from "botid/client/core";

initBotId({
  protect: [
    { path: "/api/auth/register", method: "POST" },
    { path: "/api/posts", method: "POST" },
    { path: "/api/dmca", method: "POST" },
    { path: "/api/checkout", method: "POST" },
    { path: "/api/payments/create-checkout", method: "POST" },
    { path: "/api/stripe/checkout", method: "POST" },
  ],
});
