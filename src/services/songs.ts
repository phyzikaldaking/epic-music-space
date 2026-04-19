/**
 * Song service — wraps Supabase queries for songs.
 * Used by server components and API routes.
 */
import { createClient } from "@/lib/supabase/client";
import { Song, SongWithArtist } from "@/types/database";

type SupabaseClient = ReturnType<typeof createClient>;

export async function getSongById(
  supabase: SupabaseClient,
  id: string
): Promise<SongWithArtist | null> {
  const { data } = await (supabase
    .from("songs")
    .select("*, profiles(*)")
    .eq("id", id)
    .single() as unknown as Promise<{ data: SongWithArtist | null }>);
  return data;
}

export async function getSongsByArtist(
  supabase: SupabaseClient,
  artistId: string
): Promise<Song[]> {
  const { data } = await supabase
    .from("songs")
    .select("*")
    .eq("artist_id", artistId)
    .eq("is_published", true)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getFeedSongs(
  supabase: SupabaseClient,
  page = 0,
  pageSize = 20
): Promise<SongWithArtist[]> {
  const { data } = await (supabase
    .from("songs")
    .select("*, profiles(*)")
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1) as unknown as Promise<{
    data: SongWithArtist[] | null;
  }>);
  return data ?? [];
}

export async function getMarketplaceSongs(
  supabase: SupabaseClient,
  saleType?: "fixed" | "pwyw" | "auction"
): Promise<SongWithArtist[]> {
  let query = supabase
    .from("songs")
    .select("*, profiles(*)")
    .eq("is_published", true)
    .neq("sale_type", "free")
    .order("created_at", { ascending: false });

  if (saleType) query = query.eq("sale_type", saleType);

  const { data } = await (query as unknown as Promise<{
    data: SongWithArtist[] | null;
  }>);
  return data ?? [];
}

export async function searchSongs(
  supabase: SupabaseClient,
  term: string,
  limit = 20
): Promise<SongWithArtist[]> {
  const { data } = await (supabase
    .from("songs")
    .select("*, profiles(*)")
    .or(`title.ilike.%${term}%,genre.ilike.%${term}%`)
    .eq("is_published", true)
    .limit(limit) as unknown as Promise<{ data: SongWithArtist[] | null }>);
  return data ?? [];
}

export async function incrementPlayCount(
  supabase: SupabaseClient,
  songId: string,
  currentCount: number
) {
  await supabase
    .from("songs")
    .update({ plays_count: currentCount + 1 })
    .eq("id", songId);
}

export async function getPurchasedSongs(
  supabase: SupabaseClient,
  userId: string
): Promise<SongWithArtist[]> {
  const { data: purchases } = await supabase
    .from("purchases")
    .select("song_id")
    .eq("buyer_id", userId)
    .eq("status", "completed");

  if (!purchases?.length) return [];

  const songIds = purchases.map((p) => p.song_id);
  const { data } = await (supabase
    .from("songs")
    .select("*, profiles(*)")
    .in("id", songIds) as unknown as Promise<{ data: SongWithArtist[] | null }>);
  return data ?? [];
}
