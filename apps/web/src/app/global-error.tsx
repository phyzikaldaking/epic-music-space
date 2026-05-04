"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Best-effort: ship to whatever sink is configured. /api/internal/error
    // accepts these and forwards to Sentry / logs / alert webhook depending
    // on what's set in env.
    fetch("/api/internal/error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        message: error.message,
        digest: error.digest,
        stack: error.stack?.slice(0, 4000),
        href: typeof window !== "undefined" ? window.location.href : null,
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="en">
      <body style={{
        margin: 0,
        padding: 0,
        background: "#0a0a0a",
        color: "#fff",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <div style={{ maxWidth: 480, padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 12px" }}>
            Something went wrong
          </h1>
          <p style={{ color: "rgba(255,255,255,0.6)", lineHeight: 1.6, margin: "0 0 24px" }}>
            We&apos;ve been notified and are looking into it. Try again, and if it keeps
            happening reach out to support@epicmusicspace.com.
          </p>
          {error.digest && (
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, fontFamily: "monospace", margin: "0 0 24px" }}>
              ref: {error.digest}
            </p>
          )}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                background: "#8b5cf6",
                color: "#fff",
                border: 0,
                padding: "12px 24px",
                borderRadius: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <Link
              href="/"
              style={{
                background: "rgba(255,255,255,0.05)",
                color: "rgba(255,255,255,0.7)",
                border: "1px solid rgba(255,255,255,0.15)",
                padding: "12px 24px",
                borderRadius: 12,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Go home
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
