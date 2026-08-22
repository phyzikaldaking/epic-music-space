"use client";

import { getEmptyStudioActions } from "../presentation";
import { StudioIcon } from "./StudioIcon";

export function StudioEmptyState({ importFiles, onRecord, onBeat }: { importFiles: (files: FileList) => void; onRecord: () => void; onBeat: () => void }) {
  const actions = getEmptyStudioActions();
  return <div className="studio-empty">
    <div className="studio-empty__art" aria-hidden="true"><span className="studio-empty__orb studio-empty__orb--one"/><span className="studio-empty__orb studio-empty__orb--two"/><div className="studio-empty__console"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div><div className="studio-empty__wave">{Array.from({ length: 42 }, (_, index) => <i key={index} style={{ height: `${16 + ((index * 31) % 70)}%` }} />)}</div></div>
    <div className="studio-empty__copy"><span className="studio-kicker"><StudioIcon name="spark"/> YOUR SOUND STARTS HERE</span><h2>Turn the room<br/>into a record.</h2><p>Drop in stems, capture a live take, or build the beat from zero. Your session saves to the cloud while you create.</p>
      <div className="studio-empty__actions">
        <label className="studio-empty__primary"><StudioIcon name="import"/><span><b>{actions[0].label}</b><small>{actions[0].detail}</small></span><input type="file" accept="audio/*,.wav,.wave,.mp3,.m4a,.aac,.ogg,.oga,.webm,.flac,.aif,.aiff,.mp4" multiple className="sr-only" onChange={(event) => event.target.files && importFiles(event.target.files)} /></label>
        <button onClick={onRecord}><StudioIcon name="record"/><span><b>{actions[1].label}</b><small>{actions[1].detail}</small></span></button>
        <button onClick={onBeat}><StudioIcon name="beat"/><span><b>{actions[2].label}</b><small>{actions[2].detail}</small></span></button>
      </div>
      <div className="studio-empty__formats"><span>48K / 24-BIT READY</span><span>AUTOSAVE ON</span><span>WAV · MP3 · M4A · FLAC</span></div>
    </div>
  </div>;
}
