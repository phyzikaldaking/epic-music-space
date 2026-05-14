"use client";

import { useCallback, useState } from "react";

type UndoAction<T> = { id: string; label: string; before: T; after: T; createdAt: string };

export function useStudioUndoRedo<T>(current: T, apply: (value: T) => void, limit = 50) {
  const [undoStack, setUndoStack] = useState<UndoAction<T>[]>([]);
  const [redoStack, setRedoStack] = useState<UndoAction<T>[]>([]);

  const record = useCallback((label: string, before: T, after: T) => {
    setUndoStack((stack) => [{ id: `undo-${Date.now()}-${crypto.randomUUID()}`, label, before, after, createdAt: new Date().toISOString() }, ...stack].slice(0, limit));
    setRedoStack([]);
  }, [limit]);

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      const [next, ...rest] = stack;
      if (!next) return stack;
      apply(next.before);
      setRedoStack((redo) => [next, ...redo].slice(0, limit));
      return rest;
    });
  }, [apply, limit]);

  const redo = useCallback(() => {
    setRedoStack((stack) => {
      const [next, ...rest] = stack;
      if (!next) return stack;
      apply(next.after);
      setUndoStack((undoStack) => [next, ...undoStack].slice(0, limit));
      return rest;
    });
  }, [apply, limit]);

  return { record, undo, redo, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0, undoLabel: undoStack[0]?.label, redoLabel: redoStack[0]?.label, current };
}
