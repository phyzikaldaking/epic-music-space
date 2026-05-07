/**
 * Shapes + parsers for the cinematic /pro/[username] profile JSON columns.
 * The DB stores these as free-form JSON; we coerce + cap on read so a stale
 * or malformed row never crashes the page.
 */

export interface EngineerCredit {
  artist: string;
  title: string;
  role: string;
  year?: number | null;
  coverUrl?: string | null;
  spotifyUrl?: string | null;
  appleUrl?: string | null;
  isPlatinum?: boolean;
  isGold?: boolean;
  isGrammyNominated?: boolean;
  isGrammyWin?: boolean;
  isBillboardNumberOne?: boolean;
}

export type AccoladeKind =
  | "grammy-nomination"
  | "grammy-win"
  | "riaa-platinum"
  | "riaa-gold"
  | "billboard-no1"
  | "ama"
  | "bet"
  | "iheart"
  | "other";

export interface EngineerAccolade {
  title: string;
  year?: number | null;
  org?: string | null;
  kind: AccoladeKind;
}

export interface EngineerGear {
  console?: string | null;
  monitors?: string | null;
  daws?: string[];
  plugins?: string[];
  outboard?: string[];
  roomTreatment?: string | null;
}

const MAX_CREDITS = 50;
const MAX_ACCOLADES = 30;
const MAX_GEAR_LIST = 30;

const isObj = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

const str = (v: unknown, max = 200): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
};

const num = (v: unknown): number | null => {
  if (typeof v !== "number") return null;
  if (!Number.isFinite(v)) return null;
  return Math.floor(v);
};

const bool = (v: unknown): boolean => v === true;

const ACCOLADE_KINDS: AccoladeKind[] = [
  "grammy-nomination",
  "grammy-win",
  "riaa-platinum",
  "riaa-gold",
  "billboard-no1",
  "ama",
  "bet",
  "iheart",
  "other",
];

export function parseCredits(raw: unknown): EngineerCredit[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isObj)
    .flatMap((r) => {
      const artist = str(r.artist, 120);
      const title = str(r.title, 200);
      const role = str(r.role, 80);
      if (!artist || !title) return [];
      const credit = {
        artist,
        title,
        role: role ?? "Engineer",
        year: num(r.year),
        coverUrl: str(r.coverUrl, 800),
        spotifyUrl: str(r.spotifyUrl, 400),
        appleUrl: str(r.appleUrl, 400),
        isPlatinum: bool(r.isPlatinum),
        isGold: bool(r.isGold),
        isGrammyNominated: bool(r.isGrammyNominated),
        isGrammyWin: bool(r.isGrammyWin),
        isBillboardNumberOne: bool(r.isBillboardNumberOne),
      } satisfies EngineerCredit;
      return [credit];
    })
    .slice(0, MAX_CREDITS);
}

export function parseAccolades(raw: unknown): EngineerAccolade[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isObj)
    .flatMap((r) => {
      const title = str(r.title, 200);
      if (!title) return [];
      const kindRaw = typeof r.kind === "string" ? r.kind : "other";
      const kind = (ACCOLADE_KINDS as string[]).includes(kindRaw)
        ? (kindRaw as AccoladeKind)
        : "other";
      const accolade = {
        title,
        year: num(r.year),
        org: str(r.org, 80),
        kind,
      } satisfies EngineerAccolade;
      return [accolade];
    })
    .slice(0, MAX_ACCOLADES);
}

export function parseGear(raw: unknown): EngineerGear {
  if (!isObj(raw)) return {};
  const list = (key: string): string[] => {
    const v = raw[key];
    if (!Array.isArray(v)) return [];
    return v
      .map((x) => str(x, 80))
      .filter((x): x is string => Boolean(x))
      .slice(0, MAX_GEAR_LIST);
  };
  return {
    console: str(raw.console, 80),
    monitors: str(raw.monitors, 80),
    daws: list("daws"),
    plugins: list("plugins"),
    outboard: list("outboard"),
    roomTreatment: str(raw.roomTreatment, 200),
  };
}

export const ACCOLADE_BADGE: Record<AccoladeKind, { label: string; emoji: string; tint: string }> = {
  "grammy-win":        { label: "Grammy Win",        emoji: "🏆", tint: "from-amber-400/30 to-yellow-500/10 border-amber-400/40 text-amber-200" },
  "grammy-nomination": { label: "Grammy Nominated",  emoji: "🎼", tint: "from-amber-300/20 to-yellow-500/5 border-amber-300/30 text-amber-100" },
  "riaa-platinum":     { label: "RIAA Platinum",     emoji: "💿", tint: "from-slate-200/20 to-slate-400/5 border-slate-200/30 text-slate-100" },
  "riaa-gold":         { label: "RIAA Gold",         emoji: "🥇", tint: "from-yellow-500/25 to-amber-700/5 border-yellow-500/30 text-yellow-100" },
  "billboard-no1":     { label: "Billboard #1",      emoji: "📈", tint: "from-rose-400/20 to-fuchsia-600/5 border-rose-400/30 text-rose-100" },
  "ama":               { label: "AMA",               emoji: "🎤", tint: "from-violet-400/20 to-indigo-600/5 border-violet-400/30 text-violet-100" },
  "bet":               { label: "BET Award",         emoji: "🎬", tint: "from-emerald-400/20 to-teal-600/5 border-emerald-400/30 text-emerald-100" },
  "iheart":            { label: "iHeart Award",      emoji: "📻", tint: "from-sky-400/20 to-cyan-600/5 border-sky-400/30 text-sky-100" },
  "other":             { label: "Award",             emoji: "✨", tint: "from-white/10 to-white/3 border-white/15 text-white/85" },
};
