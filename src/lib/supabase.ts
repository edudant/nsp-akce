import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const projectUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY
)?.trim();

export const isSupabaseConfigured = Boolean(projectUrl && publishableKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(projectUrl!, publishableKey!, {
      auth: {
        detectSessionInUrl: true,
        flowType: "pkce",
        persistSession: true,
      },
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      "Aplikace není připojená k databázi. Zkontrolujte veřejné nastavení Supabase.",
    );
  }
  return supabase;
}
