import { redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { shouldUseExpertUploadMode } from "@/lib/studioNewMode";
const UploadTrackForm = dynamic(() => import("./UploadTrackForm"));
const QuickUploadFlow = dynamic(() => import("./QuickUploadFlow"));
const GuestResumePublish = dynamic(() => import("./GuestResumePublish"));
const StudioNewGuestLanding = dynamic(() => import("./StudioNewGuestLanding"));

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
    return <StudioNewGuestLanding />;
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
