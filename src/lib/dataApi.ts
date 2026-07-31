import type { AppApi } from "./domain";
import { supabaseApi } from "./supabaseData";

export const appApi: AppApi = supabaseApi;
