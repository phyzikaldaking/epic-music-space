/**
 * Centralized cache-tag registry for Next.js unstable_cache + revalidateTag.
 * Anything that mutates a piece of state should call revalidateTag(<tag>) so
 * the corresponding cached reads recompute on the next request.
 */

export const CACHE_TAGS = {
  homepage: "ems:homepage",
  songs: "ems:songs",
  track: (id: string) => `ems:track:${id}`,
  battles: "ems:battles",
  demoTracks: "ems:demo-tracks",
} as const;
