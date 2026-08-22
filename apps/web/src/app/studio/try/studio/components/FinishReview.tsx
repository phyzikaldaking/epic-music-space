"use client";

import { useMemo, useState } from "react";
import { buildStudioHandoff, getDestinationPath, validateStudioFinish, type StudioHandoffDestination } from "../finish";

type Props = {
  project: { id: string; title: string; updatedAt: string; tracks: number };
  missingMedia: number;
  clipping: boolean;
  saved: boolean;
  onDownload: () => void;
};

const destinations: Array<{ id: StudioHandoffDestination; label: string; description: string }> = [
  { id:"download", label:"Download", description:"Keep a local session archive" },
  { id:"publish", label:"Publish", description:"Prepare a public music release" },
  { id:"marketplace", label:"Marketplace", description:"Create a reviewed listing" },
  { id:"room", label:"Listening Room", description:"Bring this version into a live room" },
  { id:"battle", label:"Battle", description:"Challenge an artist with a locked excerpt" },
];

export function FinishReview({ project, missingMedia, clipping, saved, onDownload }: Props) {
  const [destination, setDestination] = useState<StudioHandoffDestination>("download");
  const [excerptStart, setExcerptStart] = useState(0);
  const [excerptEnd, setExcerptEnd] = useState(60);
  const [format, setFormat] = useState<"wav" | "mp3">("wav");
  const [confirming, setConfirming] = useState(false);
  const validation = useMemo(() => validateStudioFinish({ missingMedia, clipping, saved, title:project.title }), [clipping, missingMedia, project.title, saved]);

  function continueToDestination() {
    if (!confirming || !validation.ready) return;
    if (destination === "download") return onDownload();
    const handoff = buildStudioHandoff(project, destination, { excerptStart, excerptEnd, format });
    sessionStorage.setItem("ems.studio.handoff.v1", JSON.stringify(handoff));
    window.location.assign(getDestinationPath(destination));
  }

  return <section className="finish-review">
    <div className="finish-review__head"><div><span>FINAL QUALITY GATE</span><h3>Review before delivery</h3></div><b className={validation.ready ? "is-ready" : "is-blocked"}>{validation.ready ? "READY" : "ACTION REQUIRED"}</b></div>
    {(validation.blocking.length > 0 || validation.warnings.length > 0) && <div className="finish-issues">{validation.blocking.map((issue) => <p key={issue.code} className="is-blocking"><b>BLOCKING</b>{issue.message}</p>)}{validation.warnings.map((issue) => <p key={issue.code}><b>CHECK</b>{issue.message}</p>)}</div>}
    <div className="finish-destinations">{destinations.map((item) => <button key={item.id} className={destination === item.id ? "is-active" : ""} onClick={() => { setDestination(item.id); setConfirming(false); }}><b>{item.label}</b><small>{item.description}</small></button>)}</div>
    {destination === "battle" && <div className="battle-handoff"><span>BATTLE EXCERPT</span><label>Start<input type="number" min="0" value={excerptStart} onChange={(event) => setExcerptStart(Math.max(0, Number(event.target.value)))} /></label><label>End<input type="number" min={excerptStart + 1} value={excerptEnd} onChange={(event) => setExcerptEnd(Math.max(excerptStart + 1, Number(event.target.value)))} /></label><label>Format<select value={format} onChange={(event) => setFormat(event.target.value as "wav" | "mp3")}><option value="wav">WAV</option><option value="mp3">MP3</option></select></label><p>Battle receives this saved version and excerpt—not a live link that changes with later edits.</p></div>}
    <label className="finish-confirm"><input type="checkbox" checked={confirming} onChange={(event) => setConfirming(event.target.checked)} /> I reviewed the destination, version, and warnings.</label>
    <button className="platinum-primary" disabled={!confirming || !validation.ready} onClick={continueToDestination}>Confirm {destinations.find((item) => item.id === destination)?.label}</button>
  </section>;
}
