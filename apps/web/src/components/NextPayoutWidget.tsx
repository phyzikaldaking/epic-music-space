/**
 * Server-rendered "next payout" widget for the artist dashboard.
 * Computes the next Monday 13:00 UTC (matches the cron schedule in vercel.json).
 */
function nextMonday1300UTC(now = new Date()): Date {
  const next = new Date(now);
  next.setUTCHours(13, 0, 0, 0);
  // 0 = Sunday, 1 = Monday
  const day = next.getUTCDay();
  const daysUntilMonday = day === 1 && now.getTime() < next.getTime() ? 0 : (8 - day) % 7 || 7;
  next.setUTCDate(next.getUTCDate() + daysUntilMonday);
  return next;
}

function formatRelative(d: Date): string {
  const diffMs = d.getTime() - Date.now();
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days} days`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function NextPayoutWidget({
  pendingDollars,
  payoutsReady,
}: {
  pendingDollars: number;
  payoutsReady: boolean;
}) {
  const next = nextMonday1300UTC();
  const dateStr = next.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const relative = formatRelative(next);

  return (
    <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/6 p-5">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">
        Next payout
      </p>
      <p className="mt-2 text-2xl font-extrabold tabular-nums">
        ${pendingDollars.toFixed(2)}
      </p>
      <p className="mt-1 text-xs text-white/55">
        {payoutsReady
          ? `Auto-paid ${dateStr} (${relative})`
          : "Connect Stripe to receive your first payout."}
      </p>
      <p className="mt-3 text-[10px] uppercase tracking-widest text-white/30">
        Payouts run every Monday at 13:00 UTC
      </p>
    </div>
  );
}
