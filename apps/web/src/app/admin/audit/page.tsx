import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin · Audit log",
  robots: { index: false, follow: false },
};

interface Props {
  searchParams: Promise<{
    action?: string;
    admin?: string;
    target?: string;
    page?: string;
  }>;
}

const PAGE_SIZE = 50;

export default async function AdminAuditPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/admin/audit");
  if (session.user.role !== "ADMIN") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold">Forbidden</h1>
        <p className="mt-2 text-sm text-white/55">Admin access required.</p>
      </div>
    );
  }

  const params = await searchParams;
  const action = params.action?.trim() || undefined;
  const admin = params.admin?.trim() || undefined;
  const target = params.target?.trim() || undefined;
  const page = Math.max(1, Number(params.page ?? 1));
  const skip = (page - 1) * PAGE_SIZE;

  const where = {
    ...(action ? { action: { contains: action, mode: "insensitive" as const } } : {}),
    ...(admin ? { adminEmail: { contains: admin, mode: "insensitive" as const } } : {}),
    ...(target ? { target: { contains: target, mode: "insensitive" as const } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.adminActionLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip,
    }),
    prisma.adminActionLog.count({ where }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-extrabold">Admin audit log</h1>
      <p className="mb-6 text-sm text-white/50">
        Every mutating admin action recorded with the actor, target, IP, and metadata.
      </p>

      <form className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3 md:grid-cols-4">
        <input
          name="action"
          defaultValue={action ?? ""}
          placeholder="Action (e.g. song.delete)"
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm placeholder-white/30"
        />
        <input
          name="admin"
          defaultValue={admin ?? ""}
          placeholder="Admin email"
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm placeholder-white/30"
        />
        <input
          name="target"
          defaultValue={target ?? ""}
          placeholder="Target id"
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm placeholder-white/30"
        />
        <button
          type="submit"
          className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold hover:bg-brand-600"
        >
          Filter
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-white/8 bg-[#141414]">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="border-b border-white/8 bg-white/3 text-xs uppercase tracking-widest text-white/40">
            <tr>
              <th className="px-4 py-3 text-left">When</th>
              <th className="px-4 py-3 text-left">Admin</th>
              <th className="px-4 py-3 text-left">Action</th>
              <th className="px-4 py-3 text-left">Target</th>
              <th className="px-4 py-3 text-left">IP</th>
              <th className="px-4 py-3 text-left">Meta</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-white/40">
                  No matching admin actions.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-white/5">
                  <td className="px-4 py-3 text-white/55 whitespace-nowrap">
                    {r.createdAt.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 truncate max-w-[180px]">{r.adminEmail ?? r.adminId.slice(-8)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.action}</td>
                  <td className="px-4 py-3 font-mono text-xs text-white/55 truncate max-w-[160px]">
                    {r.target ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-white/40 whitespace-nowrap">{r.ip ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-white/45 max-w-[260px]">
                    <details>
                      <summary className="cursor-pointer">view</summary>
                      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all">
                        {JSON.stringify(r.metadata ?? {}, null, 2)}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-white/40">
        Page {page} of {pages} · {total} total entries
      </p>
    </div>
  );
}
