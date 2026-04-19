export default function AiScoreBar({ score, showLabel = true, size = "md", }) {
    const clampedScore = Math.min(100, Math.max(0, score));
    const color = clampedScore >= 80
        ? "from-accent-400 to-accent-600"
        : clampedScore >= 50
            ? "from-brand-400 to-brand-600"
            : "from-white/30 to-white/50";
    const heights = { sm: "h-1", md: "h-1.5", lg: "h-2" };
    const textSizes = { sm: "text-xs", md: "text-xs", lg: "text-sm" };
    return (<div className="w-full">
      {showLabel && (<div className={`mb-1 flex items-center justify-between ${textSizes[size]}`}>
          <span className="text-white/50">EMS Score</span>
          <span className="font-bold text-white">{clampedScore.toFixed(1)}</span>
        </div>)}
      <div className={`${heights[size]} w-full rounded-full bg-white/10`}>
        <div className={`${heights[size]} rounded-full bg-gradient-to-r ${color} transition-all duration-700`} style={{ width: `${clampedScore}%` }}/>
      </div>
    </div>);
}
