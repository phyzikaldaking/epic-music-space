"use client";

import { useState } from "react";

interface FollowButtonProps {
  targetUserId: string;
  initiallyFollowing: boolean;
  initialFollowerCount: number;
}

export default function FollowButton({
  targetUserId,
  initiallyFollowing,
  initialFollowerCount,
}: FollowButtonProps) {
  const [following, setFollowing] = useState(initiallyFollowing);
  const [count, setCount] = useState(initialFollowerCount);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId,
          action: following ? "unfollow" : "follow",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setFollowing(!following);
        setCount(data.followerCount);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
        following
          ? "border border-white/20 hover:bg-white/10"
          : "bg-brand-500 hover:bg-brand-600"
      }`}
    >
      {loading ? "…" : following ? "Unfollow" : "Follow"}
      <span className="ml-1.5 text-xs text-white/50">{count}</span>
    </button>
  );
}
