import { DISTRICT_META } from "@/lib/scoring";
export default function DistrictBadge({ district, size = "md" }) {
    const meta = DISTRICT_META[district];
    const padding = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
    return (<span className={`inline-flex items-center gap-1 rounded-full font-medium ${padding} ${meta.bg} ${meta.color}`} title={meta.description}>
      {district === "LABEL_ROW" ? "👑" : district === "DOWNTOWN_PRIME" ? "⚡" : "🎵"}
      {meta.label}
    </span>);
}
