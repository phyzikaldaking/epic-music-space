import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertCriticalEnvironment } = await import("./src/lib/criticalEnv");
    const { assertRequiredEnvOnBoot } = await import("./src/lib/requiredEnv");
    const { assertStripeEnvironment } = await import("./src/lib/stripeEnv");
    assertCriticalEnvironment(process.env, { productionOnly: true });
    assertRequiredEnvOnBoot();
    assertStripeEnvironment(process.env, { productionOnly: true });
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Forward request errors caught by Next.js (Server Components, API routes, etc.)
// to Sentry. No-op when Sentry isn't configured.
export const onRequestError: (
  err: unknown,
  request: { path: string; method: string; headers: Record<string, string | undefined> },
  errorContext: { routerKind: "Pages Router" | "App Router"; routePath: string; routeType: "render" | "route" | "action" | "middleware" },
) => void = (err, request, errorContext) => {
  if (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.captureException(err, {
      tags: {
        path: request.path,
        method: request.method,
        routeType: errorContext.routeType,
      },
    });
  }
};
