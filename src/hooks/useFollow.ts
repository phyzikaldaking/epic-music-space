"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./useAuth";

export function useFollow(targetUserId: string, initialCount = 0) {
  const { user } = useAuth();
  const [following, setFollowing] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || user.id === targetUserId) return;
    const supabase = createClient();
    supabase
      .from("follows")
      .select("id")
      .eq("follower_id", user.id)
      .eq("following_id", targetUserId)
      .single()
      .then(({ data }) => setFollowing(!!data));
  }, [user, targetUserId]);

  const toggle = async () => {
    if (!user || loading) return;
    setLoading(true);
    const supabase = createClient();

    if (following) {
      await supabase
        .from("follows")
        .delete()
        .eq("follower_id", user.id)
        .eq("following_id", targetUserId);
      setFollowing(false);
      setCount((c) => c - 1);
    } else {
      await supabase
        .from("follows")
        .insert({ follower_id: user.id, following_id: targetUserId });
      setFollowing(true);
      setCount((c) => c + 1);
    }
    setLoading(false);
  };

  return { following, count, toggle, loading };
}
