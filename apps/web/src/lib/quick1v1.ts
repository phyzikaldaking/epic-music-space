import { cacheGet, cacheSet } from "@/lib/redis";

const QUICK_SESSION_TTL_SECONDS = 3 * 24 * 60 * 60;
const QUICK_SESSION_PREFIX = "ems:versus:quick1v1:";

export interface Quick1v1Session {
  id: string;
  creatorId: string;
  createdAt: string;
  roundMatchIds: [string, string];
}

function key(id: string) {
  return `${QUICK_SESSION_PREFIX}${id}`;
}

export function makeFallbackQuickSessionId(roundMatchIds: [string, string]) {
  return `${roundMatchIds[0]}.${roundMatchIds[1]}`;
}

export function parseFallbackQuickSessionId(sessionId: string): [string, string] | null {
  const parts = sessionId.split(".").map((p) => p.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  return [parts[0], parts[1]];
}

export async function saveQuick1v1Session(session: Quick1v1Session) {
  await cacheSet(key(session.id), session, QUICK_SESSION_TTL_SECONDS);
}

export async function getQuick1v1Session(sessionId: string) {
  return cacheGet<Quick1v1Session>(key(sessionId));
}
