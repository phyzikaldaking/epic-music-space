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
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-extrabold">Feed</h1>
      <FeedClient
        initialMode={session?.user?.id ? "following" : "all"}
        viewerId={session?.user?.id ?? null}
        onboarding={onboarding}
      />
    </div>
  );
}
