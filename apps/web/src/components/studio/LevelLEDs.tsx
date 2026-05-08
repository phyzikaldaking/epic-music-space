type Props = {
  /** 0–1 fill ratio. */
  value: number;
  /** Number of LED segments (default 12). */
  segments?: number;
  /** Stenciled label printed beside the strip. */
  label?: string;
  /** Where the "red" overload zone starts as a fraction of total. */
  redAt?: number;
  /** Horizontal or vertical orientation. */
  orientation?: "horizontal" | "vertical";
  className?: string;
};

/**
 * Segmented LED level strip — green at the bottom, yellow in the middle,
 * red at the top. Use anywhere a progress bar would go on the studio
 * pages: licenses sold / cap, recording readiness, tier rollout.
 */
export default function LevelLEDs({
  value,
  segments = 12,
  label,
  redAt = 0.83,
  orientation = "horizontal",
  className = "",
}: Props) {
  const clamped = Math.max(0, Math.min(1, value));
  const lit = Math.round(clamped * segments);

  const items = Array.from({ length: segments }, (_, i) => {
    const segRatio = (i + 1) / segments;
    const isLit = i < lit;
    let color: string;
    if (segRatio > redAt) color = "rec";
    else if (segRatio > 0.65) color = "amber";
    else color = "green";
    return { isLit, color };
  });

  const isVert = orientation === "vertical";

  return (
    <div
      className={`flex ${isVert ? "flex-col-reverse" : "flex-row"} items-center gap-1.5 ${className}`}
    >
      {label && !isVert && (
        <span className="studio-label text-white/55 mr-1">{label}</span>
      )}
      <div
        className={`flex ${isVert ? "flex-col-reverse" : "flex-row"} gap-[2px] rounded-md p-1 studio-faceplate-dark`}
      >
        {items.map((seg, i) => {
          const cls =
            seg.color === "rec"
              ? seg.isLit
                ? "led-on-rec"
                : "led-off"
              : seg.color === "amber"
              ? seg.isLit
                ? "led-on-amber"
                : "led-off"
              : seg.isLit
              ? "led-on-green"
              : "led-off";
          return (
            <span
              key={i}
              aria-hidden
              className={`block rounded-sm ${cls}`}
              style={
                isVert
                  ? { width: 16, height: 4 }
                  : { width: 6, height: 14 }
              }
            />
          );
        })}
      </div>
      {label && isVert && (
        <span className="studio-label text-white/55 mt-1">{label}</span>
      )}
    </div>
  );
}
