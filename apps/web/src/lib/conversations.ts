import { prisma } from "@/lib/prisma";

/**
 * Conversation rows are keyed on a canonical (userAId, userBId) tuple
 * where userAId < userBId. This helper enforces that ordering so any
 * two callers asking for the conversation between users X and Y always
 * resolve to the same row.
 */
export function canonicalPair(a: string, b: string): { userAId: string; userBId: string } {
  return a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a };
}

/**
 * Find or create the 1:1 conversation between two users. Returns the row
 * with both participant ids. Used by the "open thread with X" affordance
 * on profiles and post cards.
 */
export async function findOrCreateConversation(viewerId: string, otherId: string) {
  if (viewerId === otherId) {
    throw new Error("Cannot start a conversation with yourself.");
  }
  const pair = canonicalPair(viewerId, otherId);

  const existing = await prisma.conversation.findUnique({
    where: { userAId_userBId: pair },
  });
  if (existing) return existing;

  // Create — race-tolerant: if another request created the row between our
  // findUnique and create, the unique index throws and we re-fetch.
  try {
    return await prisma.conversation.create({ data: pair });
  } catch {
    const racedRow = await prisma.conversation.findUnique({
      where: { userAId_userBId: pair },
    });
    if (!racedRow) throw new Error("Could not start conversation.");
    return racedRow;
  }
}

/**
 * Returns true if the conversation is between blocked parties — used to
 * gate message sends and reads. We treat a block in either direction as
 * a hard stop.
 */
export async function isBlocked(viewerId: string, otherId: string) {
  const blocks = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: viewerId, blockedId: otherId },
        { blockerId: otherId, blockedId: viewerId },
      ],
    },
    select: { id: true },
  });
  return !!blocks;
}
