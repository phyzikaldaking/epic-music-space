import Link from "next/link";
import {
  artistEpkHref,
  artistMetaverseHref,
  artistMyspaceHref,
  artistProfileHref,
} from "@/lib/artistRoutes";
import { EMS_RELATIONSHIP_COPY } from "@/lib/emsRelationships";

type ArtistWorldDashboardCardProps = {
  handle?: string | null;
};

export default function ArtistWorldDashboardCard({ handle }: ArtistWorldDashboardCardProps) {
  return (
    <section className="mb-8 rounded-[28px] border border-fuchsia-300/25 bg-fuchsia-300/10 p-6">
      <p className="text-xs font-black uppercase tracking-[0.24em] text-fuchsia-200">
        Stakeholder Access
      </p>
      <h2 className="mt-3 text-2xl font-black text-white">
        Your artist world is live
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
        {EMS_RELATIONSHIP_COPY.stakeholderAccessDescription}
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href={artistProfileHref(handle)}
          className="rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-black text-black transition hover:-translate-y-0.5"
        >
          Artist Profile
          <span className="mt-1 block text-xs font-semibold text-black/55">Public EMS home base</span>
        </Link>
        <Link
          href={artistEpkHref(handle)}
          className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-white/8"
        >
          EPK
          <span className="mt-1 block text-xs font-semibold text-white/45">Press-ready profile</span>
        </Link>
        <Link
          href={artistMyspaceHref(handle)}
          className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-white/8"
        >
          MySpace
          <span className="mt-1 block text-xs font-semibold text-white/45">Wall, media, and music</span>
        </Link>
        <Link
          href={artistMetaverseHref(handle)}
          className="rounded-2xl border border-fuchsia-300/35 bg-fuchsia-300/10 px-4 py-3 text-sm font-bold text-fuchsia-100 transition hover:-translate-y-0.5 hover:bg-fuchsia-300/15"
        >
          Metaverse
          <span className="mt-1 block text-xs font-semibold text-fuchsia-100/55">Immersive artist world</span>
        </Link>
      </div>

      <p className="mt-4 text-xs leading-5 text-white/42">
        On Epic Music Space, Stakeholders are VIP supporters with exclusive access. This does not mean equity ownership or a financial security.
      </p>
    </section>
  );
}
