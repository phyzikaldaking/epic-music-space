import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ApproveButton from "./ApproveButton";

export const metadata: Metadata = { title: "AI brain · admin" };
export const dynamic = "force-dynamic";

// Admin-only dashboard for the platform's AI nervous system:
//   - Recent feedback themes (AiInsight)
//   - DRAFT marketing posts awaiting approval
//   - Most-recent MarketingPlan
//   - Beat-embedding coverage stats
//
// Two surfaces in one page; the admin can scan all of it in one
// scroll without bouncing between pages.
export default async function AdminAiPage() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    redirect("/sign-in?next=/admin/ai");
  }

  const [themes, drafts, plan, embeddingCount, songsCount] = await Promise.all([
    prisma.aiInsight.findMany({
      where: { kind: "feedback-theme", resolvedAt: null },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    prisma.marketingPost.findMany({
      where: { status: "DRAFT" },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.marketingPlan.findFirst({
      orderBy: { createdAt: "desc" },
    }),
    prisma.beatEmbedding.count(),
    prisma.song.count({ where: { isActive: true, isDraft: false } }),
  ]);

  const coverage = songsCount > 0 ? Math.round((embeddingCount / songsCount) * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8">
        <p className="text-[10px] font-black uppercase tracking-[0.32em] text-cyan-300">
          AI brain
        </p>
        <h1 className="mt-1 font-display text-3xl uppercase tracking-wide">
          Self-marketing nervous system
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-white/65">
          Feedback the platform&apos;s learning from, marketing copy the
          engine drafted, and the beat-AI coverage stat. Approve
          things, resolve things, watch it grow.
        </p>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-black uppercase tracking-[0.24em] text-white/70">
          Latest plan
        </h2>
        {plan ? (
          <div className="rounded-2xl border border-cyan-400/30 bg-cyan-500/[0.04] p-4">
            <div className="text-[10px] uppercase tracking-widest text-white/45">
              {new Date(plan.createdAt).toLocaleDateString()}
            </div>
            <h3 className="mt-1 font-display text-lg uppercase tracking-wide">
              {plan.title}
            </h3>
            <p className="mt-2 text-sm text-white/80">{plan.summary}</p>
          </div>
        ) : (
          <p className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/55">
            No marketing plan yet — the weekly cron will draft one soon.
          </p>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-black uppercase tracking-[0.24em] text-white/70">
          Pending drafts ({drafts.length})
        </h2>
        {drafts.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/55">
            No drafts in queue.
          </p>
        ) : (
          <ul className="space-y-2">
            {drafts.map((d) => (
              <li
                key={d.id}
                className="rounded-2xl border border-white/10 bg-black/30 p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-white/65">
                    {d.kind}
                  </span>
                  <span className="text-[10px] uppercase tracking-widest text-white/40">
                    {new Date(d.createdAt).toLocaleString()}
                  </span>
                </div>
                <DraftPayload kind={d.kind} payload={d.payload} targetRef={d.targetRef} />
                <div className="mt-3 flex items-center justify-end">
                  <ApproveButton postId={d.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-black uppercase tracking-[0.24em] text-white/70">
          Feedback themes ({themes.length})
        </h2>
        {themes.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/55">
            No themes surfaced yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {themes.map((t) => (
              <li
                key={t.id}
                className="rounded-2xl border border-white/10 bg-black/30 p-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold">{t.title}</h3>
                  <span className="text-[10px] uppercase tracking-widest text-amber-300">
                    {(Number(t.confidence) * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="mt-1 text-xs text-white/65">{t.body}</p>
                {t.recommendation && (
                  <p className="mt-2 rounded-md border border-cyan-400/20 bg-cyan-500/5 p-2 text-[11px] text-cyan-200">
                    → {t.recommendation}
                  </p>
                )}
                <p className="mt-1 text-[10px] uppercase tracking-widest text-white/35">
                  {t.evidenceIds.length} source{t.evidenceIds.length === 1 ? "" : "s"} ·{" "}
                  {new Date(t.createdAt).toLocaleDateString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-black uppercase tracking-[0.24em] text-white/70">
          Beat-AI coverage
        </h2>
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/65">
              {embeddingCount.toLocaleString()} of {songsCount.toLocaleString()} active songs indexed
            </span>
            <span className="font-display text-2xl">{coverage}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-2 rounded-full bg-amber-400"
              style={{ width: `${coverage}%` }}
            />
          </div>
          <p className="mt-2 text-[10px] uppercase tracking-widest text-white/40">
            The cron picks up uninstrumented songs hourly. Foundation for the
            diffusion model — see docs/beat-diffusion-roadmap.md.
          </p>
        </div>
      </section>
    </div>
  );
}

function DraftPayload({
  kind,
  payload,
  targetRef,
}: {
  kind: string;
  payload: unknown;
  targetRef: unknown;
}) {
  const p = payload as Record<string, unknown>;
  const target = targetRef as { name?: string; href?: string } | null;
  if (kind === "COMMUNITY_COMMENT") {
    return (
      <>
        <p className="mt-2 line-clamp-1 text-[11px] text-white/45">
          Reply to: {target?.name ?? target?.href ?? "—"}
        </p>
        <p className="mt-1 rounded-md border border-white/10 bg-black/40 p-2 text-sm text-white/90">
          {typeof p.commentBody === "string" ? p.commentBody : ""}
        </p>
      </>
    );
  }
  if (kind === "SOCIAL_TWITTER" || kind === "SOCIAL_INSTAGRAM" || kind === "SOCIAL_TIKTOK") {
    return (
      <>
        <p className="mt-2 text-[11px] text-white/45">
          About: {target?.name ?? "—"}
        </p>
        <p className="mt-1 rounded-md border border-white/10 bg-black/40 p-2 text-sm text-white/90">
          {typeof p.caption === "string" ? p.caption : ""}
        </p>
        {Array.isArray(p.hashtags) && p.hashtags.length > 0 && (
          <p className="mt-1 text-[11px] text-cyan-300">
            {(p.hashtags as string[]).map((h) => `#${h}`).join(" ")}
          </p>
        )}
      </>
    );
  }
  if (kind === "SEO_PAGE") {
    return (
      <p className="mt-2 text-[11px] text-white/45">
        SEO page (auto-published, no approval needed). Title:{" "}
        {typeof p.title === "string" ? p.title : "—"}
      </p>
    );
  }
  return null;
}
