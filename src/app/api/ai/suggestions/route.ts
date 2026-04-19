import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * AI Suggestions for Artists (stub)
 *
 * In production, this would analyze the artist's catalog,
 * performance data, and market trends to provide personalized
 * recommendations via an LLM (e.g. OpenAI GPT-4).
 *
 * To enable:
 * 1. Set OPENAI_API_KEY in .env.local
 * 2. Replace the stub with an actual GPT call using song metrics
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch artist data for context
  const [songsRes, profileRes] = await Promise.all([
    supabase
      .from("songs")
      .select("title, genre, plays_count, likes_count, sale_type, price")
      .eq("artist_id", user.id)
      .order("plays_count", { ascending: false })
      .limit(10),
    supabase.from("profiles").select("followers_count").eq("id", user.id).single(),
  ]);

  const songs = songsRes.data ?? [];
  const followers = profileRes.data?.followers_count ?? 0;
  const topGenre = songs[0]?.genre ?? "Unknown";
  const avgPlays =
    songs.length > 0
      ? Math.round(songs.reduce((s, t) => s + (t.plays_count ?? 0), 0) / songs.length)
      : 0;

  // --- STUB: Return computed suggestions based on real data ---
  const suggestions = [
    {
      type: "pricing",
      title: "Optimize your pricing",
      description:
        songs.some((s) => s.sale_type === "free")
          ? "You have free tracks. Consider adding a Pay-What-You-Want option to start monetizing without barrier."
          : "Your tracks are priced well. Try an auction for your next release to maximize revenue.",
      action: "Upload a track",
      actionHref: "/upload",
    },
    {
      type: "engagement",
      title: "Grow your audience",
      description:
        followers < 100
          ? "You have a small but growing fanbase. Share your profile link on social media to accelerate follower growth."
          : `You have ${followers.toLocaleString()} followers. Consider releasing exclusive content to reward loyal fans.`,
      action: "Share profile",
      actionHref: null,
    },
    {
      type: "content",
      title: "Release schedule",
      description:
        songs.length < 3
          ? "Artists with 5+ tracks see 3x more followers. Upload more music to increase discoverability."
          : `Your average play count is ${avgPlays.toLocaleString()} per track. Keep releasing consistently in ${topGenre}.`,
      action: "Upload music",
      actionHref: "/upload",
    },
    {
      type: "billboard",
      title: "Advertise in the city",
      description:
        "Billboard ads in the EMS city get high visibility from active users. Reserve a slot to promote your latest release.",
      action: "Get a billboard",
      actionHref: "/billboard",
    },
  ];

  return NextResponse.json({
    suggestions,
    dataPoints: {
      totalSongs: songs.length,
      followers,
      topGenre,
      avgPlays,
    },
    note: "Real-time AI analysis — integrate OpenAI GPT-4 for deeper personalized insights",
  });
}
