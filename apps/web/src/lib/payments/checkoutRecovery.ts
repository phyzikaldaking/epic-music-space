export type CheckoutRecoveryIntent = {
  songId: string;
  amountUsd: number;
  mode: "fixed" | "pwyw" | "tier";
  tierId?: string;
  tierName?: string;
  startedAt: string;
  source: string;
};

const STORAGE_KEY = "ems.checkout.recovery.v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function isBrowser() {
  return typeof window !== "undefined";
}

export function saveCheckoutRecoveryIntent(intent: Omit<CheckoutRecoveryIntent, "startedAt">) {
  if (!isBrowser()) return;
  try {
    const payload: CheckoutRecoveryIntent = { ...intent, startedAt: new Date().toISOString() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // best effort only
  }
}

export function loadCheckoutRecoveryIntent(): CheckoutRecoveryIntent | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CheckoutRecoveryIntent> | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (
      typeof parsed.songId !== "string" ||
      typeof parsed.amountUsd !== "number" ||
      typeof parsed.mode !== "string" ||
      typeof parsed.startedAt !== "string" ||
      typeof parsed.source !== "string"
    ) {
      return null;
    }
    const startedAt = new Date(parsed.startedAt).getTime();
    if (!Number.isFinite(startedAt) || Date.now() - startedAt > MAX_AGE_MS) {
      clearCheckoutRecoveryIntent();
      return null;
    }
    return parsed as CheckoutRecoveryIntent;
  } catch {
    return null;
  }
}

export function clearCheckoutRecoveryIntent() {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // best effort only
  }
}

