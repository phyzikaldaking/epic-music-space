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
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-300/85">Community</p>
        <h1 className="mt-1 text-2xl font-extrabold">Forum Timeline</h1>
        <p className="mt-1 text-sm text-white/65">
          Share updates, ask questions, and talk music with artists and listeners.
        </p>
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
      />
    </div>
  );
}
