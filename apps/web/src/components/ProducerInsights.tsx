import { prisma } from "@/lib/prisma";
import Link from "next/link";
import {
  RackPanel,
  LCDScreen,
  VUMeter,
  LevelLEDs,
} from "@/components/studio";

type Props = {
  artistId: string;
};

/**
 * Producer-facing control-room module. Funnel + earnings rendered as if
 * the dashboard is a piece of pro audio gear: VU meters for the funnel
 * stages, LCD readouts for raw counts, segmented LEDs for stalled-track
 * pressure. Sells the metaphor: this isn't a chart, it's the meter
 * bridge of a console.
 */
export default async function ProducerInsights({ artistId }: Props) {
  const songs = await prisma.song.findMany({
    where: { artistId },
    select: {
      id: true,
      title: true,
      viewCount: true,
      streamCount: true,
      soldLicenses: true,
      licensePrice: true,
      revenueSharePct: true,
      isDraft: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (songs.length === 0) return null;

  const totals = songs.reduce(
    (acc, s) => {
      acc.views += s.viewCount;
      acc.streams += s.streamCount;
      acc.licenses += s.soldLicenses;
      acc.gross += Number(s.licensePrice) * s.soldLicenses;
      return acc;
    },
    { views: 0, streams: 0, licenses: 0, gross: 0 },
  );

  // Funnel ratios → VU needle position. The needles read as a percentage
  // of the previous funnel stage, capped at 1.0 for full deflection.
  const viewToPlay =
    totals.views > 0 ? Math.min(1, totals.streams / totals.views) : 0;
  const playToLicense =
    totals.streams > 0 ? Math.min(1, totals.licenses / totals.streams) : 0;
  const overallConv =
    totals.views > 0 ? Math.min(1, totals.licenses / totals.views) : 0;

  // Top performer by gross. Falls back to most-viewed if no sales yet.
  const topByGross = [...songs]
    .filter((s) => !s.isDraft && s.soldLicenses > 0)
    .sort(
      (a, b) =>
        Number(b.licensePrice) * b.soldLicenses -
        Number(a.licensePrice) * a.soldLicenses,
    )[0];
  const topByViews = [...songs]
    .filter((s) => !s.isDraft)
    .sort((a, b) => b.viewCount - a.viewCount)[0];
  const headline = topByGross ?? topByViews ?? null;

  // Underperformers: published > 7 days, > 50 views, 0 licenses.
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const stalled = songs.filter(
    (s) =>
      !s.isDraft &&
      s.createdAt.getTime() < sevenDaysAgo &&
      s.viewCount >= 50 &&
      s.soldLicenses === 0,
  );
  const stalledRatio = Math.min(
    1,
    stalled.length / Math.max(1, songs.filter((s) => !s.isDraft).length),
  );

  return (
    <div className="mb-12">
      <RackPanel
        label="Track Performance"
        unit="MTR-01"
        led="amber"
        walnutSides
      >
        <div className="space-y-5">
          {/* Top row: three big LCD readouts. The studio-equivalent of
              giant 7-segment meters above the console. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <LCDScreen
              label="Views"
              value={fmtBig(totals.views)}
              subValue="track pages"
              size="lg"
            />
            <LCDScreen
              label="Plays"
              value={fmtBig(totals.streams)}
              subValue="stream starts"
              size="lg"
            />
            <LCDScreen
              label="Licenses"
              value={fmtBig(totals.licenses)}
              subValue="lifetime"
              size="lg"
              tone="cyan"
            />
            <LCDScreen
              label="Gross"
              value={`$${totals.gross.toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}`}
              subValue="lifetime"
              size="lg"
              tone="cyan"
            />
          </div>

          {/* Meter bridge. Three VUs side-by-side: view→play, play→license,
              overall conversion. Above the meters: a "FUNNEL" header and
              the panel feels like a real meter strip. */}
          <div className="rounded-lg studio-faceplate-dark p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="studio-label text-white/55">Conversion bridge</p>
              <span className="studio-label text-white/35">
                STAGE → STAGE %
              </span>
            </div>
            <div className="grid grid-cols-3 items-end gap-3">
              <div className="flex flex-col items-center gap-1.5">
                <VUMeter
                  value={viewToPlay}
                  label="View → Play"
                  readout={`${(viewToPlay * 100).toFixed(1)}%`}
                />
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <VUMeter
                  value={playToLicense}
                  label="Play → Sale"
                  readout={`${(playToLicense * 100).toFixed(2)}%`}
                />
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <VUMeter
                  value={overallConv}
                  label="View → Sale"
                  readout={`${(overallConv * 100).toFixed(2)}%`}
                />
              </div>
            </div>
          </div>

          {/* Headline + stalled. Two side-by-side panels, like the
              "SELECTED CHANNEL" + "ALERTS" sections of a console. */}
          <div className="grid gap-3 md:grid-cols-2">
            {headline && (
              <div className="rounded-lg studio-faceplate-dark p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="studio-label text-white/55">Top performer</p>
                  <span aria-hidden className="led-on-green h-2 w-2 rounded-full" />
                </div>
                <p className="font-display text-2xl uppercase tracking-wide text-white/95 truncate">
                  {headline.title}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <LCDScreen
                    label="Views"
                    value={fmtBig(headline.viewCount)}
                    size="sm"
                  />
                  <LCDScreen
                    label="Plays"
                    value={fmtBig(headline.streamCount)}
                    size="sm"
                  />
                  <LCDScreen
                    label="Sold"
                    value={headline.soldLicenses}
                    size="sm"
                    tone="cyan"
                  />
                </div>
              </div>
            )}

            {stalled.length > 0 ? (
              <div className="rounded-lg studio-faceplate-dark p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="studio-label text-white/55">Stalled tracks</p>
                  <span aria-hidden className="led-on-rec h-2 w-2 rounded-full" />
                </div>
                <p className="font-display text-2xl uppercase tracking-wide text-rec-400">
                  {stalled.length} track{stalled.length !== 1 ? "s" : ""}
                </p>
                <p className="mt-1 text-xs text-white/55">
                  high views, no sales — try a price drop, premium tier, or
                  fresh cover.
                </p>
                <div className="mt-3">
                  <LevelLEDs
                    value={stalledRatio}
                    label="Pressure"
                    redAt={0.5}
                  />
                </div>
                <Link
                  href="/studio/manage?filter=stalled"
                  className="mt-3 inline-block studio-label text-tube-400 hover:text-tube-300"
                >
                  Open patch bay →
                </Link>
              </div>
            ) : (
              <div className="rounded-lg studio-faceplate-dark p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="studio-label text-white/55">Catalog status</p>
                  <span aria-hidden className="led-on-green h-2 w-2 rounded-full" />
                </div>
                <p className="font-display text-2xl uppercase tracking-wide text-white/95">
                  All tracks healthy
                </p>
                <p className="mt-1 text-xs text-white/55">
                  No stalled tracks (≥50 views, 0 sales after 7 days).
                </p>
                <div className="mt-3">
                  <LevelLEDs value={0.05} label="Pressure" redAt={0.5} />
                </div>
              </div>
            )}
          </div>
        </div>
      </RackPanel>
    </div>
  );
}

/** Compact number formatter for big counts: 1234 → "1.2K", 1_234_567 → "1.2M". */
function fmtBig(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
