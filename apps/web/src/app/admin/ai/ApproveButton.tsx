"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ApproveButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ai/posts/${postId}/approve`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Approval failed.");
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-200">
        ✓ Approved
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {error && (
        <span className="text-[10px] text-red-300">{error}</span>
      )}
      <button
        type="button"
        onClick={approve}
        disabled={busy}
        className="rounded-full bg-amber-400 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-black hover:bg-amber-300 disabled:opacity-50"
      >
        {busy ? "Approving…" : "Approve & post"}
      </button>
    </div>
  );
}
