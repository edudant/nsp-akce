import { createClient } from "npm:@supabase/supabase-js@2.110.8";
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({});
  if (request.method !== "POST")
    return json({ error: "Nepodporovaná metoda." }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey)
    return json({ error: "Server nemá dokončenou konfiguraci." }, 500);
  const authorization = request.headers.get("authorization");
  if (!authorization) return json({ error: "Přihlaste se jako admin." }, 401);
  const caller = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { error: authError } = await caller.auth.getUser();
  if (authError) return json({ error: "Přihlaste se jako admin." }, 401);
  let memberId: string;
  try {
    const body = await request.json();
    if (typeof body.memberId !== "string") throw new Error();
    memberId = body.memberId;
  } catch {
    return json({ error: "Chybí platný člen." }, 400);
  }
  const { data: email, error: permissionError } = await caller.rpc(
    "authorize_member_login_code",
    { target_member_id: memberId },
  );
  if (permissionError)
    return json(
      { error: permissionError.message },
      permissionError.code === "42501" ? 403 : 400,
    );
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !data.properties?.email_otp)
    return json({ error: "Kód se nepodařilo vygenerovat." }, 500);
  return json({ email, code: data.properties.email_otp });
});
