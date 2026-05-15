"use client";

import Link from "next/link";
import { memo, useMemo, useState } from "react";
import { acquireLaneLock, detectCrdtConflicts, pushDistributedUndo, type CollaborationCursor, type LaneLock } from "@/lib/studioCollaborationEngine";
import type { CrdtOperation } from "./studioDawTypes";

const actors: CollaborationCursor[] = [
  { actorId: "king", actorName: "King", trackId: "lead", beat: 12, color: "#17fff4", updatedAt: new Date().toISOString() },
  { actorId: "producer", actorName: "Producer", trackId: "drums", beat: 20, color: "#ff34df", updatedAt: new Date().toISOString() },
  { actorId: "engineer", actorName: "Engineer", trackId: "bass", beat: 28, color: "#f6d63d", updatedAt: new Date().toISOString() },
];

const operations: CrdtOperation[] = [
  { id: "op-1", actorId: "king", clock: 12, entity: "clip", action: "update", targetId: "hook-lead", payload: { startBeat: 33 } },
  { id: "op-2", actorId: "producer", clock: 12, entity: "clip", action: "update", targetId: "hook-lead", payload: { startBeat: 37 } },
  { id: "op-3", actorId: "engineer", clock: 13, entity: "automation", action: "insert", targetId: "lead-gain", payload: { value: 0.82 } },
];

function StudioCollabPanel() {
  const [locks, setLocks] = useState<LaneLock[]>([]);
  const [undoStack, setUndoStack] = useState(() => operations.slice(0, 1).reduce((stack, operation) => pushDistributedUndo(stack, operation, "king"), [] as ReturnType<typeof pushDistributedUndo>));
  const conflicts = useMemo(() => detectCrdtConflicts(operations), []);

  return (
    <section className="min-h-[680px] overflow-y-auto overscroll-contain rounded-xl border border-cyan-300/25 bg-black/50 p-4 pr-2">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200/70">Collab Console</p>
      <h2 className="mt-1 text-3xl font-black uppercase">Live session controls</h2>
      <p className="mt-2 text-sm text-white/55">Multiplayer presence, lane locks, conflict review, and distributed undo are now surfaced directly in the studio.</p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Link href="/studio/collab" className="rounded-xl border border-cyan-300/35 bg-cyan-300/10 p-4 text-center text-sm font-black uppercase text-cyan-100">Open Collab Console</Link>
        <Link href="/studio/collab?roomId=ems-main-room" className="rounded-xl border border-pink-300/35 bg-pink-300/10 p-4 text-center text-sm font-black uppercase text-pink-100">Main Room</Link>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/[.035] p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/45">Collaborator cursors</p>
          <div className="mt-3 grid gap-2">
            {actors.map((actor) => (
              <div key={actor.actorId} className="rounded-lg border border-white/10 bg-black/35 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase" style={{ color: actor.color }}>{actor.actorName}</span>
                  <span className="rounded-full border border-white/10 px-2 py-1 text-[9px] text-white/45">Beat {actor.beat}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${Math.min(100, Number(actor.beat ?? 0) * 2)}%`, background: actor.color }} /></div>
                <p className="mt-1 text-[10px] uppercase text-white/35">Editing {actor.trackId}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[.035] p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/45">Lane locks</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {["lead", "drums", "bass", "automation"].map((lane) => {
              const lock = locks.find((item) => item.laneId === lane);
              return (
                <button key={lane} onClick={() => setLocks((current) => acquireLaneLock(current, lane, "king"))} className={`rounded-lg border px-3 py-2 text-xs font-black uppercase ${lock ? "border-yellow-300 bg-yellow-300/15 text-yellow-100" : "border-white/10 text-white/55"}`}>
                  {lock ? `Locked ${lane}` : `Lock ${lane}`}
                </button>
              );
            })}
          </div>
          <div className="mt-3 grid gap-2">
            {locks.map((lock) => <div key={lock.laneId} className="rounded-lg border border-yellow-300/20 bg-yellow-300/10 p-2 text-[10px] uppercase text-yellow-100">{lock.laneId} held by {lock.actorId}</div>)}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[.035] p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/45">Distributed undo</p>
          <div className="mt-3 grid gap-2">
            {undoStack.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-white/10 bg-black/35 p-2 text-[10px] uppercase text-white/50">
                {entry.actorId} can undo {entry.operationId}
              </div>
            ))}
          </div>
          <button onClick={() => setUndoStack((current) => current.slice(0, -1))} className="mt-3 rounded-lg border border-red-300/25 px-3 py-2 text-xs font-black uppercase text-red-100">Pop Undo</button>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-red-300/20 bg-red-300/10 p-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-red-100/80">Conflict reconciliation</p>
        <div className="mt-3 grid gap-2">
          {conflicts.map((conflict) => (
            <div key={conflict.id} className="rounded-lg border border-red-300/20 bg-black/35 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-black uppercase text-red-100">{conflict.entity}: {conflict.targetId}</span>
                <span className="rounded-full border border-red-300/30 px-2 py-1 text-[9px] uppercase text-red-100">{conflict.reason}</span>
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <div className="rounded border border-green-300/20 bg-green-300/10 p-2 text-[10px] uppercase text-green-100">Winner: {conflict.winner.actorId} / {conflict.winner.action}</div>
                <div className="rounded border border-white/10 bg-white/[.035] p-2 text-[10px] uppercase text-white/45">Superseded: {conflict.loser.actorId} / {conflict.loser.action}</div>
              </div>
            </div>
          ))}
          {!conflicts.length && <p className="text-sm text-white/45">No conflicts detected.</p>}
        </div>
      </div>
    </section>
  );
}

export default memo(StudioCollabPanel);
