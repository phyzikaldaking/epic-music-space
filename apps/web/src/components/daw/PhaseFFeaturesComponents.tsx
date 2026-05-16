import React from "react";

/** Shared "Coming soon" preview badge */
function PreviewBadge() {
  return (
    <span className="ml-2 rounded-full bg-purple-600/30 border border-purple-500/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-purple-300">
      Preview
    </span>
  );
}

/** Genre effect chain presets — chains will be applied via DawEngine once FX routing ships */
export function GenreEffectChains({
  genre: selectedGenre,
  onSelectChain,
}: {
  genre?: string;
  onSelectChain?: (genre: string) => void;
}) {
  const genres = ["Lo-Fi", "Trap", "EDM", "Jazz", "Cinematic", "R&B", "Pop", "Rock"] as const;
  const normalizedSelectedGenre = selectedGenre?.toLowerCase();

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h3 className="mb-3 flex items-center text-sm font-bold text-white">
        ⚙️ Effect Presets
        <PreviewBadge />
      </h3>
      <div className="flex flex-wrap gap-2">
        {genres.map((genre) => {
          const isSelected = normalizedSelectedGenre === genre.toLowerCase();
          return (
            <button
              key={genre}
              onClick={() => onSelectChain?.(genre)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                isSelected
                  ? "border-purple-500/60 bg-purple-500/20 text-white"
                  : "border-white/10 bg-white/5 text-white/70 hover:border-purple-500/50 hover:bg-purple-500/10 hover:text-white"
              }`}
            >
              {genre}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-white/30">Full FX chain application coming with the FX routing update.</p>
    </div>
  );
}

/** AI Mastering A/B slider — connects to /api/mastering/render */
export function AIMasteringSlider({
  projectId,
  onMasteringRequested,
}: {
  projectId?: string;
  onMasteringRequested?: () => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const handleRequest = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const resp = await fetch("/api/mastering/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (resp.ok) {
        setDone(true);
        onMasteringRequested?.();
      }
    } catch {
      // handled upstream
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h3 className="mb-3 flex items-center text-sm font-bold text-white">
        🎛️ AI Mastering A/B
        <PreviewBadge />
      </h3>
      <p className="mb-3 text-xs text-white/50">Compare your original mix against an AI-mastered version.</p>
      <button
        onClick={handleRequest}
        disabled={loading || !projectId || done}
        className="w-full rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? "Processing…" : done ? "Mastering complete" : "Request AI Master"}
      </button>
      {!projectId && (
        <p className="mt-2 text-[11px] text-white/30">Save your project first to enable mastering.</p>
      )}
    </div>
  );
}

/** Trending sample packs this week — fetched from marketplace API */
export function TrendingSamplePacks({ onSelectPack }: { onSelectPack?: (packId: string) => void }) {
  const [packs, setPacks] = React.useState<Array<{ id: string; name: string; genre: string }>>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch("/api/stems/trending?limit=5")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.packs) setPacks(data.packs);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h3 className="mb-3 flex items-center text-sm font-bold text-white">
        🔥 Trending This Week
        <PreviewBadge />
      </h3>
      {loading && <p className="text-xs text-white/30 animate-pulse">Loading…</p>}
      {!loading && packs.length === 0 && (
        <p className="text-xs text-white/30">No trending packs available yet.</p>
      )}
      <div className="space-y-2">
        {packs.map((pack) => (
          <button
            key={pack.id}
            onClick={() => onSelectPack?.(pack.id)}
            className="w-full flex items-center justify-between rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-left hover:border-white/15 hover:bg-white/10 transition-colors"
          >
            <span className="text-sm font-medium text-white">{pack.name}</span>
            <span className="text-xs text-white/40">{pack.genre}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Social listening room — requires realtime presence feature (coming soon) */
export function SocialListeningRoom({
  roomId,
  listeners,
}: {
  roomId?: string;
  listeners?: Array<{ id: string; name: string; avatarUrl?: string }>;
}) {
  const hasListeners = listeners && listeners.length > 0;
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h3 className="mb-3 flex items-center text-sm font-bold text-white">
        👂 Listening Room
        <PreviewBadge />
      </h3>
      {hasListeners ? (
        <div className="flex -space-x-2">
          {listeners.slice(0, 8).map((l) => (
            <div
              key={l.id}
              title={l.name}
              className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#1a1a2e] bg-purple-700 text-xs font-bold uppercase text-white"
            >
              {l.name.charAt(0)}
            </div>
          ))}
          {listeners.length > 8 && (
            <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#1a1a2e] bg-white/10 text-xs text-white/60">
              +{listeners.length - 8}
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-white/30">
          {roomId ? "No one else is listening right now." : "Realtime listening rooms coming soon."}
        </p>
      )}
    </div>
  );
}
