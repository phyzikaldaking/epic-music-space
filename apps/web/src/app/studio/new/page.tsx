import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { shouldUseExpertUploadMode } from "@/lib/studioNewMode";
import UploadTrackForm from "./UploadTrackForm";
import QuickUploadFlow from "./QuickUploadFlow";

export const metadata = {
  title: "Upload Track",
  description:
    "Publish your music to the EMS marketplace and start earning license royalties.",
};

export default async function StudioNewPage({
  searchParams,
}: {
  searchParams: Promise<{ expert?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;
  const expertMode = shouldUseExpertUploadMode(params.expert);
  const defaultArtistName = session?.user?.name?.trim() || "";

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

  return (
    <Suspense fallback={null}>
      {expertMode ? (
        <UploadTrackForm />
      ) : (
        <QuickUploadFlow defaultArtistName={defaultArtistName} />
      )}
    </Suspense>
  );
}
