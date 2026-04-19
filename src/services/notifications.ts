/**
 * Notification service — wraps Supabase queries for notifications.
 */
import { createClient } from "@/lib/supabase/client";
import { Notification } from "@/types/database";

type SupabaseClient = ReturnType<typeof createClient>;

export async function getNotifications(
  supabase: SupabaseClient,
  userId: string,
  limit = 50
): Promise<Notification[]> {
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as Notification[]) ?? [];
}

export async function getUnreadCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("read", false);
  return count ?? 0;
}

export async function markAllRead(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("read", false);
}

export async function createNotification(
  supabase: SupabaseClient,
  params: {
    userId: string;
    type: string;
    actorId?: string;
    songId?: string;
    message: string;
  }
): Promise<void> {
  await supabase.from("notifications").insert({
    user_id: params.userId,
    type: params.type,
    actor_id: params.actorId ?? null,
    song_id: params.songId ?? null,
    message: params.message,
  });
}
