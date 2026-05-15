/* eslint-disable react/no-unescaped-entities, @next/next/no-html-link-for-pages */
// global-error.tsx is Next.js's last-resort error boundary that wraps <html>.
// It must work even when the React tree is broken, so we use plain <a>/raw
// quotes rather than next/link or escaped entities — both are documented Next
// patterns for this file.
'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Report error asynchronously to avoid infinite loops
  if (typeof window !== 'undefined' && error) {
    try {
      void fetch('/api/internal/error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error.message,
          digest: error.digest,
          stack: error.stack?.slice(0, 4000),
          href: window.location.href,
        }),
      }).catch(() => {});
    } catch (_e) {
      // Silently fail
    }
  }

  return (
    <html>
      <body className="m-0 flex min-h-screen items-center justify-center bg-[#0a0a0a] p-0 font-sans text-white">
        <div className="max-w-[480px] p-8 text-center">
          <h1 className="mb-3 text-[28px]">Something went wrong</h1>
          <p className="mb-6 text-white/60">
            We're looking into it. Try again or reach out to support@epicmusicspace.com.
          </p>
          {error.digest && <p className="mb-6 text-xs text-white/30">ref: {error.digest}</p>}
          <div className="flex flex-wrap justify-center gap-3">
            <button onClick={reset} className="cursor-pointer rounded-xl bg-violet-500 px-6 py-3 font-bold text-white">
              Try again
            </button>
            <a
              href="/"
              className="inline-block rounded-xl border border-white/15 bg-white/[0.05] px-6 py-3 font-semibold text-white/70 no-underline"
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
