/**
 * Profile service — wraps Supabase queries for profiles.
 */
import { createClient } from "@/lib/supabase/client";
import { Profile } from "@/types/database";

type SupabaseClient = ReturnType<typeof createClient>;

export async function getProfileById(
  supabase: SupabaseClient,
  id: string
): Promise<Profile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single();
  return (data as Profile | null) ?? null;
}

export async function getProfileByUsername(
  supabase: SupabaseClient,
  username: string
): Promise<Profile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .single();
  return (data as Profile | null) ?? null;
}

export async function updateProfile(
  supabase: SupabaseClient,
  id: string,
  updates: Partial<Profile>
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", id);
  return { error: error?.message ?? null };
}

export async function searchProfiles(
  supabase: SupabaseClient,
  term: string,
  limit = 10
): Promise<Profile[]> {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
    .limit(limit);
  return (data as Profile[]) ?? [];
}

export async function isFollowing(
  supabase: SupabaseClient,
  followerId: string,
  followingId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("follows")
    .select("id")
    .eq("follower_id", followerId)
    .eq("following_id", followingId)
    .single();
  return !!data;
}

export async function toggleFollow(
  supabase: SupabaseClient,
  followerId: string,
  followingId: string
): Promise<boolean> {
  const following = await isFollowing(supabase, followerId, followingId);
  if (following) {
    await supabase
      .from("follows")
      .delete()
      .eq("follower_id", followerId)
      .eq("following_id", followingId);
    return false;
  } else {
    await supabase
      .from("follows")
      .insert({ follower_id: followerId, following_id: followingId });
    return true;
  }
}
