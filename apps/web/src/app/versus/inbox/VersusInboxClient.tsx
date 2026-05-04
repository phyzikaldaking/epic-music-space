"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";

interface SongStub {
  id: string;
  title: string;
  artist?: string;
  coverUrl: string | null;
}

interface UserStub {
  id: string;
  name: string | null;
  image: string | null;
  studio: { username: string } | null;
}

interface Challenge {
  id: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "CANCELLED";
  message: string | null;
  durationHours: number;
  createdAt: string | Date;
  expiresAt: string | Date;
  matchId: string | null;
  challenger: UserStub | null;
  opponent: UserStub | null;
  challengerSong: SongStub | null;
  opponentSong: SongStub | null;
}

interface Props {
  incoming: Challenge[];
  outgoing: Challenge[];
  mySongs: { id: string; title: string; coverUrl: string | null }[];
}

export default function VersusInboxClient({ incoming, outgoing, mySongs }: Props) {
  const [tab, setTab] = useState<"incoming" | "outgoing">("incoming");
  const router = useRouter();
  const list = tab === "incoming" ? incoming : outgoing;

  return (
    <>
      <div className="mb-6 flex gap-2">
        <button
          type="button"
          onClick={() => setTab("incoming")}
          className={`rounded-full px-4 py-1.5 text-sm transition ${
            tab === "incoming"
              ? "bg-brand-500 text-white"
              : "border border-white/10 text-white/60 hover:bg-white/5"
          }`}
        >
          Incoming ({incoming.filter((c) => c.status === "PENDING").length})
        </button>
        <button
          type="button"
          onClick={() => setTab("outgoing")}
          className={`rounded-full px-4 py-1.5 text-sm transition ${
            tab === "outgoing"
              ? "bg-brand-500 text-white"
              : "border border-white/10 text-white/60 hover:bg-white/5"
          }`}
        >
          Outgoing ({outgoing.filter((c) => c.status === "PENDING").length})
        </button>
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-white/3 p-10 text-center">
          <p className="mb-2 text-2xl">⚔️</p>
          <p className="text-sm text-white/55">
            {tab === "incoming"
              ? "No incoming challenges. When someone challenges you, it'll show up here."
              : "You haven't sent any challenges yet."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((c) => (
            <ChallengeCard
              key={c.id}
              challenge={c}
              role={tab}
              mySongs={mySongs}
              onAfter={() => router.refresh()}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function ChallengeCard({
  challenge: c,
  role,
  mySongs,
  onAfter,
}: {
  challenge: Challenge;
  role: "incoming" | "outgoing";
  mySongs: Props["mySongs"];
  onAfter: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string>("");

  async function send(action: "accept" | "decline" | "cancel", opponentSongId?: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/versus/challenges/${c.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(opponentSongId ? { opponentSongId } : {}) }),
      });
      const data = (await res.json()) as { error?: string; match?: { id: string } };
      if (!res.ok) throw new Error(data.error ?? "Action failed.");
      if (action === "accept" && data.match) {
        window.location.href = `/versus/${data.match.id}`;
        return;
      }
      onAfter();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  const otherUser = role === "incoming" ? c.challenger : c.opponent;
  const otherSong = role === "incoming" ? c.challengerSong : c.opponentSong;
  const mySong = role === "incoming" ? null : c.challengerSong;
  const expiresIn = new Date(c.expiresAt).getTime() - Date.now();
  const expiresLabel =
    expiresIn <= 0 ? "expired" : `expires in ${Math.max(1, Math.floor(expiresIn / 3_600_000))}h`;

  return (
    <li className="rounded-2xl border border-white/8 bg-white/3 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-white/45">
          <StatusPill status={c.status} />
          <span>· {expiresLabel}</span>
        </div>
        <span className="text-[10px] text-white/30">
          {new Date(c.createdAt).toLocaleString()}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <SongChip song={otherSong} />
        <span className="text-white/30">vs</span>
        {mySong ? <SongChip song={mySong} /> : <span className="text-xs text-white/45">{role === "incoming" ? "your pick" : "—"}</span>}
      </div>

      {otherUser?.studio?.username && (
        <p className="mt-2 text-xs text-white/55">
          {role === "incoming" ? "From" : "To"}{" "}
          <Link href={`/studio/${otherUser.studio.username}`} className="hover:underline">
            @{otherUser.studio.username}
          </Link>
        </p>
      )}

      {c.message && (
        <p className="mt-2 rounded-lg border border-white/8 bg-white/4 px-3 py-2 text-xs italic text-white/70">
          “{c.message}”
        </p>
      )}

      {error && (
        <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      {role === "incoming" && c.status === "PENDING" && (
        <div className="mt-3 space-y-2">
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-widest text-white/40 mb-1">
              Your track
            </span>
            <select
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
              aria-label="Pick the song you'll battle with"
            >
              <option value="">Pick a song…</option>
              {mySongs.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => send("accept", picked)}
              disabled={busy || !picked}
              className="flex-1 rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-40"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => send("decline")}
              disabled={busy}
              className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/8"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {role === "outgoing" && c.status === "PENDING" && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => send("cancel")}
            disabled={busy}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/8"
          >
            Cancel challenge
          </button>
        </div>
      )}

      {c.status === "ACCEPTED" && c.matchId && (
        <Link
          href={`/versus/${c.matchId}`}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20"
        >
          → Open battle
        </Link>
      )}
    </li>
  );
}

function StatusPill({ status }: { status: Challenge["status"] }) {
  const map: Record<Challenge["status"], string> = {
    PENDING: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
    ACCEPTED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    DECLINED: "border-red-500/40 bg-red-500/10 text-red-300",
    EXPIRED: "border-white/15 bg-white/5 text-white/40",
    CANCELLED: "border-white/15 bg-white/5 text-white/40",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${map[status]}`}>
      {status}
    </span>
  );
}

function SongChip({ song }: { song: SongStub | null }) {
  if (!song) return <span className="text-xs text-white/45">—</span>;
  return (
    <Link
      href={`/track/${song.id}`}
      className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/8 bg-white/4 px-2 py-1.5 hover:bg-white/8"
    >
      <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded bg-brand-900">
        {song.coverUrl ? (
          <Image src={song.coverUrl} alt="" fill unoptimized className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-base">🎵</div>
        )}
      </div>
      <span className="truncate text-xs font-bold">{song.title}</span>
    </Link>
  );
}
