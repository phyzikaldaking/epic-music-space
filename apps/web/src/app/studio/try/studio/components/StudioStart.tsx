"use client";

import type { StudioExperienceMode, StudioTemplateId } from "../types";
import { StudioIcon } from "./StudioIcon";

const templates: Array<{ id: StudioTemplateId; label: string; detail: string; glyph: string }> = [
  { id: "vocal", label: "Vocal Session", detail: "Lead, double, instrumental", glyph: "VOX" },
  { id: "beat", label: "Beat Making", detail: "Drums, bass, music", glyph: "808" },
  { id: "podcast", label: "Podcast", detail: "Host, guest, music bed", glyph: "MIC" },
  { id: "stems", label: "Mix Stems", detail: "Organized mix foundation", glyph: "MIX" },
  { id: "mastering", label: "Mastering", detail: "Premaster and finish check", glyph: "MST" },
  { id: "empty", label: "Empty Session", detail: "Build the room yourself", glyph: "+" },
];

export function StudioStart({ experience, onTemplate, onImport, onRecord, onBeat }: { experience: StudioExperienceMode; onTemplate: (id: StudioTemplateId) => void; onImport: (files: FileList) => void; onRecord: () => void; onBeat: () => void }) {
  return <div className="studio-start">
    <section className="studio-start__hero">
      <span className="studio-kicker"><StudioIcon name="spark"/> YOUR SOUND STARTS HERE</span>
      <h2>What are we making?</h2>
      <p>{experience === "creator" ? "Start with a room that already knows the job. You can switch to Engineer Mode anytime." : "Choose a routing-ready starting point or build an empty session."}</p>
      <div className="studio-start__actions">
        <label><StudioIcon name="import"/><span><b>Import Audio</b><small>WAV, MP3, stems or a full mix</small></span><input className="sr-only" type="file" accept="audio/*,.wav,.mp3,.m4a,.flac,.aiff" multiple onChange={(event) => event.target.files && onImport(event.target.files)}/></label>
        <button onClick={onRecord}><StudioIcon name="record"/><span><b>Record</b><small>Check your mic before the take</small></span></button>
        <button onClick={onBeat}><StudioIcon name="beat"/><span><b>Beat Lab</b><small>Build a rhythm from scratch</small></span></button>
      </div>
    </section>
    <section className="studio-start__templates" aria-label="Session templates">
      <div><span>SESSION TEMPLATES</span><p>Real tracks and settings. No fake audio.</p></div>
      <div className="studio-template-grid">{templates.map((item) => <button key={item.id} onClick={() => onTemplate(item.id)}><i>{item.glyph}</i><span><b>{item.label}</b><small>{item.detail}</small></span><em>→</em></button>)}</div>
    </section>
  </div>;
}
