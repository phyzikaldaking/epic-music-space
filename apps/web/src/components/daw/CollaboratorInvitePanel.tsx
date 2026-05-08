"use client";

/**
 * CollaboratorInvitePanel
 *
 * Turns the raw presence data already tracked by DawWorkspace into a full
 * "invite your co-producer" experience:
 *
 *  • Shows every active collaborator with their name, focus mode, and a
 *    live transport indicator (playing / paused).
 *  • Generates a shareable session link that opens the Studio Board with a
 *    ?session= param so the invitee joins the same Supabase presence channel.
 *  • Copy-to-clipboard with a native-style check animation.
 *  • Role badge for each collaborator (record / arrange / mix / publish).
 *  • "Waiting for collaborators" empty state.
 *
 * This component is pure UI — it receives already-resolved presence state from
 * DawWorkspace so it has no direct Supabase dependency.
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types (mirror the shape used by DawWorkspace without importing from there)
// ---------------------------------------------------------------------------
export interface CollaboratorPresenceRecord {
  id: string;
  name: string;
  focusMode: string;
  isPlaying: boolean;
  updatedAt: string;
  /** Optional: avatar URL if available */
  avatarUrl?: string | null;
}

interface Props {
  /** The current user's presence ID (used to mark "you" in the list). */
  selfId: string;
  /** Project/session ID — used to build the invite link. */
  sessionId: string | null;
  /** All active collaborators including self. */
  collaborators: CollaboratorPresenceRecord[];
  /** Whether the Supabase presence channel is subscribed. */
  connected: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FOCUS_LABELS: Record<string, string> = {
  all: "All panels",
  record: "Recording",
  arrange: "Arranging",
  mix: "Mixing",
  publish: "Publishing",
};

const FOCUS_COLORS: Record<string, string> = {
  all: "text-white/60",
  record: "text-red-300",
  arrange: "text-cyan-300",
  mix: "text-violet-300",
  publish: "text-emerald-300",
};

const FOCUS_DOT: Record<string, string> = {
  all: "bg-white/40",
  record: "bg-red-400",
  arrange: "bg-cyan-400",
  mix: "bg-violet-400",
  publish: "bg-emerald-400",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 10_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  return `${Math.floor(diff / 60_000)}m ago`;
}

function buildInviteLink(sessionId: string | null): string {
  if (typeof window === "undefined") return "";
  const base = `${window.location.origin}/studio/board`;
  if (!sessionId) return base;
  return `${base}?session=${encodeURIComponent(sessionId)}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AvatarInitials({
  name,
  size = "md",
}: {
  name: string;
  size?: "sm" | "md";
}) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  const sizeClass = size === "sm" ? "h-6 w-6 text-[9px]" : "h-8 w-8 text-[11px]";

  return (
    <div
      className={`shrink-0 rounded-full bg-gradient-to-br from-brand-500 to-accent-500 ${sizeClass} flex items-center justify-center font-bold text-white`}
    >
      {initials || "?"}
    </div>
  );
}

function CollaboratorRow({
  collaborator,
  isSelf,
}: {
  collaborator: CollaboratorPresenceRecord;
  isSelf: boolean;
}) {
  const mode = collaborator.focusMode || "all";

  return (
    <li className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-2.5 py-2">
      <div className="relative shrink-0">
        {collaborator.avatarUrl ? (
          <img
            src={collaborator.avatarUrl}
            alt={collaborator.name}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <AvatarInitials name={collaborator.name} />
        )}
        {/* Focus mode dot */}
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-black ${FOCUS_DOT[mode] ?? "bg-white/40"}`}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-xs font-semibold text-white">
            {collaborator.name}
          </p>
          {isSelf && (
            <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white/50">
              you
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold ${FOCUS_COLORS[mode] ?? "text-white/50"}`}>
            {FOCUS_LABELS[mode] ?? mode}
          </span>
          <span className="text-[10px] text-white/30">·</span>
          <span className="text-[10px] text-white/40">
            {collaborator.isPlaying ? (
              <span className="inline-flex items-center gap-1 text-emerald-300/70">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                Playing
              </span>
            ) : (
              "Paused"
            )}
          </span>
        </div>
      </div>

      <p className="shrink-0 text-[9px] text-white/30">
        {relativeTime(collaborator.updatedAt)}
      </p>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CollaboratorInvitePanel({
  selfId,
  sessionId,
  collaborators,
  connected,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build the invite link client-side (needs window.location)
  useEffect(() => {
    setInviteLink(buildInviteLink(sessionId));
  }, [sessionId]);

  const handleCopy = useCallback(async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard API not available — fall back to select
      const el = document.createElement("textarea");
      el.value = inviteLink;
      el.style.position = "absolute";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2500);
    }
  }, [inviteLink]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const others = collaborators.filter((c) => c.id !== selfId);
  const self = collaborators.find((c) => c.id === selfId);
  // Show self first, then others sorted by most recently updated
  const sorted = [
    ...(self ? [self] : []),
    ...others.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  ];

  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-3">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-200/85">
            Collaborators
          </p>
          <p className="mt-0.5 text-xs text-white/40">
            {connected
              ? collaborators.length === 1
                ? "Only you in this session"
                : `${collaborators.length} producers online`
              : "Connecting…"}
          </p>
        </div>
        {/* Connection indicator */}
        <span
          className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-widest ${
            connected
              ? "bg-emerald-500/15 text-emerald-300"
              : "bg-white/5 text-white/30"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-white/20"}`}
          />
          {connected ? "Live" : "Offline"}
        </span>
      </div>

      {/* Collaborator list */}
      {sorted.length > 0 ? (
        <ul className="mb-3 space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
          {sorted.map((c) => (
            <CollaboratorRow
              key={c.id}
              collaborator={c}
              isSelf={c.id === selfId}
            />
          ))}
        </ul>
      ) : (
        <div className="mb-3 rounded-lg border border-white/8 bg-white/[0.02] p-3 text-center">
          <p className="text-[11px] text-white/40">
            No one else is in this session yet. Share the link below to invite a
            co-producer.
          </p>
        </div>
      )}

      {/* Invite link section */}
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/50">
          Invite link
        </p>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 overflow-hidden rounded-md bg-black/40 px-2 py-1.5">
            <p className="truncate font-mono text-[10px] text-white/60">
              {inviteLink || "/studio/board"}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy invite link"
            className={`shrink-0 rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition ${
              copied
                ? "bg-emerald-500/20 text-emerald-300"
                : "border border-white/15 text-white/70 hover:border-white/30 hover:text-white"
            }`}
          >
            {copied ? (
              <span className="flex items-center gap-1">
                <svg
                  aria-hidden="true"
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Copied
              </span>
            ) : (
              "Copy"
            )}
          </button>
        </div>
        <p className="mt-2 text-[9px] leading-relaxed text-white/30">
          Anyone with this link can join your session and appear in the
          collaborator list. They still need to sign in.
        </p>
      </div>
    </div>
  );
}
