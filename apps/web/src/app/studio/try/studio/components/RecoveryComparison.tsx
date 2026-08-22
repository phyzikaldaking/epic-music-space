import type { StudioSavedSession } from "../types";

type Props = {
  local: StudioSavedSession;
  cloud: StudioSavedSession;
  onKeepLocal: () => void;
  onKeepCloud: () => void;
  onPreserveBoth: () => void;
};

export function RecoveryComparison({ local, cloud, onKeepLocal, onKeepCloud, onPreserveBoth }: Props) {
  return (
    <div className="studio-modal" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
      <section className="studio-modal__panel recovery-panel">
        <span className="studio-start__eyebrow">RECOVERY FOUND</span>
        <h2 id="recovery-title">Choose the version to open</h2>
        <p>A local draft is newer than the cloud copy. Nothing will be discarded until you choose.</p>
        <div className="recovery-versions">
          <article><b>LOCAL DRAFT</b><strong>{local.title}</strong><time>{new Date(local.updatedAt).toLocaleString()}</time><small>{local.tracks.length} tracks</small></article>
          <article><b>CLOUD VERSION</b><strong>{cloud.title}</strong><time>{new Date(cloud.updatedAt).toLocaleString()}</time><small>{cloud.tracks.length} tracks</small></article>
        </div>
        <div className="preflight-actions">
          <button className="studio-secondary" onClick={onKeepCloud}>Open cloud</button>
          <button className="studio-secondary" onClick={onPreserveBoth}>Preserve both</button>
          <button className="studio-primary" onClick={onKeepLocal}>Recover local draft</button>
        </div>
      </section>
    </div>
  );
}
