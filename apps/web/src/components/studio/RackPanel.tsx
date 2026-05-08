import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Stenciled label across the top edge of the panel — the "MASTER", "INPUT", etc. */
  label?: string;
  /** Tiny secondary label sitting next to the main one — e.g. unit number "01". */
  unit?: string;
  /** Walnut side caps on the left/right — for hero panels that should read as a piece of pro gear. */
  walnutSides?: boolean;
  /** Show decorative hex screws in the corners. Default true. */
  screws?: boolean;
  /** "dark" variant uses the recessed sub-panel surface for nested cards. */
  tone?: "default" | "dark";
  /** Tiny "ON" LED next to the label — set color, or `null` to hide. */
  led?: "amber" | "rec" | "green" | null;
  className?: string;
};

/**
 * The universal panel container. A piece of brushed-steel rack-mount
 * gear: stenciled label across the top, optional walnut side-caps,
 * decorative screws in the corners, illuminated LED. Replaces every
 * ad-hoc `glass-card` / `bg-[#141414] border` combo across the app.
 */
export default function RackPanel({
  children,
  label,
  unit,
  walnutSides = false,
  screws = true,
  tone = "default",
  led = null,
  className = "",
}: Props) {
  const surface =
    tone === "dark" ? "studio-faceplate-dark" : "studio-faceplate";

  return (
    <section
      className={`relative rounded-xl ${surface} ${className}`}
      data-rack-panel=""
    >
      {/* Walnut side caps (optional). Decorative — give the panel the
          stamped-gear silhouette without committing to a real image. */}
      {walnutSides && (
        <>
          <div
            aria-hidden
            className="studio-walnut absolute left-0 top-0 bottom-0 w-3 rounded-l-xl"
          />
          <div
            aria-hidden
            className="studio-walnut absolute right-0 top-0 bottom-0 w-3 rounded-r-xl"
          />
        </>
      )}

      {/* Corner screws — pure decoration. Skipped on dark/nested panels
          so we don't make a screw garden. */}
      {screws && tone === "default" && (
        <>
          <span aria-hidden className="studio-screw absolute left-2 top-2" />
          <span aria-hidden className="studio-screw absolute right-2 top-2" />
          <span aria-hidden className="studio-screw absolute left-2 bottom-2" />
          <span aria-hidden className="studio-screw absolute right-2 bottom-2" />
        </>
      )}

      {label && (
        <header
          className={`flex items-center gap-2 px-5 pt-4 pb-3 ${
            walnutSides ? "ml-3 mr-3" : ""
          }`}
        >
          {led && (
            <span
              aria-hidden
              className={`h-2 w-2 flex-shrink-0 rounded-full led-on-${led}`}
            />
          )}
          <h2 className="studio-label-lg text-white/85">{label}</h2>
          {unit && (
            <span className="studio-label ml-auto text-white/40">{unit}</span>
          )}
        </header>
      )}

      <div className={`px-5 pb-5 ${label ? "" : "pt-5"} ${walnutSides ? "ml-3 mr-3" : ""}`}>
        {children}
      </div>
    </section>
  );
}
