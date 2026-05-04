import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    // Don't capture aborted requests / client disconnects as errors.
    ignoreErrors: ["AbortError", "NEXT_NOT_FOUND", "NEXT_REDIRECT"],
    // Surface slow server-side spans so we hear about them before users do.
    // Spans longer than 3s become breadcrumbs visible in any future error
    // captured in the same trace; spans longer than 10s are escalated to
    // their own warning event.
    beforeSendTransaction(transaction) {
      const durationMs = transaction.timestamp && transaction.start_timestamp
        ? (transaction.timestamp - transaction.start_timestamp) * 1000
        : 0;
      if (durationMs > 10_000) {
        Sentry.captureMessage(
          `Slow request (${Math.round(durationMs)}ms): ${transaction.transaction ?? "unknown"}`,
          "warning",
        );
      }
      return transaction;
    },
  });
}
