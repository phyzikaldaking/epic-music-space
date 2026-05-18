// Seed/launch-catalog tracks that exist to keep the marketplace from looking
// empty on a fresh DB. They should never outrank real artist uploads on
// public ranking surfaces — the explicit ask is "push real artists to the
// forefront above me." Sources of truth: packages/db/prisma/seed-phyzikal.ts
// and apps/web/src/data/phyzikalBeats.ts.

export const LAUNCH_CATALOG_TRACK_IDS = new Set<string>([
  "back-then-drunk",
  "bankston-brothers",
  "bodega",
  "clear-the-record",
  "dog-food",
  "pay-like-you-weigh",
]);

export const LAUNCH_CATALOG_USERNAMES = new Set<string>(["phyzikaldaking"]);

export const LAUNCH_CATALOG_ARTIST_NAMES = new Set<string>(["PHYZIKAL DA KING"]);

export function isLaunchCatalogTrack(track: {
  id?: string | null;
  artist?: string | null;
}): boolean {
  if (track.id && LAUNCH_CATALOG_TRACK_IDS.has(track.id)) return true;
  if (track.id && track.id.startsWith("demo-")) return true;
  if (track.artist && LAUNCH_CATALOG_ARTIST_NAMES.has(track.artist)) return true;
  return false;
}

export function isLaunchCatalogArtist(user: {
  username?: string | null;
  name?: string | null;
}): boolean {
  if (user.username && LAUNCH_CATALOG_USERNAMES.has(user.username)) return true;
  if (user.name && LAUNCH_CATALOG_ARTIST_NAMES.has(user.name)) return true;
  return false;
}
