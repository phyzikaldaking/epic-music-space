export type ClipRevenueInput = {
  clipId: string;
  songId?: string | null;
  artistId?: string | null;
  creatorId?: string | null;
  grossRevenue: number;
  source: "ad" | "boost" | "tip" | "sponsor" | "placement" | "affiliate";
  platformFeePct?: number;
  artistSharePct?: number;
  creatorSharePct?: number;
  labelSharePct?: number;
};

export type ClipRevenueSplit = {
  clipId: string;
  source: ClipRevenueInput["source"];
  grossRevenue: number;
  platformFee: number;
  artistPayout: number;
  creatorPayout: number;
  labelPayout: number;
  reserve: number;
  netRevenue: number;
};

function money(value: number) {
  return Math.round(value * 100) / 100;
}

export function calculateClipRevenueSplit(input: ClipRevenueInput): ClipRevenueSplit {
  const gross = Math.max(0, Number(input.grossRevenue ?? 0));
  const platformFeePct = input.platformFeePct ?? 20;
  const artistSharePct = input.artistSharePct ?? 55;
  const creatorSharePct = input.creatorSharePct ?? 15;
  const labelSharePct = input.labelSharePct ?? 10;

  const platformFee = gross * (platformFeePct / 100);
  const net = gross - platformFee;

  const artistPayout = net * (artistSharePct / 100);
  const creatorPayout = net * (creatorSharePct / 100);
  const labelPayout = net * (labelSharePct / 100);
  const reserve = net - artistPayout - creatorPayout - labelPayout;

  return {
    clipId: input.clipId,
    source: input.source,
    grossRevenue: money(gross),
    platformFee: money(platformFee),
    artistPayout: money(artistPayout),
    creatorPayout: money(creatorPayout),
    labelPayout: money(labelPayout),
    reserve: money(Math.max(0, reserve)),
    netRevenue: money(net),
  };
}

export function getDefaultRevenueForEvent(source: ClipRevenueInput["source"], value?: number) {
  if (value != null) return value;
  switch (source) {
    case "tip":
      return 10;
    case "boost":
      return 25;
    case "placement":
      return 75;
    case "sponsor":
      return 150;
    case "affiliate":
      return 12;
    default:
      return 4.5;
  }
}

export function buildClipRevenueSummary(split: ClipRevenueSplit) {
  return {
    headline: `$${split.grossRevenue.toFixed(2)} generated from ${split.source}`,
    platform: `Platform retained $${split.platformFee.toFixed(2)}`,
    artist: `Artist earned $${split.artistPayout.toFixed(2)}`,
    creator: `Clip creator earned $${split.creatorPayout.toFixed(2)}`,
    label: `Label/publisher earned $${split.labelPayout.toFixed(2)}`,
  };
}
