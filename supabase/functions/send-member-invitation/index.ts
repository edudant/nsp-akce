import { createClient } from "npm:@supabase/supabase-js@2.110.8";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

const productionRedirect = "https://edudant.github.io/nsp-akce/";
const localRedirects = new Map([
  ["http://127.0.0.1:5173", "http://127.0.0.1:5173/nsp-akce/"],
  ["http://localhost:5173", "http://localhost:5173/nsp-akce/"],
]);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function statusForMessage(message: string): number {
  const normalized = message.toLocaleLowerCase("cs");
  if (normalized.includes("pouze administrátor")) return 403;
  if (normalized.includes("za ") && normalized.includes("sekund")) return 429;
  if (normalized.includes("limit") || normalized.includes("rate")) return 429;
  if (normalized.includes("nemá uložený e-mail")) return 422;
  if (normalized.includes("účet už je aktivní")) return 409;
  return 400;
}

function invitationRedirect(request: Request): string {
  const origin = request.headers.get("origin");
  return (origin && localRedirects.get(origin)) || productionRedirect;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Nepodporovaná metoda." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = request.headers.get("authorization");
  if (!supabaseUrl || !anonKey) {
    return jsonResponse({ error: "Server nemá dokončenou konfiguraci." }, 500);
  }
  if (!authorization) {
    return jsonResponse({ error: "Pro odeslání pozvánky se přihlaste." }, 401);
  }

  let memberId: string | undefined;
  try {
    const body = (await request.json()) as { memberId?: unknown };
    if (typeof body.memberId === "string" && body.memberId.length > 0) {
      memberId = body.memberId;
    }
  } catch {
    return jsonResponse({ error: "Požadavek nemá platný formát." }, 400);
  }
  if (!memberId) {
    return jsonResponse({ error: "Chybí člen, kterému se má pozvánka poslat." }, 400);
  }

  const caller = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: invitation, error: authorizationError } = await caller.rpc(
    "send_member_invitation",
    { target_member_id: memberId },
  );
  if (authorizationError) {
    return jsonResponse(
      { error: authorizationError.message },
      statusForMessage(authorizationError.message),
    );
  }

  const email = (invitation as { email?: unknown } | null)?.email;
  if (typeof email !== "string" || email.length === 0) {
    return jsonResponse({ error: "U člena není platný e-mail." }, 422);
  }

  const mailer = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: sendError } = await mailer.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: invitationRedirect(request),
      shouldCreateUser: true,
    },
  });
  if (sendError) {
    return jsonResponse(
      { error: sendError.message },
      sendError.status ?? statusForMessage(sendError.message),
    );
  }

  const { data: sentAt, error: confirmationError } = await caller.rpc(
    "confirm_member_invitation_sent",
    { target_member_id: memberId, provider_message_id: null },
  );
  if (confirmationError) {
    return jsonResponse({ error: confirmationError.message }, 500);
  }

  return jsonResponse({ ok: true, sentAt });
});
