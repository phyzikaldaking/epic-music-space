import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import ExploreClient from "./ExploreClient";

interface Props {
  searchParams: Promise<{ tag?: string }>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { tag } = await searchParams;
  if (!tag) {
    return {
      title: "Explore",
      description: "Browse hashtags trending across the Epic Music Space community.",
    };
  }
  const safe = tag.toLowerCase().slice(0, 50);
  const title = `#${safe} — Epic Music Space`;
  return {
    title,
    description: `Posts tagged #${safe} on Epic Music Space.`,
    openGraph: { title, description: `Posts tagged #${safe} on Epic Music Space.` },
    twitter: { card: "summary", title },
  };
}

export default async function ExplorePage({ searchParams }: Props) {
  const { tag: rawTag } = await searchParams;
  const tag = (rawTag ?? "").trim().toLowerCase().slice(0, 50);
  const isValid = /^[a-z0-9_]+$/.test(tag);
  const session = await auth();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-white/40">
          {isValid ? "Hashtag" : "Explore"}
        </p>
        <h1 className="mt-1 text-3xl font-extrabold">
          {isValid ? (
            <>
              <span className="text-brand-400">#</span>
              {tag}
            </>
          ) : (
            "Discover hashtags"
          )}
        </h1>
        {!isValid && (
          <p className="mt-2 text-sm text-white/45">
            Tap a hashtag in any post to land here, or share your own with{" "}
            <Link href="/feed" className="text-brand-400 hover:underline">
              the feed composer
            </Link>
            .
          </p>
        )}
      </div>

      {isValid ? (
        <ExploreClient tag={tag} viewerId={session?.user?.id ?? null} />
      ) : (
        <div className="glass rounded-2xl p-8 text-center">
          <p className="mb-3 text-4xl" aria-hidden>🏷️</p>
          <p className="text-sm font-semibold text-white/80">
            No hashtag selected.
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-white/45">
            Hashtags surface posts grouped by topic — try posting one in your
            next update and it&apos;ll show up here.
          </p>
          <Link
            href="/feed"
            className="mt-4 inline-block rounded-xl bg-brand-500 px-5 py-2 text-xs font-bold text-white hover:bg-brand-600"
          >
            Browse the feed
          </Link>
        </div>
      )}
    </div>
  );
}
