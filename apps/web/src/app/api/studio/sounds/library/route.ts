import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { StudioSoundCategory } from "@/app/studio/try/studioWorkstationTypes";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUDIO_BUCKETS = ["audio-assets", "studio-kits"] as const;
const AUDIO_EXTENSIONS = new Set(["aif", "aiff", "flac", "m4a", "mp3", "ogg", "wav", "webm"]);
const SIGNED_URL_TTL_SECONDS = 60 * 60;

type StorageSupabaseClient = ReturnType<typeof createClient>;

interface StorageObject {
  id?: string | null;
  name: string;
  created_at?: string | null;
  updated_at?: string | null;
  metadata?: {
    mimetype?: string;
    size?: number;
    duration?: number;
  } | null;
}

function getSupabaseAdmin(): StorageSupabaseClient | null {
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

function joinStoragePath(prefix: string, name: string) {
  return prefix ? `${prefix}/${name}` : name;
}

function isAudioObject(item: StorageObject) {
  const mimeType = item.metadata?.mimetype?.toLowerCase() ?? "";
  if (mimeType.startsWith("audio/")) return true;

  const extension = item.name.split(".").pop()?.toLowerCase();
  return extension ? AUDIO_EXTENSIONS.has(extension) : false;
}

function cleanDisplayName(path: string) {
  const leafName = path.split("/").pop() ?? path;
  return leafName
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function listAudioObjects(
  supabase: StorageSupabaseClient,
  bucket: string,
  _prefix = "",
  maxResults = 100000,
): Promise<Array<StorageObject & { path: string }>> {
  // Storage.list() is unreliable for this production project (it returns 400
  // even though the buckets and objects exist). Read the authoritative object
  // index through Supabase's storage schema instead.
  const { data, error } = await supabase
    .schema("storage")
    .from("objects")
    .select("id,name,created_at,updated_at,metadata")
    .eq("bucket_id", bucket)
    .order("created_at", { ascending: false })
    .range(0, Math.max(0, maxResults - 1));

  if (error) throw error;

  return ((data ?? []) as StorageObject[])
    .filter((item) => item.name && isAudioObject(item))
    .map((item) => ({ ...item, path: item.name }));
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ sounds: [], categories: {}, backend: "none", error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const categoryFilter = url.searchParams.get("category");
  const search = url.searchParams.get("q")?.trim().toLowerCase();
  const bucketFilter = url.searchParams.get("bucket");
  const sort = url.searchParams.get("sort") ?? "category";
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
  const cursor = Math.max(0, Number(url.searchParams.get("cursor") ?? 0));
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ sounds: [], categories: {}, backend: "none", error: "Supabase storage is not configured." }, { status: 503 });

  let data: Array<StorageObject & { path: string; bucket: string }>;
  try {
    const bucketResults = await Promise.all(AUDIO_BUCKETS
      .filter((bucket) => !bucketFilter || bucket === bucketFilter)
      .map(async (bucket) => {
        const objects = await listAudioObjects(supabase, bucket, "", 100000);
        return objects.map((item) => ({ ...item, bucket }));
      }));
    const seen = new Set<string>();
    data = bucketResults.flat().filter((item) => {
      const stableKey = item.id ? `${item.bucket}:${item.id}` : `${item.bucket}:${item.path}`;
      if (seen.has(stableKey)) return false;
      seen.add(stableKey);
      return true;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supabase storage list failed.";
    return NextResponse.json({ sounds: [], categories: {}, backend: "none", error: message }, { status: 500 });
  }

  const filtered = data.map((item) => {
    const category = categoryForName(item.path);
    return {
      id: `${item.bucket}:${item.id ?? item.path}`,
      name: cleanDisplayName(item.path),
      path: item.path,
      source: item.bucket === "studio-kits" ? "kit" as const : "factory" as const,
      bucket: item.bucket,
      category,
      instrument: instrumentForCategory(category, item.path),
      bpm: parseBpm(item.path),
      key: parseKey(item.path),
      duration: typeof item.metadata?.duration === "number" ? item.metadata.duration : undefined,
      size: typeof item.metadata?.size === "number" ? item.metadata.size : undefined,
      format: item.path.split(".").pop()?.toLowerCase() ?? "unknown",
      createdAt: item.created_at ?? item.updated_at ?? new Date().toISOString(),
      storageId: item.id ?? null,
    };
  }).filter((sound) =>
    (!categoryFilter || sound.category === categoryFilter) &&
    (!search || `${sound.name} ${sound.path} ${sound.instrument} ${sound.bucket}`.toLowerCase().includes(search))
  );

  filtered.sort((a, b) => sort === "name"
    ? a.name.localeCompare(b.name)
    : sort === "newest"
      ? b.createdAt.localeCompare(a.createdAt)
      : publicSortRank(a.category) - publicSortRank(b.category) || a.name.localeCompare(b.name));

  const page = filtered.slice(cursor, cursor + limit);
  const sounds = (await Promise.all(page.map(async (item) => {
    const signed = await supabase.storage.from(item.bucket).createSignedUrl(item.path, SIGNED_URL_TTL_SECONDS);
    const assetUrl = signed.data?.signedUrl;
    if (!assetUrl || !assetUrl.startsWith("https://")) return null;
    return { ...item, url: assetUrl, signedUrlExpiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString() };
  }))).filter((sound): sound is NonNullable<typeof sound> => Boolean(sound));

  const categories = filtered.reduce<Record<string, number>>((acc, sound) => {
    acc[sound.category] = (acc[sound.category] ?? 0) + 1;
    return acc;
  }, {});
  const nextCursor = cursor + sounds.length < filtered.length ? cursor + sounds.length : null;

  return NextResponse.json({
    sounds,
    categories,
    total: filtered.length,
    nextCursor,
    page: Math.floor(cursor / limit) + 1,
    backend: "supabase",
    buckets: AUDIO_BUCKETS,
    cache: "no-store",
  }, { headers: { "Cache-Control": "no-store" } });
}
