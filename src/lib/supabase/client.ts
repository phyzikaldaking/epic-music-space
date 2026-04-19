import { createBrowserClient } from "@supabase/ssr";
import { Database } from "@/types/database";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // During build / SSR without env vars, return a minimal stub that won't crash
    return createBrowserClient<Database>(
      url ?? "https://placeholder.supabase.co",
      key ?? "placeholder-key"
    );
  }

  return createBrowserClient<Database>(url, key);
}
