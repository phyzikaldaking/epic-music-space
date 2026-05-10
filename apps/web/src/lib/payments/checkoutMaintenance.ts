import { NextResponse } from "next/server";

const MAINTENANCE_ENV_KEYS = [
  "CHECKOUT_MAINTENANCE_MODE",
  "STRIPE_CHECKOUT_MAINTENANCE_MODE",
] as const;

function readFlag(key: string): string {
  return (process.env[key] ?? "").trim().toLowerCase();
}

export function isCheckoutMaintenanceModeEnabled(): boolean {
  return MAINTENANCE_ENV_KEYS.some((key) => {
    const value = readFlag(key);
    return value === "1" || value === "true" || value === "on" || value === "yes";
  });
}

export function checkoutMaintenanceMessage(): string {
  return (
    process.env.CHECKOUT_MAINTENANCE_MESSAGE ??
    "Checkout is temporarily paused while payments are being secured. Please try again shortly."
  );
}

export function checkoutMaintenanceResponse() {
  return NextResponse.json(
    {
      error: "Checkout temporarily unavailable",
      message: checkoutMaintenanceMessage(),
      code: "CHECKOUT_MAINTENANCE",
    },
    { status: 503, headers: { "Retry-After": "300" } },
  );
}

