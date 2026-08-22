export type InputSignalStatus = "silent" | "healthy" | "clipping";
export type PreflightState = "idle" | "requesting-permission" | "permission-denied" | "checking" | "ready" | "warning";

export function classifyInputSignal(samples: Float32Array) {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const peakDb = peak === 0 ? -Infinity : 20 * Math.log10(peak);
  const status: InputSignalStatus = peak === 0 ? "silent" : peak >= .95 ? "clipping" : "healthy";
  return { status, peakDb };
}

export function nextPreflightState(state: PreflightState, action: "start" | "retry" | "deny" | "pass" | "warn"): PreflightState {
  if (action === "start" || action === "retry") return "requesting-permission";
  if (action === "deny") return "permission-denied";
  if (action === "pass") return "ready";
  if (action === "warn") return "warning";
  return state;
}

export type PreflightPermission = "unknown" | "prompt" | "granted" | "denied";
export type PreflightChecklistStatus = "pending" | "pass" | "warn" | "fail";

export function getPreflightChecklist(value: { supported: boolean; permission: PreflightPermission; signal: InputSignalStatus }) {
  return [
    { id: "browser" as const, label: "Browser audio", status: value.supported ? "pass" as const : "fail" as const },
    { id: "permission" as const, label: "Microphone permission", status: value.permission === "granted" ? "pass" as const : value.permission === "denied" ? "fail" as const : "pending" as const },
    { id: "signal" as const, label: "Input signal", status: value.permission !== "granted" ? "pending" as const : value.signal === "healthy" ? "pass" as const : value.signal === "clipping" ? "warn" as const : "fail" as const },
  ] satisfies Array<{ id: string; label: string; status: PreflightChecklistStatus }>;
}
