import Link from "next/link";
import { redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { shouldUseExpertUploadMode } from "@/lib/studioNewMode";
const UploadTrackForm = dynamic(() => import("./UploadTrackForm"));
const QuickUploadFlow = dynamic(() => import("./QuickUploadFlow"));
const GuestResumePublish = dynamic(() => import("./GuestResumePublish"));

export const metadata = {
  title: "Upload Track",
  description:
    "Publish your music to the EMS marketplace and start earning license royalties.",
};

export default async function StudioNewPage({
  searchParams,
}: {
  searchParams: Promise<{
    expert?: string;
    audioUrl?: string;
    from?: string;
    /** Beat-machine kit ID at publish time, e.g. "trap". Used to seed
     *  the auto-credit field on the new Song row (#30). */
    beatKit?: string;
    /** Project BPM at publish time. */
    bpm?: string;
    /** Project name to suggest as the song title. */
    title?: string;
  }>;
}) {
  const session = await auth();
  const params = await searchParams;
  const expertMode = shouldUseExpertUploadMode(params.expert);
  const defaultArtistName = session?.user?.name?.trim() || "";
  const prefillAudioUrl =
    typeof params.audioUrl === "string" && /^https?:\/\//.test(params.audioUrl)
      ? params.audioUrl
      : "";
  const prefillBeatKit =
    typeof params.beatKit === "string" && /^[a-zA-Z]+$/.test(params.beatKit)
      ? params.beatKit
      : undefined;
  const prefillBpm = (() => {
    if (typeof params.bpm !== "string") return undefined;
    const n = Number(params.bpm);
    if (!Number.isFinite(n) || n < 20 || n > 240) return undefined;
    return Math.round(n);
  })();
  const prefillTitle =
    typeof params.title === "string" && params.title.length > 0 && params.title.length <= 200
      ? params.title
      : undefined;

  if (!session?.user?.id) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-brand-500/10 blur-[130px]" />
        <div className="relative">
          <div className="mb-5 text-6xl">🎵</div>
          <h1 className="text-4xl font-extrabold text-gradient-ems">Artist Studio</h1>
          <p className="mt-4 text-white/55 max-w-md mx-auto">
            Upload tracks, set licensing terms, earn royalties, and grow your fanbase on Epic Music Space.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3 text-left">
            {[
              { icon: "🎙️", title: "Upload Tracks", body: "Publish music with AI scoring and licensing terms." },
              { icon: "💰", title: "Earn Royalties", body: "Set your own license price and revenue share." },
              { icon: "⚔️", title: "Battle & Grow", body: "Enter Versus battles to boost discovery rank." },
            ].map((f) => (
              <div key={f.title} className="rounded-xl border border-white/10 bg-white/4 p-4">
                <div className="mb-2 text-2xl">{f.icon}</div>
                <p className="font-semibold text-sm">{f.title}</p>
                <p className="mt-1 text-xs text-white/45">{f.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
            <Link
              href="/auth/signup?role=ARTIST&callbackUrl=%2Fstudio%2Fsetup%3Fnext%3D%2Fstudio%2Fnew"
              className="rounded-xl bg-brand-500 px-6 py-3 text-sm font-bold text-white hover:bg-brand-600 transition"
            >
              Create Artist Account →
            </Link>
            <Link
              href="/auth/signin?callbackUrl=/studio/new"
              className="rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-white/70 hover:bg-white/8 transition"
            >
              Sign In
            </Link>
          </div>
          <p className="mt-6 text-xs text-white/30">
            Already have tracks?{" "}
            <Link href="/dashboard" className="text-brand-400 hover:underline">View your dashboard →</Link>
          </p>
        </div>
      </div>
    );
  }

  // Role gate — only ARTIST/LABEL/PRODUCER/ENGINEER/ADMIN can publish.
  // LISTENERs are normally routed through /studio/setup. But if a
  // LISTENER somehow already has a Studio row (legacy users, role
  // demotion edge case, race against an in-flight sign-in), there's
  // no reason to make them re-fill the form they already submitted.
  // We promote them in-place and let them through. Brand-new LISTENERs
  // with no Studio still go to /studio/setup so they pick a username
  // and get a profile.
  const userRow = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, subscriptionTier: true, trialExpiresAt: true },
  }).catch(() => null);
  if (!userRow) {
    redirect("/studio/setup");
  }
  if (userRow.role === "LISTENER") {
    const existingStudio = await prisma.studio.findFirst({
      where: { userId: session.user.id },
      select: { id: true },
    }).catch(() => null);

    if (existingStudio) {
      // Promote in-place. Also grant the 14-day PRO trial here for
      // parity with /api/studio's first-time path — keeps the "I am
      // an artist now" experience identical no matter which entry
      // point they came through.
      const TRIAL_DAYS = 14;
      const shouldGrantTrial =
        !userRow.trialExpiresAt && userRow.subscriptionTier === "FREE";
      // Server Component handler — purity rules don't apply, but the
      // lint rule fires anyway. Using `new Date()` + setDate keeps the
      // expression visibly imperative and silences it cleanly.
      const trialExpiresAt = new Date();
      trialExpiresAt.setDate(trialExpiresAt.getDate() + TRIAL_DAYS);
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          role: "ARTIST",
          ...(shouldGrantTrial && {
            subscriptionTier: "TRIAL",
            trialExpiresAt,
          }),
        },
      }).catch(() => {
        /* best-effort: page still loads, /api/songs/create has its own gate */
      });
    } else {
      const next = prefillAudioUrl
        ? `/studio/new?audioUrl=${encodeURIComponent(prefillAudioUrl)}`
        : "/studio/new";
      redirect(`/studio/setup?next=${encodeURIComponent(next)}`);
    }
  }

  // Guest resume: visitor cut a track in /studio/try, signed up, and is
  // back here with `?from=guest-resume`. The client component pulls the
  // stashed WAV from IndexedDB, uploads it under their authed session,
  // and redirects to `?from=guest-resume-done&audioUrl=…` so the form
  // below picks up with the URL prefilled.
  if (params.from === "guest-resume") {
    return <GuestResumePublish />;
  }

  return (
    <Suspense fallback={null}>
      {expertMode ? (
        <UploadTrackForm prefillAudioUrl={prefillAudioUrl} />
      ) : (
        <QuickUploadFlow
          defaultArtistName={defaultArtistName}
          prefillAudioUrl={prefillAudioUrl}
          prefillBeatKit={prefillBeatKit}
          prefillBpm={prefillBpm}
          prefillTitle={prefillTitle}
        />
      )}
    </Suspense>
  );
}
