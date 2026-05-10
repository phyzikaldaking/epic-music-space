import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { lenientLimiter } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

interface RouteProps {
  params: Promise<{ id: string }>;
}

// Per-IP rate limit on the listen page itself (#8). The /api endpoint
// has its own limiter; this gate covers direct page hits which are the
// dominant traffic for a "share to a friend" flow. Same fail-open
// pattern: a Redis blip is better than a black-out for shared links.
async function consumeListenBudget(): Promise<{ ok: boolean; retryAfter?: number }> {
  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    hdrs.get("x-real-ip") ??
    "unknown";
  try {
    await lenientLimiter.consume(`studio:listen-page:${ip}`);
    return { ok: true };
  } catch (err) {
    if (err && typeof err === "object" && "msBeforeNext" in err) {
      return {
        ok: false,
        retryAfter: Math.ceil(
          Number((err as { msBeforeNext: number }).msBeforeNext) / 1000,
        ),
      };
    }
    return { ok: true };
  }
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { id } = await params;
  const project = await prisma.studioProject.findFirst({
    where: { id, isPublic: true },
    select: { name: true, user: { select: { name: true } } },
  });
  if (!project) return { title: "Session not found" };
  return {
    title: `${project.name} — EMS Studio`,
    description: `A studio session by ${project.user?.name ?? "an EMS producer"}.`,
  };
}

export default async function ListenPage({ params }: RouteProps) {
  const budget = await consumeListenBudget();
  if (!budget.ok) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.32em] text-tube-300">
          Slow down
        </p>
        <h1 className="mt-2 font-display text-2xl uppercase tracking-wide text-white">
          Too many listens too fast
        </h1>
        <p className="mt-3 text-sm text-white/65">
          We&apos;re rate-limiting this page to keep shared sessions fair.
          Try again in about {budget.retryAfter ?? 60} seconds.
        </p>
      </div>
    );
  }
  const { id } = await params;
  const project = await prisma.studioProject.findFirst({
    where: { id, isPublic: true },
    select: {
      id: true,
      name: true,
      bpm: true,
      coverArtUrl: true,
      masterBlobUrl: true,
      createdAt: true,
      user: { select: { name: true, image: true } },
      tracks: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          name: true,
          color: true,
          blobUrl: true,
          durationSec: true,
        },
      },
    },
  });

  if (!project) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <p className="text-[10px] font-black uppercase tracking-[0.32em] text-tube-300">
        EMS Studio · Shared session
      </p>
      <h1 className="mt-2 font-display text-3xl uppercase tracking-wide text-white">
        {project.name}
      </h1>
      <p className="mt-1 text-sm text-white/55">
        {project.bpm} BPM
        {project.user?.name ? ` · by ${project.user.name}` : ""}
      </p>

      {project.coverArtUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={project.coverArtUrl}
          alt={`Cover for ${project.name}`}
          className="mt-6 aspect-square w-full max-w-md rounded-2xl border border-white/10 object-cover"
        />
      )}

      {project.masterBlobUrl ? (
        <section className="mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-500/5 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-300/85">
            Master mix
          </p>
          <audio controls src={project.masterBlobUrl} className="mt-3 w-full">
            <track kind="captions" />
          </audio>
        </section>
      ) : null}

      {project.tracks.length > 0 && (
        <section className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/55">
            Stems · {project.tracks.length}
          </p>
          <ul className="mt-3 space-y-2">
            {project.tracks.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3"
              >
                <span
                  className="block h-9 w-1.5 rounded-full"
                  style={{ background: t.color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">{t.name}</p>
                  <p className="text-[11px] text-white/45">
                    {t.durationSec.toFixed(1)}s
                  </p>
                </div>
                {t.blobUrl ? (
                  <audio controls src={t.blobUrl} className="max-w-[260px]">
                    <track kind="captions" />
                  </audio>
                ) : (
                  <span className="text-[11px] text-white/30">— empty</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-8 text-center text-xs text-white/40">
        Read-only share. Liked it?{" "}
        <Link className="text-tube-300 underline" href="/studio/try">
          Make your own session →
        </Link>
      </p>
    </div>
  );
}
