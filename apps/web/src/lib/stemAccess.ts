import { prisma } from "@/lib/prisma";

/**
 * Who can request stems for a track and who can read them once generated.
 *
 * Policy:
 *   - The song's artist: always (free) — they own the master.
 *   - License holders (active LicenseToken): always (free) — license
 *     ownership = remix permission, that's the whole product thesis.
 *   - Admins: always (for moderation / debugging).
 *   - Everyone else: denied. Future tier: a one-time stem-access purchase
 *     priced separately from a full license.
 */
export interface StemAccess {
  ok: boolean;
  reason: "artist" | "license_holder" | "admin" | "denied" | "song_not_found";
}

export async function checkStemAccess(
  songId: string,
  viewerId: string | null,
  viewerRole: string | null,
): Promise<StemAccess> {
  if (!viewerId) return { ok: false, reason: "denied" };
  if (viewerRole === "ADMIN") return { ok: true, reason: "admin" };

  const song = await prisma.song.findUnique({
    where: { id: songId },
    select: { artistId: true },
  });
  if (!song) return { ok: false, reason: "song_not_found" };
  if (song.artistId === viewerId) return { ok: true, reason: "artist" };

  const license = await prisma.licenseToken.findFirst({
    where: { songId, holderId: viewerId, status: "ACTIVE" },
    select: { id: true },
  });
  if (license) return { ok: true, reason: "license_holder" };

  return { ok: false, reason: "denied" };
}
