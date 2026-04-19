"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { SongWithArtist } from "@/types/database";

export function useFeed(limit = 20) {
  const [songs, setSongs] = useState<SongWithArtist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(page);

  const doFetch = async (pageNum: number, replace = false) => {
    const supabase = createClient();
    const from = pageNum * limit;
    const to = from + limit - 1;

    const { data, error: fetchError } = await (supabase
      .from("songs")
      .select("*, profiles(*)")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .range(from, to) as unknown as Promise<{ data: SongWithArtist[] | null; error: { message: string } | null }>);

    if (fetchError) {
      setError(fetchError.message);
      setLoading(false);
    } else {
      const items = data ?? [];
      if (replace) {
        setSongs(items);
      } else {
        setSongs((prev) => [...prev, ...items]);
      }
      setHasMore(items.length === limit);
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void doFetch(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = () => {
    const next = pageRef.current + 1;
    pageRef.current = next;
    setPage(next);
    void doFetch(next);
  };

  return { songs, loading, error, hasMore, loadMore };
}
