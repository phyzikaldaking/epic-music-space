import { auth } from "@/lib/auth";
import FeedClient from "./FeedClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Feed",
  description: "Updates, clips, and behind-the-scenes from artists you follow.",
};

type FeedPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function FeedPage({ searchParams }: FeedPageProps) {
  const session = await auth();
  const params = (await searchParams) ?? {};
  const onboardingValue = params.onboarding;
  const onboarding = Array.isArray(onboardingValue)
    ? onboardingValue[0] ?? null
    : onboardingValue ?? null;

  return (
    <div className="ems-shell">
      <div className="ems-head">
        <p className="ems-kicker">Timeline</p>
        <h1 className="ems-title">Following Feed</h1>
        <p className="ems-sub">Updates, clips, and behind-the-scenes from artists you follow.</p>
        <div className="ems-divider" aria-hidden />
      </div>
      <FeedClient
        initialMode={session?.user?.id ? "following" : "all"}
        viewerId={session?.user?.id ?? null}
        onboarding={onboarding}
        composerPrefill={null}
      />
    </div>
  );
}
