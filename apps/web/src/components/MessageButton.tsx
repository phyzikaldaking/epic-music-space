"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * "Message" button on a profile — POSTs to /api/conversations to find or
 * create a 1:1 conversation, then routes to /messages/[id].
 */
export default function MessageButton({ peerId }: { peerId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerId }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? "Could not open thread.");
      router.push(`/messages/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open thread.");
      setTimeout(() => setError(null), 3000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch">
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold transition hover:bg-white/10 disabled:opacity-50"
      >
        {busy ? "Opening…" : "Message"}
      </button>
      {error && (
        <p className="mt-1 text-[11px] text-red-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
