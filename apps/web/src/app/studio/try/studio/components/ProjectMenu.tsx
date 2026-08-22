"use client";

export function ProjectMenu({ onNew, onSaveAs, onRestore, onSnapshot, onArchive }: { onNew: () => void; onSaveAs: () => void; onRestore: () => void; onSnapshot: () => void; onArchive: () => void }) {
  return <details className="studio-project-menu">
    <summary aria-label="Open Project menu">Project <span>⌄</span></summary>
    <div role="menu">
      <button role="menuitem" onClick={onNew}>New session</button>
      <button role="menuitem" onClick={onSaveAs}>Save as</button>
      <button role="menuitem" onClick={onRestore}>Restore cloud session</button>
      <button role="menuitem" onClick={onSnapshot}>Create snapshot</button>
      <button role="menuitem" onClick={onArchive}>Export archive</button>
      <a role="menuitem" href="/settings">Studio settings</a>
    </div>
  </details>;
}
