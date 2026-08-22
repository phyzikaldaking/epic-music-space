export type ProjectHistoryEntry<T> = { label: string; state: T };
export type ProjectHistory<T> = { present: T; past: ProjectHistoryEntry<T>[]; future: ProjectHistoryEntry<T>[]; limit: number; lastLabel?: string };
export type ProjectCommand<T> = { label: string; apply: (state: T) => T };

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function createProjectHistory<T>(initial: T, limit = 80): ProjectHistory<T> {
  return { present: clone(initial), past: [], future: [], limit: Math.max(1, Math.round(limit)) };
}

export function executeProjectCommand<T>(history: ProjectHistory<T>, command: ProjectCommand<T>): ProjectHistory<T> {
  const before = clone(history.present);
  const after = command.apply(clone(history.present));
  return {
    ...history,
    present: clone(after),
    past: [...history.past, { label: command.label, state: before }].slice(-history.limit),
    future: [],
    lastLabel: command.label,
  };
}

export function undoProjectCommand<T>(history: ProjectHistory<T>): ProjectHistory<T> {
  const entry = history.past.at(-1);
  if (!entry) return history;
  return {
    ...history,
    present: clone(entry.state),
    past: history.past.slice(0, -1),
    future: [{ label: entry.label, state: clone(history.present) }, ...history.future].slice(0, history.limit),
    lastLabel: `Undo: ${entry.label}`,
  };
}

export function redoProjectCommand<T>(history: ProjectHistory<T>): ProjectHistory<T> {
  const [entry, ...future] = history.future;
  if (!entry) return history;
  return {
    ...history,
    present: clone(entry.state),
    past: [...history.past, { label: entry.label, state: clone(history.present) }].slice(-history.limit),
    future,
    lastLabel: `Redo: ${entry.label}`,
  };
}
