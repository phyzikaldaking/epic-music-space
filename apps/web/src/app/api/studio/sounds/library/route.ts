import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { StudioSoundCategory } from "@/app/studio/try/studioWorkstationTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUDIO_BUCKET = "audio-assets";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function categoryForName(name: string): StudioSoundCategory {
  const n = name.toLowerCase();
  if (/(808|sub|bass)/.test(n)) return "808";
  if (/(kick|snare|clap|hihat|hi[-_ ]?hat|hat|openhat|perc|cymbal|crash)/.test(n)) return "drums";
  if (/(piano|keys|organ|electric piano|chord)/.test(n)) return "keys";
  if (/(synth|lead|pluck|pad|reese)/.test(n)) return "synth";
  if (/(guitar)/.test(n)) return "guitar";
  if (/(violin|violins|string|strings)/.test(n)) return "strings";
  if (/(horn|trumpet|brass)/.test(n)) return "brass";
  if (/(fx|riser|impact|tail|fill|transition)/.test(n)) return "fx";
  if (/(melody|sample|phrase|loop)/.test(n)) return "melody";
  return "misc";
}

function instrumentForCategory(category: StudioSoundCategory, name: string) {
  const n = name.toLowerCase();
  if (category === "808") return "808 Bass";
  if (category === "drums") {
    if (n.includes("kick")) return "Kick";
    if (n.includes("snare")) return "Snare";
    if (n.includes("clap")) return "Clap";
    if (n.includes("hat")) return "Hi-Hat";
    if (n.includes("cymbal") || n.includes("crash")) return "Cymbal";
    return "Drum One-Shot";
  }
  if (category === "keys") return n.includes("organ") ? "Organ" : "Piano / Keys";
  if (category === "synth") return n.includes("pad") ? "Synth Pad" : "Synth Lead";
  if (category === "guitar") return "Guitar";
  if (category === "strings") return "Strings";
  if (category === "brass") return n.includes("trumpet") ? "Trumpet" : "Brass";
  if (category === "fx") return "FX";
  return "Melodic One-Shot";
}

function parseBpm(name: string) {
  const match = name.match(/(?:^|[_\-\s])(\d{2,3})\s?bpm/i) ?? name.match(/(?:^|[_\-\s])(\d{2,3})(?:[_\-\s])/i);
  if (!match) return undefined;
  const bpm = Number(match[1]);
  return bpm >= 40 && bpm <= 240 ? bpm : undefined;
}

function parseKey(name: string) {
  const match = name.match(/(?:^|[_\-\s])([A-G](?:#|b)?\s?(?:maj|min|major|minor|m)?)(?:[_\-\s.]|$)/i);
  if (!match) return undefined;
  return match[1].replace(/\s+/g, "");
}

function publicSortRank(category: StudioSoundCategory) {
  const ranks: Record<StudioSoundCategory, number> = {
    drums: 0,
    "808": 1,
    keys: 2,
    synth: 3,
    guitar: 4,
    strings: 5,
    brass: 6,
    fx: 7,
    melody: 8,
    misc: 9,
  };
  return ranks[category] ?? 99;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const categoryFilter = url.searchParams.get("category");
  const limit = Math.min(250, Math.max(1, Number(url.searchParams.get("limit") ?? 120)));
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ sounds: [], categories: {}, backend: "none", error: "Supabase storage is not configured." }, { status: 503 });

  const { data, error } = await supabase.storage.from(AUDIO_BUCKET).list("", {
    limit: 1000,
    offset: 0,
    sortBy: { column: "created_at", order: "desc" },
  });

  if (error) return NextResponse.json({ sounds: [], categories: {}, backend: "none", error: error.message }, { status: 500 });

  const sounds = (data ?? [])
    .filter((item) => item.name && !item.name.endsWith("/"))
    .map((item) => {
      const category = categoryForName(item.name);
      const { data: publicUrl } = supabase.storage.from(AUDIO_BUCKET).getPublicUrl(item.name);
      return {
        id: `factory-${item.id ?? item.name}`,
        name: item.name,
        url: publicUrl.publicUrl,
        source: "factory" as const,
        category,
        instrument: instrumentForCategory(category, item.name),
        bpm: parseBpm(item.name),
        key: parseKey(item.name),
        size: typeof item.metadata?.size === "number" ? item.metadata.size : undefined,
        createdAt: item.created_at ?? new Date().toISOString(),
      };
    })
    .filter((sound) => !categoryFilter || sound.category === categoryFilter)
    .sort((a, b) => publicSortRank(a.category) - publicSortRank(b.category) || a.name.localeCompare(b.name))
    .slice(0, limit);

  const categories = sounds.reduce<Record<string, number>>((acc, sound) => {
    acc[sound.category] = (acc[sound.category] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({ sounds, categories, backend: "supabase", bucket: AUDIO_BUCKET });
}
