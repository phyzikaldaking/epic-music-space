"use client";

import { useState, useEffect, useCallback } from "react";

interface AdminSong {
  id: string;
  title: string;
  artist: string;
  genre: string | null;
  isActive: boolean;
  hasStems: boolean;
  aiScore: number;
  soldLicenses: number;
  totalLicenses: number;
  licensePrice: number;
  createdAt: string;
  artist_: { email: string } | null;
}

interface ApiResponse {
  songs: AdminSong[];
  total: number;
  page: number;
  pages: number;
}

export default function AdminSongsClient() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const fetchSongs = useCallback(async (q: string, p: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (q) params.set("q", q);
      const res = await fetch(`/api/admin/songs?${params}`);
      if (!res.ok) throw new Error("Failed to load songs");
      setData(await res.json() as ApiResponse);
    } catch {
      setError("Could not load songs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { setPage(1); void fetchSongs(query, 1); }, 300);
    return () => clearTimeout(t);
  }, [query, fetchSongs]);

  useEffect(() => { void fetchSongs(query, page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  async function doAction(songId: string, action: "toggle_active" | "delete") {
    if (action === "delete" && !confirm("Permanently delete this song and all its licenses?")) return;
    setActing(songId);
    try {
      const res = await fetch("/api/admin/songs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId, action }),
      });
      if (!res.ok) throw new Error("Action failed");
      if (action === "delete") {
        setData((prev) => prev ? { ...prev, songs: prev.songs.filter((s) => s.id !== songId), total: prev.total - 1 } : prev);
      } else {
        const updated = await res.json() as { isActive: boolean };
        setData((prev) => prev ? { ...prev, songs: prev.songs.map((s) => s.id === songId ? { ...s, isActive: updated.isActive } : s) } : prev);
      }
    } catch {
      alert("Action failed.");
    } finally {
      setActing(null);
    }
  }

  return (
    <div>
      {data && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Total songs", value: data.total },
            { label: "Page", value: `${data.page} / ${data.pages}` },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-white/10 bg-white/4 p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/35">{s.label}</p>
              <p className="mt-1 text-2xl font-extrabold">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mb-5">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title or artist…"
          className="w-full rounded-xl border border-white/15 bg-white/6 px-4 py-2.5 text-sm placeholder-white/25 focus:border-brand-500/60 focus:outline-none"
        />
      </div>

      {error && <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-white/5" />)}</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/4 text-left text-xs font-semibold uppercase tracking-widest text-white/35">
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Artist</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Sold</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Stems</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {data?.songs.map((song) => (
                <tr key={song.id} className={`transition hover:bg-white/4 ${!song.isActive ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3">
                    <a href={`/track/${song.id}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-400 hover:underline">
                      {song.title}
                    </a>
                    {song.genre && <p className="text-xs text-white/30">{song.genre}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-white/70">{song.artist}</p>
                    {song.artist_ && <p className="text-xs text-white/30">{song.artist_.email}</p>}
                  </td>
                  <td className="px-4 py-3 text-gold-400 font-semibold">${song.licensePrice}</td>
                  <td className="px-4 py-3 text-white/60">
                    {song.soldLicenses}<span className="text-white/25">/{song.totalLicenses}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-bold ${song.aiScore >= 80 ? "text-gold-400" : song.aiScore >= 50 ? "text-brand-400" : "text-white/40"}`}>
                      {song.aiScore.toFixed(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {song.hasStems
                      ? <span className="rounded-full border border-green-500/30 bg-green-500/15 px-2 py-0.5 text-xs font-bold text-green-400">✓ Yes</span>
                      : <span className="text-xs text-white/25">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${song.isActive ? "border-green-500/30 bg-green-500/15 text-green-400" : "border-white/15 bg-white/8 text-white/35"}`}>
                      {song.isActive ? "Active" : "Hidden"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        disabled={acting === song.id}
                        onClick={() => void doAction(song.id, "toggle_active")}
                        className="rounded-lg border border-white/15 px-2.5 py-1 text-xs font-semibold text-white/60 transition hover:text-white disabled:opacity-40"
                      >
                        {song.isActive ? "Hide" : "Show"}
                      </button>
                      <button
                        disabled={acting === song.id}
                        onClick={() => void doAction(song.id, "delete")}
                        className="rounded-lg border border-red-500/20 bg-red-500/8 px-2.5 py-1 text-xs font-semibold text-red-400 transition hover:bg-red-500/15 disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data?.songs.length === 0 && <p className="py-12 text-center text-sm text-white/30">No songs found.</p>}
        </div>
      )}

      {data && data.pages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || loading} className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white/60 transition hover:text-white disabled:opacity-30">Previous</button>
          <span className="text-sm text-white/40">{page} / {data.pages}</span>
          <button onClick={() => setPage((p) => Math.min(data.pages, p + 1))} disabled={page === data.pages || loading} className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white/60 transition hover:text-white disabled:opacity-30">Next</button>
        </div>
      )}
    </div>
  );
}
