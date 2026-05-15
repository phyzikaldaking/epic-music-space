import type { CrdtOperation } from "@/app/studio/try/studioDawTypes";

export type CollaborationCursor = {
  actorId: string;
  actorName?: string;
  trackId?: string;
  beat?: number;
  color: string;
  updatedAt: string;
};

export type LaneLock = {
  laneId: string;
  actorId: string;
  expiresAt: string;
};

export type CollaborationConflict = {
  id: string;
  targetId: string;
  entity: CrdtOperation["entity"];
  winner: CrdtOperation;
  loser: CrdtOperation;
  reason: "same-target-clock" | "delete-update" | "stale-lock";
};

export type DistributedUndoEntry = {
  id: string;
  actorId: string;
  operationId: string;
  inverse: CrdtOperation;
  createdAt: string;
};

export function isLaneLocked(locks: LaneLock[], laneId: string, actorId: string, now = new Date()) {
  const lock = locks.find((item) => item.laneId === laneId && new Date(item.expiresAt) > now);
  return Boolean(lock && lock.actorId !== actorId);
}

export function acquireLaneLock(locks: LaneLock[], laneId: string, actorId: string, ttlMs = 20_000) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  return [...locks.filter((lock) => lock.laneId !== laneId || new Date(lock.expiresAt) <= now), { laneId, actorId, expiresAt }];
}

export function detectCrdtConflicts(operations: CrdtOperation[]) {
  const conflicts: CollaborationConflict[] = [];
  const byTarget = new Map<string, CrdtOperation[]>();
  operations.forEach((operation) => {
    const key = `${operation.entity}:${operation.targetId}`;
    byTarget.set(key, [...(byTarget.get(key) ?? []), operation]);
  });
  byTarget.forEach((items) => {
    const sorted = [...items].sort((a, b) => a.clock - b.clock || a.actorId.localeCompare(b.actorId));
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (previous.clock === current.clock || previous.action === "delete" || current.action === "delete") {
        const winner = current.clock >= previous.clock ? current : previous;
        const loser = winner.id === current.id ? previous : current;
        conflicts.push({
          id: `conflict-${winner.targetId}-${winner.clock}-${loser.clock}`,
          targetId: winner.targetId,
          entity: winner.entity,
          winner,
          loser,
          reason: previous.action === "delete" || current.action === "delete" ? "delete-update" : "same-target-clock",
        });
      }
    }
  });
  return conflicts;
}

export function createInverseOperation(operation: CrdtOperation, actorId: string): CrdtOperation {
  return {
    id: `undo-${operation.id}-${Date.now()}`,
    actorId,
    clock: operation.clock + 0.001,
    entity: operation.entity,
    action: operation.action === "insert" ? "delete" : operation.action === "delete" ? "insert" : "update",
    targetId: operation.targetId,
    payload: operation.payload,
  };
}

export function pushDistributedUndo(stack: DistributedUndoEntry[], operation: CrdtOperation, actorId: string) {
  return [
    ...stack,
    {
      id: `undo-entry-${operation.id}`,
      actorId,
      operationId: operation.id,
      inverse: createInverseOperation(operation, actorId),
      createdAt: new Date().toISOString(),
    },
  ].slice(-100);
}
