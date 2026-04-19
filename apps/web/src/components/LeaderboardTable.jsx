export default function LeaderboardTable({ entries, type }) {
    return (<div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full text-sm">
        <thead className="border-b border-white/10 bg-white/5 text-white/50">
          <tr>
            <th className="px-4 py-3 text-left w-10">#</th>
            <th className="px-4 py-3 text-left">
              {type === "songs" ? "Song" : "Artist"}
            </th>
            {type === "songs" && (<>
                <th className="px-4 py-3 text-left">EMS Score</th>
                <th className="px-4 py-3 text-left">Licenses Sold</th>
              </>)}
            {type === "artists" && (<>
                <th className="px-4 py-3 text-left">Total Sold</th>
                <th className="px-4 py-3 text-left">Followers</th>
              </>)}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j;
            return (<tr key={entry.id} className="border-b border-white/5 hover:bg-white/5">
              <td className="px-4 py-3 text-white/40 font-mono">
                {i + 1 <= 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-brand-900 to-accent-600 flex items-center justify-center text-lg">
                    {((_a = entry.coverUrl) !== null && _a !== void 0 ? _a : entry.image) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={((_b = entry.coverUrl) !== null && _b !== void 0 ? _b : entry.image)} alt={(_d = (_c = entry.title) !== null && _c !== void 0 ? _c : entry.name) !== null && _d !== void 0 ? _d : ""} className="h-full w-full object-cover"/>) : (type === "songs" ? "🎵" : "👤")}
                  </div>
                  <div>
                    {type === "songs" ? (<a href={`/studio/${entry.id}`} className="font-medium text-brand-400 hover:underline">
                        {entry.title}
                      </a>) : (<a href={entry.username ? `/studio/${entry.username}` : "#"} className="font-medium text-brand-400 hover:underline">
                        {(_e = entry.name) !== null && _e !== void 0 ? _e : "Unknown Artist"}
                      </a>)}
                    {entry.artist && (<p className="text-xs text-white/40">{entry.artist}</p>)}
                  </div>
                </div>
              </td>
              {type === "songs" && (<>
                  <td className="px-4 py-3 font-bold text-white">
                    {((_f = entry.aiScore) !== null && _f !== void 0 ? _f : 0).toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-white/70">
                    {(_g = entry.soldLicenses) !== null && _g !== void 0 ? _g : 0}
                  </td>
                </>)}
              {type === "artists" && (<>
                  <td className="px-4 py-3 font-bold text-brand-400">
                    {(_h = entry.totalLicensesSold) !== null && _h !== void 0 ? _h : 0}
                  </td>
                  <td className="px-4 py-3 text-white/70">
                    {(_j = entry.followers) !== null && _j !== void 0 ? _j : 0}
                  </td>
                </>)}
            </tr>);
        })}
        </tbody>
      </table>
    </div>);
}
