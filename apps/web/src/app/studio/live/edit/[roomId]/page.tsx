import type { Metadata } from "next";
import LiveEditSpectator from "./LiveEditSpectator";

export const metadata: Metadata = {
  title: "Live edit session",
  description:
    "Watch a producer build a beat live. Read-only view of their pattern, BPM, and kit — synced over Yjs in real time.",
};

// Spectator page for live-collab sessions (#G42). Anyone with the
// permalink can drop in and see the room's beat machine state in real
// time. Read-only: no edits, no audio render. The host's collaborators
// can edit through the normal /studio/board route with the same
// roomId. This page is intentionally minimal so it loads fast and
// doesn't try to boot the full DAW engine.
export default async function LiveEditPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <LiveEditSpectator roomId={roomId} />;
}
