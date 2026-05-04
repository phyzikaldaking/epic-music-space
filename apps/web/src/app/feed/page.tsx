import { auth } from "@/lib/auth";
import FeedClient from "./FeedClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Feed — Epic Music Space",
  description: "Updates, clips, and behind-the-scenes from artists you follow.",
};

export default async function FeedPage() {
  const session = await auth();
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-extrabold">Feed</h1>
      <FeedClient
        initialMode={session?.user?.id ? "following" : "all"}
        viewerId={session?.user?.id ?? null}
      />
    </div>
  );
}
