import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import type { AppRole, SessionUser } from "./domain";
import {
  isSupabaseConfigured,
  requireSupabase,
  supabase,
} from "./supabase";

let sharedLoginInProgress = false;

export const EMAIL_RESEND_SECONDS = 60;

export type EmailAuthAction = "request" | "verify";

interface AuthErrorDetails {
  code?: unknown;
  message?: unknown;
  status?: unknown;
}

function authErrorDetails(error: unknown): {
  code: string;
  message: string;
  status?: number;
} {
  if (typeof error !== "object" || error === null) {
    return {
      code: "",
      message: typeof error === "string" ? error : "",
    };
  }

  const details = error as AuthErrorDetails;
  return {
    code: typeof details.code === "string" ? details.code.toLowerCase() : "",
    message:
      typeof details.message === "string" ? details.message.toLowerCase() : "",
    status: typeof details.status === "number" ? details.status : undefined,
  };
}

function retryAfterSeconds(message: string): number | null {
  const match = message.match(/(?:after|in|za)?\s*(\d+)\s*(?:seconds?|sekund)/i);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}

/**
 * Maps errors from Supabase Auth and an SMTP provider to short Czech messages.
 * Keeping this in one place also makes login, invitations and future account
 * management show the same recovery advice.
 */
export function getEmailAuthErrorMessage(
  error: unknown,
  action: EmailAuthAction,
): string {
  const { code, message, status } = authErrorDetails(error);
  const waitSeconds = retryAfterSeconds(message);

  if (
    action === "verify" &&
    (code === "otp_expired" ||
      code === "invalid_credentials" ||
      /(?:otp|token|code|k[oó]d).*(?:expired|invalid|neplat|vypr)/i.test(message) ||
      /(?:expired|invalid).*(?:otp|token|code)/i.test(message))
  ) {
    return "Kód není platný nebo už vypršel. Pošlete si nový e-mail.";
  }

  if (
    action === "request" &&
    (code === "over_email_send_rate_limit" ||
      code === "over_request_rate_limit" ||
      status === 429 ||
      /rate limit|too many requests|security purposes/i.test(message))
  ) {
    if (waitSeconds !== null && waitSeconds <= 15 * 60) {
      return `Nový e-mail lze poslat za ${waitSeconds} sekund.`;
    }
    return "Limit e-mailů je dočasně vyčerpaný. Zkuste to přibližně za hodinu.";
  }

  if (
    action === "verify" &&
    (code === "over_request_rate_limit" ||
      status === 429 ||
      /rate limit|too many requests/i.test(message))
  ) {
    return "Proběhlo příliš mnoho pokusů. Chvíli počkejte a potom si pošlete nový e-mail.";
  }

  if (
    action === "request" &&
    (code === "email_provider_disabled" ||
      code === "unexpected_failure" ||
      /smtp|mailer|gmail|email provider|sending quota|daily quota|failed to send/i.test(
        message,
      ))
  ) {
    return "Odesílání je dočasně nedostupné. Zkuste to později; při denním limitu následující den.";
  }

  if (
    code === "email_address_invalid" ||
    /invalid email|email address.*invalid/i.test(message)
  ) {
    return "Zadejte platnou e-mailovou adresu.";
  }

  return action === "verify"
    ? "Kód se nepodařilo ověřit. Zkontrolujte jej nebo si pošlete nový e-mail."
    : "Přihlašovací e-mail se nepodařilo odeslat. Zkuste to prosím později.";
}

function isPrivateEnrollmentRejection(error: unknown): boolean {
  const { code, message, status } = authErrorDetails(error);
  if (status !== 403) return false;
  if (
    code.startsWith("hook_timeout") ||
    code === "request_timeout" ||
    code === "email_address_not_authorized" ||
    /smtp|mailer|gmail|email provider|sending quota/i.test(message)
  ) {
    return false;
  }
  // Custom before-user-created hooks intentionally return a generic 403. The
  // UI must behave exactly like a successful request for unknown/inactive
  // member addresses, regardless of the localized hook message.
  return true;
}

function strongestRole(roles: string[]): AppRole {
  if (roles.includes("admin")) return "admin";
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
    return {
      accessMode: "shared",
      displayName: "Člen souboru",
      role: "member",
    };
  }

  const client = requireSupabase();
  const [{ data, error }, profileResult] = await Promise.all([
    client.rpc("get_my_roles"),
    client
      .from("profiles")
      .select("member_id, display_name")
      .eq("user_id", session.user.id)
      .maybeSingle(),
  ]);
  if (error) throw error;
  if (profileResult.error) throw profileResult.error;
  const roles = Array.isArray(data)
    ? data.filter((role): role is string => typeof role === "string")
    : [];
  if (
    !roles.includes("admin") &&
    !roles.includes("member")
  ) {
    await requireSupabase().auth.signOut();
    throw new Error("Tento e-mail nemá aktivní přístup do aplikace.");
  }
  const email = session.user.email;
  const profile = profileResult.data as
    | { display_name: string | null; member_id: string | null }
    | null;
  const metadataName =
    session.user.user_metadata.full_name ?? session.user.user_metadata.name;
  const role = strongestRole(roles);
  return {
    accessMode: role,
    displayName:
      profile?.display_name?.trim() ||
      (typeof metadataName === "string" && metadataName.trim()
        ? metadataName
        : email?.split("@")[0]?.replace(/[._-]+/g, " ") || "Uživatel"),
    email,
    memberId: profile?.member_id ?? undefined,
    role,
  };
}

function emailMagicLinkTokenHash(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URL(window.location.href).searchParams;
  if (params.get("type") !== "email") return null;
  return params.get("token_hash")?.trim() || null;
}

function clearEmailMagicLinkFromUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("token_hash");
  url.searchParams.delete("type");
  window.history.replaceState(
    window.history.state,
    document.title,
    `${url.pathname}${url.search}${url.hash}`,
  );
}

/**
 * Completes a magic link through its one-time token hash. Unlike PKCE's
 * browser-local code verifier, this callback also works when the link was
 * opened on another device or in an e-mail application's browser.
 */
export async function verifyEmailMagicLink(
  tokenHash: string,
): Promise<SessionUser> {
  const client = requireSupabase();
  const { data, error } = await client.auth.verifyOtp({
    token_hash: tokenHash.trim(),
    type: "email",
  });
  if (error) throw error;

  const appSession = await mapSession(data.session);
  if (!appSession) {
    await client.auth.signOut();
    throw new Error("Přihlašovací odkaz není platný nebo už vypršel.");
  }
  return appSession;
}

export async function getCurrentAppSession(): Promise<SessionUser | null> {
  if (!isSupabaseConfigured) return null;
  const tokenHash = emailMagicLinkTokenHash();
  if (tokenHash) {
    try {
      return await verifyEmailMagicLink(tokenHash);
    } finally {
      // A one-time token must not stay in browser history or be retried after a
      // refresh, regardless of whether verification succeeded.
      clearEmailMagicLinkFromUrl();
    }
  }
  const { data, error } = await requireSupabase().auth.getSession();
  if (error) throw error;
  return mapSession(data.session);
}

export async function requestEmailLogin(email: string): Promise<void> {
  const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin);
  const { error } = await requireSupabase().auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      emailRedirectTo: redirectTo.toString(),
      shouldCreateUser: true,
    },
  });
  // The before-user-created hook rejects unknown and inactive addresses. Treat
  // that rejection like a successful request so the login screen cannot be
  // used to enumerate the member list.
  if (error && !isPrivateEnrollmentRejection(error)) throw error;
}

/** @deprecated Use requestEmailLogin; the same message contains a link and OTP. */
export async function sendMagicLink(email: string): Promise<void> {
  return requestEmailLogin(email);
}

export async function verifyEmailOtp(
  email: string,
  token: string,
): Promise<SessionUser> {
  const client = requireSupabase();
  const { data, error } = await client.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.replace(/\D/g, ""),
    type: "email",
  });
  if (error) throw error;

  const appSession = await mapSession(data.session);
  if (!appSession) {
    await client.auth.signOut();
    throw new Error("Přihlášení se nepodařilo dokončit. Pošlete si nový e-mail.");
  }
  return appSession;
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
    return {
      accessMode: "shared",
      displayName: "Člen souboru",
      role: "member",
    };
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
