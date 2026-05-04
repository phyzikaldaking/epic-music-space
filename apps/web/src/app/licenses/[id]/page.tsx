import Link from "next/link";
import Image from "next/image";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "License receipt — Epic Music Space",
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function LicenseReceiptPage({ params }: Props) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/signin?callbackUrl=/licenses/${id}`);
  }

  const license = await prisma.licenseToken.findUnique({
    where: { id },
    include: {
      song: {
        select: {
          id: true,
          title: true,
          artist: true,
          coverUrl: true,
          audioUrl: true,
          hasStems: true,
          stemUrl: true,
          revenueSharePct: true,
          artist_: { select: { name: true, studio: { select: { username: true } } } },
        },
      },
      transactions: {
        where: { status: "SUCCEEDED" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, amount: true, createdAt: true, stripePaymentIntentId: true },
      },
    },
  });

  if (!license) notFound();
  if (license.holderId !== session.user.id && session.user.role !== "ADMIN") {
    notFound();
  }

  const tx = license.transactions[0];
  const studioUsername = license.song.artist_?.studio?.username;
  const downloadable = license.song.hasStems && license.song.stemUrl;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Link
        href="/dashboard"
        className="mb-6 inline-block text-xs uppercase tracking-widest text-white/50 hover:text-white"
      >
        ← Back to dashboard
      </Link>

      <div className="rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/8 to-brand-500/4 p-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">
          License confirmed
        </p>
        <h1 className="mt-2 text-2xl font-extrabold">
          You hold License #{license.tokenNumber} for &ldquo;{license.song.title}&rdquo;
        </h1>
        <p className="mt-2 text-sm text-white/55">
          Purchased{" "}
          {license.purchasedAt.toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}{" "}
          for ${Number(license.price).toFixed(2)}.
          {tx?.stripePaymentIntentId && (
            <>
              {" "}Stripe payment id:{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/70">
                {tx.stripePaymentIntentId}
              </code>
            </>
          )}
        </p>

        <div className="mt-6 flex items-center gap-4 rounded-2xl border border-white/8 bg-white/3 p-4">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-brand-900">
            {license.song.coverUrl ? (
              <Image src={license.song.coverUrl} alt="" fill className="object-cover" unoptimized />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-3xl">🎵</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{license.song.title}</p>
            <p className="truncate text-xs text-white/50">
              by{" "}
              {studioUsername ? (
                <Link href={`/studio/${studioUsername}`} className="hover:underline">
                  {license.song.artist}
                </Link>
              ) : (
                license.song.artist
              )}
            </p>
            <p className="mt-1 text-xs text-white/40">
              {Number(license.song.revenueSharePct).toFixed(2)}% revenue share per license
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {downloadable ? (
            <a
              href={`/api/licenses/${license.id}/download`}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-600"
            >
              ⬇ Download stems
            </a>
          ) : license.song.audioUrl ? (
            <a
              href={license.song.audioUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-600"
            >
              ⬇ Download audio
            </a>
          ) : (
            <span className="rounded-xl border border-white/10 px-5 py-2.5 text-sm text-white/55">
              Download not available
            </span>
          )}
          <Link
            href={`/track/${license.song.id}`}
            className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-bold hover:bg-white/10"
          >
            View track page
          </Link>
        </div>
      </div>

      <section className="mt-8 rounded-2xl border border-white/8 bg-white/3 p-5">
        <h2 className="text-sm font-bold uppercase tracking-widest text-white/50">
          What this license covers
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-white/75">
          <li>· Personal and commercial use of the licensed audio in your project.</li>
          <li>· Synchronization rights to pair the audio with video, podcasts, ads, or game projects.</li>
          <li>· {Number(license.song.revenueSharePct).toFixed(2)}% revenue share with the artist on tracked uses.</li>
          <li>
            · Full terms:{" "}
            <Link href="/legal/licensing" className="text-brand-300 hover:underline">
              /legal/licensing
            </Link>
            .
          </li>
        </ul>
        <p className="mt-3 text-xs text-white/40">
          Stripe sends a separate payment receipt to your email. Keep both for your records.
        </p>
      </section>
    </div>
  );
}
