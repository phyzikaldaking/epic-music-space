/* eslint-disable react/no-unknown-property */
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
    } catch (e) {
      // Silently fail
    }
  }

  return (
    <html>
      <body style={{ margin: 0, padding: 0, background: '#0a0a0a', color: '#fff', fontFamily: 'system-ui', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ maxWidth: 480, padding: 32, textAlign: 'center' }}>
          <h1 style={{ fontSize: 28, margin: '0 0 12px' }}>Something went wrong</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', margin: '0 0 24px' }}>
            We're looking into it. Try again or reach out to support@epicmusicspace.com.
          </p>
          {error.digest && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', margin: '0 0 24px' }}>ref: {error.digest}</p>}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={reset} style={{ background: '#8b5cf6', color: '#fff', border: 0, padding: '12px 24px', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>
              Try again
            </button>
            <a href="/" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.15)', padding: '12px 24px', borderRadius: 12, fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}>
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
