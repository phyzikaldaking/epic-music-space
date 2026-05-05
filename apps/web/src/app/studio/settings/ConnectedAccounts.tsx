"use client";
import { useEffect, useState } from "react";

interface ConnectedAccount {
  id: string;
  provider: string;
  providerAccountId: string;
}

export default function ConnectedAccounts() {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/social/list")
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "Unable to load connected accounts");
        }
        return r.json() as Promise<ConnectedAccount[]>;
      })
      .then((data) => {
        setAccounts(Array.isArray(data) ? data : []);
        setError(null);
      })
      .catch((err: Error) => {
        setAccounts([]);
        setError(err.message);
      });
  }, []);

  // These targets are API routes that redirect to the OAuth provider — they
  // need a real browser navigation, not next/link's SPA transition. Hence
  // <a> with the lint rule disabled on each line.
  return (
    <div>
      <h3 className="text-lg font-semibold">Connected accounts</h3>
      {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
      {!error && accounts.length === 0 ? <p className="mt-2 text-sm text-white/55">No connected social accounts yet.</p> : null}
      <ul className="space-y-2 mt-3">
        {accounts.map((a) => (
          <li key={a.id} className="flex items-center justify-between">
            <div>
              <div className="font-medium">{a.provider}</div>
              <div className="text-sm text-muted-foreground">{a.providerAccountId}</div>
            </div>
            <div>
              <a className="btn" href={`/api/social/connect/${a.provider}`}>Reconnect</a>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 space-x-2">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="btn" href="/api/social/connect/twitter">Connect Twitter/X</a>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="btn" href="/api/social/connect/instagram">Connect Instagram</a>
      </div>
    </div>
  );
}
