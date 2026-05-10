import Link from "next/link";
import type { ReactNode } from "react";

type DashboardStat = {
  label: string;
  value: string;
  tone?: "brand" | "accent" | "emerald" | "amber" | "rose" | "neutral";
};

type DashboardPageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
  aside?: ReactNode;
  stats?: DashboardStat[];
};

const TONE_STYLES: Record<NonNullable<DashboardStat["tone"]>, string> = {
  brand: "border-brand-500/30 bg-brand-500/10 text-brand-200",
  accent: "border-accent-500/30 bg-accent-500/10 text-accent-200",
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  rose: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  neutral: "border-white/10 bg-white/5 text-white/70",
};

export default function DashboardPageHeader({
  eyebrow,
  title,
  description,
  backHref = "/dashboard",
  backLabel = "Control Room",
  actions,
  aside,
  stats,
}: DashboardPageHeaderProps) {
  return (
    <section className="mb-8 rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(14,15,24,0.96),rgba(11,18,25,0.94)_45%,rgba(26,14,31,0.9))] p-6 shadow-2xl shadow-black/35 sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <Link
            href={backHref}
            className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-white/42 transition hover:text-tube-300"
          >
            {backLabel} {"->"}
          </Link>
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-200/75">
            {eyebrow}
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">
            {title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/62 sm:text-base">
            {description}
          </p>
          {stats && stats.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className={`rounded-xl border px-3 py-2 ${TONE_STYLES[stat.tone ?? "neutral"]}`}
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">
                    {stat.label}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-inherit">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          )}
          {actions && <div className="mt-5 flex flex-wrap gap-3">{actions}</div>}
        </div>

        {aside && <div className="lg:w-[380px]">{aside}</div>}
      </div>
    </section>
  );
}
