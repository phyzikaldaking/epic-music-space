"use client";

import { useEffect, useRef, useState } from "react";

interface PlaylistRow {
  id: string;
  name: string;
  trackCount: number;
}

interface Props {
  songId: string;
  className?: string;
  /** Where to send the user if they aren't signed in. Defaults to current path. */
  signInRedirect?: string;
}

/**
 * Button + popover for "Add this track to a playlist."
 *
 * Loads the caller's playlists lazily on first open so the dropdown
 * doesn't add a request to every track page on initial render. Lets
 * the user create a new playlist inline (the new playlist gets the
 * track immediately).
 */
export default function AddToPlaylistButton({
  songId,
  className,
  signInRedirect,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickAway(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function loadPlaylists() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/playlists", { cache: "no-store" });
      if (res.status === 401) {
        const next = signInRedirect ?? window.location.pathname;
        window.location.href = `/auth/signin?callbackUrl=${encodeURIComponent(next)}`;
        return;
      }
      if (!res.ok) {
        setError("Couldn't load playlists.");
        return;
      }
      const body = (await res.json()) as { playlists: PlaylistRow[] };
      setPlaylists(body.playlists);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    setOpen((o) => {
      const next = !o;
      if (next && !playlists) void loadPlaylists();
      return next;
    });
  }

  async function addTo(playlistId: string) {
    if (busyId) return;
    setBusyId(playlistId);
    setError(null);
    try {
      const res = await fetch(`/api/playlists/${playlistId}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId }),
      });
      if (!res.ok) {
        setError("Couldn't add. Try again.");
        return;
      }
      setConfirmId(playlistId);
      // Optimistic count bump
      setPlaylists((prev) =>
        prev
          ? prev.map((p) =>
              p.id === playlistId ? { ...p, trackCount: p.trackCount + 1 } : p,
            )
          : prev,
      );
      setTimeout(() => setConfirmId(null), 1500);
    } catch {
      setError("Network error.");
    } finally {
      setBusyId(null);
    }
  }

  async function createAndAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setBusyId("__new__");
    setError(null);
    try {
      const create = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!create.ok) {
        setError("Couldn't create.");
        return;
      }
      const body = (await create.json()) as {
        playlist: { id: string; name: string };
      };
      const add = await fetch(`/api/playlists/${body.playlist.id}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId }),
      });
      if (!add.ok) {
        setError("Created the playlist, but couldn't add the track.");
        return;
      }
      setPlaylists((prev) => [
        { id: body.playlist.id, name: body.playlist.name, trackCount: 1 },
        ...(prev ?? []),
      ]);
      setNewName("");
      setCreating(false);
      setConfirmId(body.playlist.id);
      setTimeout(() => setConfirmId(null), 1500);
    } catch {
      setError("Network error.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        title="Add to playlist"
        className={`inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/4 px-3 py-2 text-xs font-bold text-white/70 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${className ?? ""}`}
      >
        <span aria-hidden>＋</span>
        <span>Add to playlist</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Add to playlist"
          className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-white/15 bg-zinc-950/98 p-2 shadow-2xl backdrop-blur"
        >
          <div className="mb-1 flex items-center justify-between px-2 py-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/50">
              Your playlists
            </p>
            {!creating && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="text-[11px] font-bold text-brand-300 hover:text-brand-200"
              >
                + New
              </button>
            )}
          </div>

          {creating && (
            <div className="mb-2 flex items-center gap-1 px-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void createAndAdd();
                  if (e.key === "Escape") {
                    setCreating(false);
                    setNewName("");
                  }
                }}
                placeholder="Playlist name"
                maxLength={120}
                className="flex-1 rounded-lg border border-white/15 bg-black/60 px-2 py-1.5 text-xs text-white placeholder:text-white/40 focus:border-brand-500/70 focus:outline-none"
              />
              <button
                type="button"
                onClick={createAndAdd}
                disabled={busyId === "__new__" || !newName.trim()}
                className="rounded-lg bg-brand-500 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-brand-600 disabled:opacity-50"
              >
                {busyId === "__new__" ? "…" : "Add"}
              </button>
            </div>
          )}

          {loading && (
            <p className="px-2 py-3 text-center text-xs text-white/50">
              Loading…
            </p>
          )}

          {!loading && playlists && playlists.length === 0 && !creating && (
            <p className="px-2 py-3 text-center text-xs text-white/50">
              No playlists yet. Create one above.
            </p>
          )}

          {!loading && playlists && playlists.length > 0 && (
            <ul className="max-h-60 overflow-y-auto">
              {playlists.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => addTo(p.id)}
                    disabled={busyId === p.id}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs hover:bg-white/5 disabled:opacity-50"
                  >
                    <span className="truncate text-white/85">{p.name}</span>
                    <span className="ml-2 shrink-0 text-[10px] text-white/45">
                      {confirmId === p.id
                        ? "✓ Added"
                        : `${p.trackCount} ${p.trackCount === 1 ? "track" : "tracks"}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p className="mt-1 px-2 text-[11px] font-semibold text-rose-300" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
