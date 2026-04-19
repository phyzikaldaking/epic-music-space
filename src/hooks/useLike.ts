"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./useAuth";

export function useLike(songId: string, initialCount = 0) {
  const { user } = useAuth();
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from("likes")
      .select("id")
      .eq("user_id", user.id)
      .eq("song_id", songId)
      .single()
      .then(({ data }) => setLiked(!!data));
  }, [user, songId]);

  const toggle = async () => {
    if (!user || loading) return;
    setLoading(true);
    const supabase = createClient();

    if (liked) {
      await supabase.from("likes").delete().eq("user_id", user.id).eq("song_id", songId);
      setLiked(false);
      setCount((c) => c - 1);
    } else {
      await supabase.from("likes").insert({ user_id: user.id, song_id: songId });
      setLiked(true);
      setCount((c) => c + 1);
    }
    setLoading(false);
  };

  return { liked, count, toggle, loading };
}
