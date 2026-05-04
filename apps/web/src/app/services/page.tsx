import Link from "next/link";
import Image from "next/image";
import type { ServiceListingKind } from "@ems/db";
import { prisma } from "@/lib/prisma";
import { SERVICE_KIND_META } from "@/lib/serviceListings";

export const revalidate = 60;

export const metadata = {
  title: "Services & Beats | Epic Music Space",
  description: "Mixing, mastering, project templates, beats, and sample packs from working engineers and producers.",
};

const TABS: { value: "all" | ServiceListingKind | "engineer" | "producer"; label: string }[] = [
  { value: "all",      label: "All" },
  { value: "engineer", label: "Engineering" },
  { value: "producer", label: "Producer goods" },
  { value: "MIX",      label: "Mix" },
  { value: "MASTER",   label: "Master" },
  { value: "BEAT",     label: "Beats" },
  { value: "PRODUCER_TEMPLATE", label: "Templates" },
  { value: "DRUM_KIT",   label: "Drum kits" },
  { value: "SAMPLE_PACK",label: "Sample packs" },
  { value: "LESSON",     label: "Lessons" },
];

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = "all" } = await searchParams;

  const kindFilter: ServiceListingKind[] | undefined =
    tab === "all"
      ? undefined
      : tab === "engineer"
        ? (Object.keys(SERVICE_KIND_META) as ServiceListingKind[]).filter(
            (k) => SERVICE_KIND_META[k].category === "engineer",
          )
        : tab === "producer"
          ? (Object.keys(SERVICE_KIND_META) as ServiceListingKind[]).filter(
              (k) => SERVICE_KIND_META[k].category === "producer",
            )
          : Object.keys(SERVICE_KIND_META).includes(tab)
            ? [tab as ServiceListingKind]
            : undefined;

  const listings = await prisma.serviceListing.findMany({
    where: {
      status: "LIVE",
      ...(kindFilter ? { kind: { in: kindFilter } } : {}),
    },
    orderBy: [{ totalSold: "desc" }, { createdAt: "desc" }],
    take: 60,
    include: {
      provider: { select: { id: true, name: true, image: true, username: true, role: true } },
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-widest text-brand-300">Services &amp; Beats</p>
          <h1 className="text-3xl font-extrabold">Hire the people behind the records</h1>
          <p className="mt-1 max-w-xl text-sm text-white/55">
            Mixing engineers, mastering engineers, producers selling beats and
            templates, and lessons from working pros. Pay through Stripe, get
            delivered or downloaded the same day.
          </p>
        </div>
        <Link
          href="/services/new"
          className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-600"
        >
          + List a service
        </Link>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={t.value === "all" ? "/services" : `/services?tab=${t.value}`}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
              tab === t.value
                ? "border-brand-500/60 bg-brand-500/15 text-brand-300"
                : "border-white/10 bg-white/3 text-white/55 hover:border-white/25 hover:text-white"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {listings.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-white/3 px-5 py-16 text-center">
          <p className="text-5xl">🎚️</p>
          <h2 className="mt-4 text-lg font-bold">No listings here yet</h2>
          <p className="mt-2 text-sm text-white/45">
            Are you an engineer or producer? <Link href="/services/new" className="text-brand-300 hover:underline">List your service →</Link>
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((s) => {
            const meta = SERVICE_KIND_META[s.kind];
            return (
              <Link
                key={s.id}
                href={`/services/${s.id}`}
                className="flex flex-col gap-3 rounded-2xl border border-white/8 bg-[#0d0d14] p-4 transition hover:border-brand-500/40 hover:bg-brand-500/4"
              >
                <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-gradient-to-br from-brand-900/40 to-accent-900/20">
                  {s.coverUrl ? (
                    <Image src={s.coverUrl} alt={s.title} fill sizes="(max-width: 1024px) 100vw, 33vw" className="object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-5xl">{meta.badge}</div>
                  )}
                  <span className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white/70">
                    {meta.label}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative h-7 w-7 flex-shrink-0 overflow-hidden rounded-full bg-white/10">
                    {s.provider.image ? (
                      <Image src={s.provider.image} alt={s.provider.name ?? ""} fill sizes="28px" className="object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-bold">
                        {(s.provider.name ?? "?")[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <p className="truncate text-xs text-white/55">
                    {s.provider.name ?? s.provider.username ?? "Pro"}
                    <span className="ml-1.5 rounded bg-white/8 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-white/45">
                      {s.provider.role.toLowerCase()}
                    </span>
                  </p>
                </div>
                <h3 className="line-clamp-2 text-sm font-bold">{s.title}</h3>
                <div className="mt-auto flex items-center justify-between text-xs">
                  <span className="text-white/40">
                    {meta.isInstant ? "Instant download" : `${s.deliveryDays}d delivery`}
                  </span>
                  <span className="font-bold text-brand-300">
                    ${Number(s.priceUsd).toFixed(2)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
