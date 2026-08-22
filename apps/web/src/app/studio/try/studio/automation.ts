export type AutomationTarget = "volume" | "pan" | "send" | "effect" | "bypass" | "instrument";
export type AutomationLane = { id: string; target: AutomationTarget; parameterId: string; points: Array<{ frame: number; value: number }> };

export function createAutomationLane(input: Omit<AutomationLane, "points">): AutomationLane {
  return { ...input, points: [] };
}

export function writeAutomationPoint(lane: AutomationLane, point: { frame: number; value: number }) {
  const normalized = { frame: Math.max(0, Math.round(point.frame)), value: point.value };
  return { ...lane, points: [...lane.points.filter((item) => item.frame !== normalized.frame), normalized].sort((left, right) => left.frame - right.frame) };
}

export function evaluateAutomation(lane: AutomationLane, frame: number) {
  if (!lane.points.length) return 0;
  const before = [...lane.points].reverse().find((point) => point.frame <= frame) ?? lane.points[0];
  const after = lane.points.find((point) => point.frame > frame);
  if (!after || lane.target === "bypass") return before.value;
  const position = (frame - before.frame) / Math.max(1, after.frame - before.frame);
  return before.value + (after.value - before.value) * position;
}
