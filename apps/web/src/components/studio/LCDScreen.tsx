import type { ReactNode } from "react";

type Props = {
  /** The big number / value displayed on the screen. */
  value: ReactNode;
  /** Tiny label above the value — "BPM", "PRICE", "PLAYS". */
  label?: string;
  /** Color of the phosphor — amber (default, warm), cyan (digital), or rec (red). */
  tone?: "amber" | "cyan" | "rec";
  /** Smaller secondary line under the value — units, deltas. */
  subValue?: ReactNode;
  /** How big the number should render. */
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

const SIZE_CLS: Record<NonNullable<Props["size"]>, string> = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-3xl md:text-4xl",
  xl: "text-4xl md:text-5xl",
};

/**
 * Recessed LCD/VFD-style readout. Use INSIDE a RackPanel for any
 * numerical value the device is "displaying" — track price, BPM,
 * play count, $$$ pending. Faint scanlines + phosphor glow sell the
 * idea that a real bit of hardware is showing this number.
 */
export default function LCDScreen({
  value,
  label,
  tone = "amber",
  subValue,
  size = "md",
  className = "",
}: Props) {
  const textCls =
    tone === "amber"
      ? "text-readout-amber"
      : tone === "cyan"
      ? "text-readout-cyan"
      : "text-readout-rec";

  return (
    <div className={`studio-screen px-3 py-2 ${className}`}>
      {label && (
        <p className="studio-label mb-1 text-white/40 relative z-10">{label}</p>
      )}
      <p
        className={`relative z-10 font-bold tabular-nums ${SIZE_CLS[size]} ${textCls}`}
      >
        {value}
      </p>
      {subValue && (
        <p
          className={`relative z-10 mt-0.5 text-[11px] tabular-nums opacity-70 ${textCls}`}
        >
          {subValue}
        </p>
      )}
    </div>
  );
}
