import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import AdminUsersClient from "./AdminUsersClient";
import AdminSongsClient from "./AdminSongsClient";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/admin");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const { tab } = await searchParams;
  const activeTab = tab === "songs" ? "songs" : "users";

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold">
            <span className="text-gradient-ems">Owner Portal</span>
          </h1>
          <p className="mt-1 text-white/40">Manage users, songs, and platform access.</p>
        </div>
        <div className="flex gap-2">
          <a
            href="/admin"
            className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
              activeTab === "users"
                ? "border-brand-500/50 bg-brand-500/15 text-brand-300"
                : "border-white/15 text-white/50 hover:text-white"
            }`}
          >
            Users
          </a>
          <a
            href="/admin?tab=songs"
            className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
              activeTab === "songs"
                ? "border-brand-500/50 bg-brand-500/15 text-brand-300"
                : "border-white/15 text-white/50 hover:text-white"
            }`}
          >
            Songs
          </a>
          <a
            href="/admin/ops"
            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-500/20"
          >
            Ops
          </a>
          <a
            href="/admin/risk"
            className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm font-semibold text-yellow-300 transition hover:bg-yellow-500/20"
          >
            Risk
          </a>
          <a
            href="/admin/moderation"
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/20 transition"
          >
            Moderation Queue
          </a>
          <a
            href="/admin/status"
            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20 transition"
          >
            Status
          </a>
        </div>
      </div>

      {activeTab === "songs" ? <AdminSongsClient /> : <AdminUsersClient />}
    </main>
  );
}
