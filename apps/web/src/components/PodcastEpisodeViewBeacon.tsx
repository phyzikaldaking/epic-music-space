"use client";

import { useEffect } from "react";

export default function PodcastEpisodeViewBeacon({ episodeId }: { episodeId: string }) {
  useEffect(() => {
    void fetch(`/api/podcast/episodes/${episodeId}/view`, { method: "POST" }).catch(() => null);
  }, [episodeId]);

  return null;
}
