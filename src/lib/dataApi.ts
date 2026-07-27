import type { AppApi } from "./demoData";
import { demoApi } from "./demoData";
import { isSupabaseConfigured } from "./supabase";
import { supabaseApi } from "./supabaseData";

export const appApi: AppApi = isSupabaseConfigured ? supabaseApi : demoApi;
