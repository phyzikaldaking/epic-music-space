"use client";
import { useEffect, useState } from "react";

export default function ConnectedAccounts() {
  const [accounts, setAccounts] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/social/list")
      .then((r) => r.json())
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, []);

  return (
    <div>
      <h3 className="text-lg font-semibold">Connected accounts</h3>
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
        <a className="btn" href="/api/social/connect/twitter">Connect Twitter/X</a>
        <a className="btn" href="/api/social/connect/instagram">Connect Instagram</a>
      </div>
    </div>
  );
}
