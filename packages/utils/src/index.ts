// @ems/utils — shared utility functions

/** Format USD amount: formatCurrency(4999) → "$49.99" */
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

/** Format a Decimal string from Prisma to a display price */
export function formatPrice(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

/** Clamp a number between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Truncate a string to maxLength chars with ellipsis */
export function truncate(str: string, maxLength: number): string {
  return str.length <= maxLength ? str : `${str.slice(0, maxLength - 3)}...`;
}

/** Calculate remaining license availability percentage */
export function availabilityPct(sold: number, total: number): number {
  if (total === 0) return 0;
  return Math.round(((total - sold) / total) * 100);
}
