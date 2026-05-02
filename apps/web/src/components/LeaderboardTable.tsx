interface LeaderboardEntry {
  rank?: number;
  id: string;
  title?: string;
  name?: string;
  artist?: string;
  coverUrl?: string | null;
  image?: string | null;
  aiScore?: number;
  soldLicenses?: number;
  totalLicensesSold?: number;
  followers?: number;
  district?: string;
  username?: string;
}

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  type: "songs" | "artists";
}

export default function LeaderboardTable({ entries, type }: LeaderboardTableProps) {
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 py-16 text-center">
        <p className="text-sm font-semibold text-white/30">
          {type === "songs" ? "No songs on the leaderboard yet." : "No artists on the leaderboard yet."}
        </p>
        <p className="mt-1 text-xs text-white/20">
          {type === "songs"
            ? "Upload tracks and sell licenses to appear here."
            : "Artists appear here once they have sold licenses."}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full text-sm">
        <thead className="border-b border-white/10 bg-white/5 text-white/50">
          <tr>
            <th className="px-4 py-3 text-left w-10">#</th>
            <th className="px-4 py-3 text-left">
              {type === "songs" ? "Song" : "Artist"}
            </th>
            {type === "songs" && (
              <>
                <th className="px-4 py-3 text-left">
                  <span title="Composite score based on license sales, streams, battle wins, and AI sentiment">
                    EMS Score ⓘ
                  </span>
                </th>
                <th className="px-4 py-3 text-left">Licenses Sold</th>
              </>
            )}
            {type === "artists" && (
              <>
                <th className="px-4 py-3 text-left">Total Sold</th>
                <th className="px-4 py-3 text-left">Followers</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => (
            <tr key={entry.id} className="border-b border-white/5 hover:bg-white/5">
              <td className="px-4 py-3 text-white/40 font-mono">
                {i + 1 <= 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-brand-900 to-accent-600 flex items-center justify-center text-lg">
                    {(entry.coverUrl ?? entry.image) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={(entry.coverUrl ?? entry.image)!}
                        alt={entry.title ?? entry.name ?? ""}
                        width={80}
                        height={80}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      type === "songs" ? "🎵" : "👤"
                    )}
                  </div>
                  <div>
                    {type === "songs" ? (
                      <a
                        href={`/track/${entry.id}`}
                        className="font-medium text-brand-400 hover:underline"
                      >
                        {entry.title}
                      </a>
                    ) : entry.username ? (
                      <a
                        href={`/studio/${entry.username}`}
                        className="font-medium text-brand-400 hover:underline"
                      >
                        {entry.name ?? entry.username}
                      </a>
                    ) : (
                      <span className="font-medium text-white/60">
                        {entry.name ?? "Unknown Artist"}
                      </span>
                    )}
                    {entry.artist && (
                      <p className="text-xs text-white/40">{entry.artist}</p>
                    )}
                  </div>
                </div>
              </td>
              {type === "songs" && (
                <>
                  <td className="px-4 py-3 font-bold text-white">
                    {(entry.aiScore ?? 0).toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-white/70">
                    {entry.soldLicenses ?? 0}
                  </td>
                </>
              )}
              {type === "artists" && (
                <>
                  <td className="px-4 py-3 font-bold text-brand-400">
                    {entry.totalLicensesSold ?? 0}
                  </td>
                  <td className="px-4 py-3 text-white/70">
                    {entry.followers ?? 0}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
