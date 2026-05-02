"use client";

import { useState, useEffect, useCallback } from "react";

interface AdminUser {
  id: string;
  name: string | null;
  username: string | null;
  email: string;
  role: string;
  subscriptionTier: string;
  createdAt: string;
  emailVerified: string | null;
  _count: { songs: number; licenses: number };
}

interface ApiResponse {
  users: AdminUser[];
  total: number;
  page: number;
  pages: number;
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-red-500/20 text-red-400 border-red-500/30",
  LABEL: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  ARTIST: "bg-brand-500/20 text-brand-400 border-brand-500/30",
  LISTENER: "bg-white/10 text-white/50 border-white/15",
};

const TIER_COLORS: Record<string, string> = {
  PRIME: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  LABEL_TIER: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  PRO: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  STARTER: "bg-green-500/20 text-green-300 border-green-500/30",
  FREE: "bg-white/8 text-white/35 border-white/10",
};

export default function AdminUsersClient() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async (q: string, p: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (q) params.set("q", q);
      const res = await fetch(`/api/admin/users?${params}`);
      if (!res.ok) throw new Error("Failed to load users");
      setData(await res.json() as ApiResponse);
    } catch {
      setError("Could not load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      void fetchUsers(query, 1);
    }, 300);
    return () => clearTimeout(t);
  }, [query, fetchUsers]);

  useEffect(() => {
    void fetchUsers(query, page);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  async function updateUser(userId: string, field: "role" | "subscriptionTier", value: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, [field]: value }),
      });
      if (!res.ok) throw new Error("Update failed");
      setData((prev) =>
        prev
          ? {
              ...prev,
              users: prev.users.map((u) =>
                u.id === userId ? { ...u, [field]: value } : u
              ),
            }
          : prev
      );
      setEditing(null);
    } catch {
      alert("Failed to update user.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Stats bar */}
      {data && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Total users", value: data.total },
            { label: "Page", value: `${data.page} / ${data.pages}` },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-white/10 bg-white/4 p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/35">{s.label}</p>
              <p className="mt-1 text-2xl font-extrabold">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="mb-5 flex gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email, or username…"
          className="flex-1 rounded-xl border border-white/15 bg-white/6 px-4 py-2.5 text-sm placeholder-white/25 focus:border-brand-500/60 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
        />
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/4 text-left text-xs font-semibold uppercase tracking-widest text-white/35">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">Songs</th>
                <th className="px-4 py-3">Licenses</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {data?.users.map((user) => (
                <tr key={user.id} className="transition hover:bg-white/4">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{user.name ?? "(unnamed)"}</p>
                    <p className="text-xs text-white/35">{user.email}</p>
                    {user.username && (
                      <p className="text-xs text-white/25">@{user.username}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editing === `${user.id}:role` ? (
                      <select
                        defaultValue={user.role}
                        disabled={saving}
                        autoFocus
                        className="rounded-lg border border-white/20 bg-[#111] px-2 py-1 text-xs"
                        onChange={(e) => void updateUser(user.id, "role", e.target.value)}
                        onBlur={() => setEditing(null)}
                      >
                        {["LISTENER", "ARTIST", "LABEL", "ADMIN"].map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    ) : (
                      <button
                        onClick={() => setEditing(`${user.id}:role`)}
                        className={`rounded-full border px-2 py-0.5 text-xs font-semibold transition hover:opacity-80 ${ROLE_COLORS[user.role] ?? ROLE_COLORS.LISTENER}`}
                      >
                        {user.role}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editing === `${user.id}:tier` ? (
                      <select
                        defaultValue={user.subscriptionTier}
                        disabled={saving}
                        autoFocus
                        className="rounded-lg border border-white/20 bg-[#111] px-2 py-1 text-xs"
                        onChange={(e) => void updateUser(user.id, "subscriptionTier", e.target.value)}
                        onBlur={() => setEditing(null)}
                      >
                        {["FREE", "STARTER", "PRO", "PRIME", "LABEL_TIER"].map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    ) : (
                      <button
                        onClick={() => setEditing(`${user.id}:tier`)}
                        className={`rounded-full border px-2 py-0.5 text-xs font-semibold transition hover:opacity-80 ${TIER_COLORS[user.subscriptionTier] ?? TIER_COLORS.FREE}`}
                      >
                        {user.subscriptionTier}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-white/50">{user._count.songs}</td>
                  <td className="px-4 py-3 text-white/50">{user._count.licenses}</td>
                  <td className="px-4 py-3 text-xs text-white/30">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs ${user.emailVerified ? "text-green-400" : "text-white/25"}`}>
                      {user.emailVerified ? "Verified" : "Unverified"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data?.users.length === 0 && (
            <p className="py-12 text-center text-sm text-white/30">No users found.</p>
          )}
        </div>
      )}

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white/60 transition hover:text-white disabled:opacity-30"
          >
            Previous
          </button>
          <span className="text-sm text-white/40">
            {page} / {data.pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
            disabled={page === data.pages || loading}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white/60 transition hover:text-white disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
