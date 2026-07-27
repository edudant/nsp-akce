import { isSupabaseConfigured, requireSupabase } from "./supabase";

export async function rotateSharedAccessCode(): Promise<string> {
  if (!isSupabaseConfigured) {
    return `NSP-${crypto.randomUUID().slice(0, 8)}`;
  }

  const { data, error } = await requireSupabase().rpc("rotate_shared_code");
  if (error) throw error;
  if (typeof data !== "string" || !data) {
    throw new Error("Databáze nevrátila nový přístupový kód.");
  }
  return data;
}
