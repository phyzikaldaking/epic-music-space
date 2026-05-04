import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    // Don't capture aborted requests / client disconnects as errors.
    ignoreErrors: ["AbortError", "NEXT_NOT_FOUND", "NEXT_REDIRECT"],
  });
}
