import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** SLA window in hours per severity */
const SLA_HOURS: Record<string, number> = {
  NSFW: 4,
  ABUSE: 8,
  SPAM: 24,
  IMPERSONATION: 12,
  OTHER: 48,
};

function slaDeadline(createdAt: Date, reason: string): Date {
  const hours = SLA_HOURS[reason] ?? 48;
  return new Date(createdAt.getTime() + hours * 3_600_000);
}

function slaStatus(deadline: Date, now = new Date()): "ok" | "warn" | "breached" {
  const remainingHours = (deadline.getTime() - now.getTime()) / 3_600_000;
  if (remainingHours < 0) return "breached";
  if (remainingHours < 2) return "warn";
  return "ok";
}

const STATUS_COLOR = {
  ok: "text-green-400",
  warn: "text-yellow-400",
  breached: "text-red-400",
};

function timeAgo(date: Date): string {
  const ms = Date.now() - date.getTime();
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export default async function ModerationPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/admin/moderation");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const reports = await prisma.userReport.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: {
      reporter: { select: { id: true, email: true, name: true } },
      reportedUser: { select: { id: true, email: true, name: true } },
    },
  });

  const byReason = reports.reduce<Record<string, number>>((acc, r) => {
    acc[r.reason] = (acc[r.reason] ?? 0) + 1;
    return acc;
  }, {});

  const breached = reports.filter((r) => {
    const dl = slaDeadline(r.createdAt, r.reason);
    return slaStatus(dl) === "breached";
  }).length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold">
          <span className="text-gradient-ems">Moderation Queue</span>
        </h1>
        <p className="mt-1 text-white/40">
          {reports.length} pending · {breached} SLA breached
        </p>
      </div>

      {/* Summary chips */}
      <div className="mb-6 flex flex-wrap gap-3">
        {Object.entries(byReason).map(([reason, count]) => (
          <span
            key={reason}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-semibold text-white/70"
          >
            {reason}: {count}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm text-white/80">
          <thead>
            <tr className="border-b border-white/10 bg-white/5 text-left text-xs uppercase tracking-widest text-white/40">
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">Reporter</th>
              <th className="px-4 py-3">Reported</th>
              <th className="px-4 py-3">Post ID</th>
              <th className="px-4 py-3">Age</th>
              <th className="px-4 py-3">SLA deadline</th>
              <th className="px-4 py-3">SLA</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => {
              const dl = slaDeadline(r.createdAt, r.reason);
              const status = slaStatus(dl);
              return (
                <tr
                  key={r.id}
                  className="border-b border-white/5 transition hover:bg-white/5"
                >
                  <td className="px-4 py-3 font-semibold">{r.reason}</td>
                  <td className="px-4 py-3 text-white/50">
                    {r.reporter?.email ?? r.reporterId}
                  </td>
                  <td className="px-4 py-3 text-white/50">
                    {r.reportedUser?.email ?? r.reportedUserId ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-white/40 font-mono text-xs">
                    {r.postId ? (
                      <a
                        href={`/post/${r.postId}`}
                        className="underline hover:text-white"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {r.postId.slice(0, 8)}…
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-white/40">
                    {timeAgo(r.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-white/40">
                    {dl.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className={`px-4 py-3 font-bold ${STATUS_COLOR[status]}`}>
                    {status === "breached"
                      ? "BREACHED"
                      : status === "warn"
                        ? "DUE SOON"
                        : "OK"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <form action={`/api/admin/reports`} method="POST">
                        <input type="hidden" name="reportId" value={r.id} />
                        <input type="hidden" name="status" value="REVIEWED" />
                        <button
                          type="submit"
                          className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
                        >
                          Review
                        </button>
                      </form>
                      <form action={`/api/admin/reports`} method="POST">
                        <input type="hidden" name="reportId" value={r.id} />
                        <input type="hidden" name="status" value="ACTIONED" />
                        <button
                          type="submit"
                          className="rounded bg-red-500/20 px-2 py-1 text-xs text-red-300 hover:bg-red-500/40"
                        >
                          Action
                        </button>
                      </form>
                      <form action={`/api/admin/reports`} method="POST">
                        <input type="hidden" name="reportId" value={r.id} />
                        <input type="hidden" name="status" value="DISMISSED" />
                        <button
                          type="submit"
                          className="rounded bg-white/5 px-2 py-1 text-xs text-white/40 hover:bg-white/10"
                        >
                          Dismiss
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {reports.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-white/30">
                  Queue is empty — all clear.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
