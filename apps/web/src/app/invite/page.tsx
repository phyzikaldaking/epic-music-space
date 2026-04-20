"use client";

import { useEffect, useState } from "react";

interface InviteData {
  code: string;
  usedCount: number;
  milestones: { five: boolean; ten: boolean; fifty: boolean };
}

const MILESTONES = [
  {
    count: 5,
    key: "five" as const,
    label: "5 Invites",
    reward: "Billboard ad credit",
    badge: "🤝 Connector",
    icon: "📢",
  },
  {
    count: 10,
    key: "ten" as const,
    label: "10 Invites",
    reward: "Premium studio badge",
    badge: "📢 Recruiter",
    icon: "⭐",
  },
  {
    count: 50,
    key: "fifty" as const,
    label: "50 Invites",
    reward: "Prime plan upgrade credit",
    badge: "👑 Legend",
    icon: "👑",
  },
];

export default function InvitePage() {
  const [data, setData] = useState<InviteData | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/invite")
      .then((r) => r.json())
      .then((d: InviteData) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function getInviteUrl(code: string) {
    return `${window.location.origin}/auth/signup?invite=${code}`;
  }

  async function copyLink() {
    if (!data) return;
    await navigator.clipboard.writeText(getInviteUrl(data.code));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  // Progress toward next milestone
  const nextMilestone = MILESTONES.find((m) => !data?.milestones[m.key]);
  const progressPct = data && nextMilestone
    ? Math.min(100, (data.usedCount / nextMilestone.count) * 100)
    : 100;

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center text-white/40">
        <p>Sign in to get your invite link.</p>
        <a href="/auth/signin" className="mt-4 inline-block text-brand-400 underline">Sign in →</a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      {/* Header */}
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-extrabold text-gradient-ems mb-3">🔗 Invite Friends</h1>
        <p className="text-white/50 text-lg">
          Share Epic Music Space. Every friend who joins counts toward your milestone rewards.
        </p>
      </div>

      {/* Invite Link Card */}
      <div className="glass-card rounded-3xl p-7 mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/35 mb-4">
          Your Personal Invite Link
        </p>
        <div className="flex items-center gap-3">
          <div className="flex-1 overflow-hidden rounded-xl bg-white/5 border border-white/10 px-4 py-3">
            <p className="text-sm text-brand-300 font-mono truncate">
              {typeof window !== "undefined" ? getInviteUrl(data.code) : `…/auth/signup?invite=${data.code}`}
            </p>
          </div>
          <button
            onClick={() => void copyLink()}
            className={`flex-shrink-0 rounded-xl px-5 py-3 text-sm font-bold transition glow-purple-sm ${
              copied
                ? "bg-green-500 text-white"
                : "bg-brand-500 text-white hover:bg-brand-600"
            }`}
          >
            {copied ? "✓ Copied!" : "Copy Link"}
          </button>
        </div>

        <div className="mt-4 flex gap-3">
          <a
            href={`https://twitter.com/intent/tweet?text=🎵 Come battle me on Epic Music Space — the music platform where artists compete and fans win. Join using my link:&url=${typeof window !== "undefined" ? getInviteUrl(data.code) : ""}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/60 hover:bg-white/6 hover:text-white transition flex items-center gap-2"
          >
            𝕏 Share on X
          </a>
          <a
            href={`https://wa.me/?text=🎵 Join me on Epic Music Space! ${typeof window !== "undefined" ? getInviteUrl(data.code) : ""}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/60 hover:bg-white/6 hover:text-white transition"
          >
            WhatsApp
          </a>
        </div>
      </div>

      {/* Progress */}
      <div className="glass-card rounded-3xl p-7 mb-8">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/35">Progress</p>
          <span className="text-2xl font-extrabold text-brand-400">{data.usedCount}</span>
        </div>

        {nextMilestone ? (
          <>
            <div className="mb-2 flex justify-between text-xs text-white/40">
              <span>{data.usedCount} joined</span>
              <span>Next: {nextMilestone.label}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="mt-3 text-sm text-white/40">
              <span className="text-white font-semibold">{nextMilestone.count - data.usedCount} more</span> to unlock{" "}
              <span className="text-brand-300">{nextMilestone.reward}</span>
            </p>
          </>
        ) : (
          <p className="text-sm text-gold-400 font-semibold">🏆 All milestones unlocked!</p>
        )}
      </div>

      {/* Milestone rewards */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold mb-5">🎁 Milestone Rewards</h2>
        {MILESTONES.map((m) => {
          const unlocked = data.milestones[m.key];
          return (
            <div
              key={m.key}
              className={`flex items-center gap-5 rounded-2xl border p-5 transition ${
                unlocked
                  ? "border-brand-500/40 bg-brand-500/8"
                  : "border-white/8 bg-white/2 opacity-60"
              }`}
            >
              <span className="text-3xl flex-shrink-0">{m.icon}</span>
              <div className="flex-1">
                <p className={`font-bold ${unlocked ? "text-brand-300" : "text-white/60"}`}>
                  {m.badge}
                </p>
                <p className="text-sm text-white/40 mt-0.5">{m.reward}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`text-xs font-semibold uppercase tracking-widest ${unlocked ? "text-green-400" : "text-white/25"}`}>
                  {unlocked ? "✓ Unlocked" : `${m.count} invites`}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* How it works */}
      <div className="mt-12 glass-card rounded-3xl p-7">
        <h3 className="font-bold mb-4 text-white/70">How it works</h3>
        <ol className="space-y-3 text-sm text-white/50">
          <li className="flex gap-3"><span className="text-brand-400 font-bold flex-shrink-0">1.</span> Copy your invite link above</li>
          <li className="flex gap-3"><span className="text-brand-400 font-bold flex-shrink-0">2.</span> Share it with friends, on social media, or in your music bio</li>
          <li className="flex gap-3"><span className="text-brand-400 font-bold flex-shrink-0">3.</span> When they sign up using your link, it counts toward your milestone</li>
          <li className="flex gap-3"><span className="text-brand-400 font-bold flex-shrink-0">4.</span> Hit 5 / 10 / 50 invites to unlock badges and platform rewards</li>
        </ol>
      </div>
    </div>
  );
}
