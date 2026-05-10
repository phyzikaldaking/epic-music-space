"use client";

import { useState } from "react";

const STORAGE_KEY = "ems.recommendation.feedback.v1";

type Props = {
  songId: string;
};

function saveFeedback(songId: string, value: "more" | "less") {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const current = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    current[songId] = value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Local taste feedback is best-effort until the user signs in.
  }
}

export default function RecommendationFeedbackButtons({ songId }: Props) {
  const [choice, setChoice] = useState<"more" | "less" | null>(null);

  return (
    <div className="mt-2 grid grid-cols-2 gap-1.5">
      {[
        { value: "more" as const, label: "More like this" },
        { value: "less" as const, label: "Less like this" },
      ].map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setChoice(item.value);
            saveFeedback(songId, item.value);
          }}
          className={`rounded-md border px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] transition ${
            choice === item.value
              ? "border-accent-300/40 bg-accent-300/15 text-accent-100"
              : "border-white/10 bg-white/5 text-white/45 hover:text-white/70"
          }`}
        >
          {choice === item.value ? "Saved" : item.label}
        </button>
      ))}
    </div>
  );
}
