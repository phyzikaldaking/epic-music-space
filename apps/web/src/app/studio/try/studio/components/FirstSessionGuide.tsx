"use client";

import type { FirstSessionStep } from "../workspace";

const copy: Record<FirstSessionStep, { title: string; body: string }> = {
  "choose-start": { title: "Start your session", body: "Choose a template, import audio, or record your first take." },
  "make-edit": { title: "Shape the idea", body: "Select a clip and make one safe edit—trim, split, fade, or move it." },
  "save-cloud": { title: "Protect the work", body: "Save once to create a durable cloud version of this session." },
  "finish-check": { title: "Get it release-ready", body: "Open Finish to check the mix and choose where it goes next." },
  complete: { title: "First session complete", body: "Your workflow is ready. This guide can stay out of the way now." },
};

export function FirstSessionGuide({ step, onDismiss }: { step: FirstSessionStep; onDismiss: () => void }) {
  const item = copy[step];
  return <aside className="studio-guide" aria-label="First session guide">
    <span>{step === "complete" ? "READY" : "NEXT MOVE"}</span>
    <div><strong>{item.title}</strong><p>{item.body}</p></div>
    <button type="button" onClick={onDismiss}>Dismiss</button>
  </aside>;
}
