import { auth } from "@/lib/auth";
import FeedClient from "@/app/feed/FeedClient";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Forum Timeline",
  description: "Talk with artists and fans in the EMS community timeline.",
};

type ForumPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ForumPage({ searchParams }: ForumPageProps) {
  const session = await auth();
  const params = (await searchParams) ?? {};
  const onboardingValue = params.onboarding;
  const onboarding = Array.isArray(onboardingValue)
    ? onboardingValue[0] ?? null
    : onboardingValue ?? null;
  const postValue = params.post;
  const postId = Array.isArray(postValue) ? (postValue[0] ?? null) : (postValue ?? null);

  return (
    <div className="ems-shell">
      <div className="ems-head">
        <p className="ems-kicker">Community</p>
        <h1 className="ems-title">Forum Timeline</h1>
        <p className="ems-sub">
          Share updates, ask questions, and talk music with artists and listeners.
        </p>
        <div className="ems-divider" aria-hidden />
      </div>

      {postId && (
        <div className="mb-5 rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
          Jumped here from a notification.
          {" "}
          <Link href={`/post/${postId}`} className="font-semibold underline decoration-cyan-300/60 underline-offset-2 hover:text-white">
            Open the referenced post
          </Link>
          .
        </div>
      )}

      <FeedClient
        initialMode={session?.user?.id ? "following" : "all"}
        viewerId={session?.user?.id ?? null}
        onboarding={onboarding}
        authCallbackPath="/forum"
        composerPrefill={null}
      />
    </div>
  );
}
