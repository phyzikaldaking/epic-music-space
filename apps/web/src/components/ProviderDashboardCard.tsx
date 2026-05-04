import Link from "next/link";

interface Props {
  role: "PRODUCER" | "ENGINEER" | "LABEL" | "ARTIST" | "ADMIN" | "LISTENER";
  listingsCount: number;
  ordersInProgress: number;
  ordersDelivered: number;
  grossLifetime: number;
}

const ROLE_COPY: Record<
  Props["role"],
  { title: string; sub: string; ctaLabel: string; ctaHref: string }
> = {
  PRODUCER: {
    title: "Your producer storefront",
    sub: "Beats, templates, and sample packs — instant download after checkout.",
    ctaLabel: "List a beat or template",
    ctaHref: "/services/new",
  },
  ENGINEER: {
    title: "Your engineering services",
    sub: "Mix, master, and lesson bookings — paid up front, delivered on schedule.",
    ctaLabel: "List a service",
    ctaHref: "/services/new",
  },
  LABEL: {
    title: "Your label catalog",
    sub: "Manage roster artists and labelled releases.",
    ctaLabel: "Manage label",
    ctaHref: "/label/new",
  },
  // Fallbacks (shouldn't render — caller filters first):
  ARTIST: { title: "", sub: "", ctaLabel: "", ctaHref: "" },
  ADMIN: { title: "", sub: "", ctaLabel: "", ctaHref: "" },
  LISTENER: { title: "", sub: "", ctaLabel: "", ctaHref: "" },
};

export default function ProviderDashboardCard({
  role,
  listingsCount,
  ordersInProgress,
  ordersDelivered,
  grossLifetime,
}: Props) {
  const copy = ROLE_COPY[role];
  if (!copy.title) return null;

  return (
    <section className="mb-8 rounded-2xl border border-orange-500/25 bg-orange-500/4 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-300">
            {copy.title}
          </p>
          <p className="mt-1 text-sm text-white/55">{copy.sub}</p>
        </div>
        <Link
          href={copy.ctaHref}
          className="flex-shrink-0 rounded-xl bg-orange-500/20 border border-orange-500/40 px-4 py-2 text-sm font-bold text-orange-300 hover:bg-orange-500/30"
        >
          {copy.ctaLabel} →
        </Link>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Active listings" value={listingsCount.toString()} />
        <Stat label="Orders in progress" value={ordersInProgress.toString()} />
        <Stat label="Orders delivered" value={ordersDelivered.toString()} />
        <Stat label="Lifetime gross" value={`$${grossLifetime.toFixed(2)}`} />
      </div>

      {listingsCount === 0 && (
        <p className="mt-4 rounded-lg border border-white/8 bg-white/4 px-3 py-2 text-xs text-white/55">
          No listings yet. Your first listing typically takes ~5 minutes — pick a
          deliverable, set a price, add a sample.
        </p>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/3 p-3">
      <p className="text-[10px] uppercase tracking-widest text-white/40">{label}</p>
      <p className="mt-1 text-lg font-extrabold tabular-nums">{value}</p>
    </div>
  );
}
