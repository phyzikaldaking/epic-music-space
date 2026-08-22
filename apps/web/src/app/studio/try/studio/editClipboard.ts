export type StudioClipboardKind = "clip" | "track" | "automation" | "effect" | "section";
export type StudioClipboardItem = { kind: StudioClipboardKind; id: string; payload: Record<string, unknown> };
export type StudioClipboard = { version: 1; items: StudioClipboardItem[] };

function cloneItems(items: StudioClipboardItem[]) {
  return items.map((item) => ({ ...item, payload: structuredClone(item.payload) }));
}

export function copyStudioItems(items: StudioClipboardItem[]): StudioClipboard {
  return { version: 1, items: cloneItems(items) };
}

export function cutStudioItems(items: StudioClipboardItem[], selectedIds: ReadonlySet<string>) {
  const selected = items.filter((item) => selectedIds.has(item.id));
  return {
    label: "Cut studio items",
    before: items,
    after: items.filter((item) => !selectedIds.has(item.id)),
    undo: items,
    clipboard: copyStudioItems(selected),
  };
}

export function pasteStudioItems(clipboard: StudioClipboard, options: { idFactory: (kind: StudioClipboardKind) => string; frameOffset?: number }) {
  const offset = Math.round(options.frameOffset ?? 0);
  return cloneItems(clipboard.items).map((item) => {
    const startFrame = item.payload.startFrame;
    return {
      ...item,
      id: options.idFactory(item.kind),
      payload: typeof startFrame === "number" ? { ...item.payload, startFrame: Math.max(0, Math.round(startFrame) + offset) } : item.payload,
    };
  });
}

export function duplicateStudioItems(items: StudioClipboardItem[], options: { idFactory: (kind: StudioClipboardKind) => string; frameOffset?: number }) {
  return pasteStudioItems(copyStudioItems(items), options);
}
