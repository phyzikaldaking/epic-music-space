"use client";

import type { StudioExperienceMode } from "../types";

export function StudioModeSwitch({ value, onChange }: { value: StudioExperienceMode; onChange: (value: StudioExperienceMode) => void }) {
  return <div className="studio-experience" aria-label="Studio experience mode">
    <button type="button" onClick={() => onChange("creator")} aria-pressed={value === "creator"} className={value === "creator" ? "is-active" : ""}>Creator</button>
    <button type="button" onClick={() => onChange("engineer")} aria-pressed={value === "engineer"} className={value === "engineer" ? "is-active" : ""}>Engineer</button>
  </div>;
}
