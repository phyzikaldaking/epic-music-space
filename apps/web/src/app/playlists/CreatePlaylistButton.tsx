"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function CreatePlaylistButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setOpen(false);
    setName("");
    setError(null);
  }

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give it a name.");
      return;
    }
    setError(null);
    try {
      const res = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Couldn't create the playlist.");
        return;
      }
      const body = (await res.json()) as { playlist: { id: string } };
      reset();
      startTransition(() => {
        router.push(`/playlists/${body.playlist.id}`);
        router.refresh();
      });
    } catch {
      setError("Network error. Try again.");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600"
      >
        + New playlist
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") reset();
        }}
        placeholder="Playlist name"
        maxLength={120}
        className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-brand-500/70 focus:outline-none"
      />
      <button
        type="button"
        onClick={submit}
        disabled={isPending}
        className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-50"
      >
        {isPending ? "Creating…" : "Create"}
      </button>
      <button
        type="button"
        onClick={reset}
        className="rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold text-white/75 hover:bg-white/5"
      >
        Cancel
      </button>
      {error && (
        <p className="text-xs font-semibold text-rose-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
