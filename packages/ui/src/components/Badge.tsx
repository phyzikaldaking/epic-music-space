import * as React from "react";

type District =
  | "DOWNTOWN_PRIME"
  | "PRODUCER_ALLEY"
  | "UNDERGROUND"
  | "VIP_TOWERS";

type BadgeVariant = "district" | "tier" | "status";

interface BadgeProps {
  children: React.ReactNode;
  district?: District;
  variant?: BadgeVariant;
  className?: string;
}

const districtStyles: Record<District, string> = {
  DOWNTOWN_PRIME: "bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/30",
  VIP_TOWERS: "bg-[#7B3FE4]/20 text-purple-300 border border-[#7B3FE4]/30",
  PRODUCER_ALLEY: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
  UNDERGROUND: "bg-gray-500/20 text-gray-300 border border-gray-500/30",
};

const districtLabels: Record<District, string> = {
  DOWNTOWN_PRIME: "Downtown Prime",
  VIP_TOWERS: "VIP Towers",
  PRODUCER_ALLEY: "Producer Alley",
  UNDERGROUND: "Underground",
};

export function Badge({
  children,
  district,
  variant = "tier",
  className = "",
}: BadgeProps) {
  const districtClass =
    district ? districtStyles[district] : "bg-gray-500/20 text-gray-300 border border-gray-500/30";

  return (
    <span
      className={[
        "inline-flex items-center text-xs font-semibold px-3 py-1 rounded-full",
        variant === "district" && district ? districtClass : "bg-[#13131A] border border-[#2A2A3A] text-[#F0F0F0]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {district && variant === "district" ? districtLabels[district] : children}
    </span>
  );
}
