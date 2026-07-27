import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import type { AppRole, SessionUser } from "./demoData";
import {
  isSupabaseConfigured,
  requireSupabase,
  supabase,
} from "./supabase";

let sharedLoginInProgress = false;

function strongestRole(roles: AppRole[]): AppRole {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("recorder")) return "recorder";
  return "member";
}

async function mapSession(session: Session | null): Promise<SessionUser | null> {
  if (!session) return null;

  if (session.user.is_anonymous) {
    if (sharedLoginInProgress) return null;
    const { data, error } = await requireSupabase().rpc(
      "has_active_shared_session",
    );
    if (error || data !== true) {
      await requireSupabase().auth.signOut();
      return null;
    }
    return { displayName: "Člen souboru", role: "member" };
  }

  const { data, error } = await requireSupabase().rpc("get_my_roles");
  if (error) throw error;
  const roles = Array.isArray(data) ? (data as AppRole[]) : [];
  if (!roles.includes("admin") && !roles.includes("recorder")) {
    await requireSupabase().auth.signOut();
    throw new Error("Tento e-mail nemá přidělený přístup k administraci.");
  }
  const email = session.user.email;
  const metadataName =
    session.user.user_metadata.full_name ?? session.user.user_metadata.name;
  return {
    displayName:
      typeof metadataName === "string" && metadataName.trim()
        ? metadataName
        : email?.split("@")[0]?.replace(/[._-]+/g, " ") || "Uživatel",
    email,
    role: strongestRole(roles),
  };
}

export async function getCurrentAppSession(): Promise<SessionUser | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await requireSupabase().auth.getSession();
  if (error) throw error;
  return mapSession(data.session);
}

export async function sendMagicLink(email: string): Promise<void> {
  const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin);
  const { error } = await requireSupabase().auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo.toString(),
      shouldCreateUser: false,
    },
  });
  if (error) throw error;
}

export async function signInWithSharedCode(
  code: string,
): Promise<SessionUser> {
  const client = requireSupabase();
  sharedLoginInProgress = true;
  try {
    const existing = await client.auth.getSession();
    if (existing.data.session && !existing.data.session.user.is_anonymous) {
      await client.auth.signOut();
    }

    const current = await client.auth.getSession();
    if (!current.data.session?.user.is_anonymous) {
      const { error } = await client.auth.signInAnonymously();
      if (error) throw error;
    }

    const { data, error } = await client.rpc("verify_shared_code", {
      code: code.trim(),
    });
    if (error) throw error;
    if (typeof data !== "string" || Number.isNaN(Date.parse(data))) {
      throw new Error(
        "Sdílený kód není platný nebo bylo zadáno příliš mnoho pokusů.",
      );
    }
    return { displayName: "Člen souboru", role: "member" };
  } finally {
    sharedLoginInProgress = false;
  }
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  const session = await supabase.auth.getSession();
  if (session.data.session?.user.is_anonymous) {
    await supabase.rpc("end_shared_session");
  }
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function subscribeToAuth(
  callback: (session: SessionUser | null) => void,
): () => void {
  if (!supabase) return () => undefined;
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(
    (_event: AuthChangeEvent, session: Session | null) => {
      window.setTimeout(() => {
        void mapSession(session)
          .then(callback)
          .catch(() => callback(null));
      }, 0);
    },
  );
  return () => subscription.unsubscribe();
}
