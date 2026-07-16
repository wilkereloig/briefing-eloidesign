import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* ignore */ }
  const action = body?.action || "";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (action === "login") {
    const expected = Deno.env.get("ADMIN_PASSWORD");
    if (!expected) return json({ error: "ADMIN_PASSWORD não configurado no projeto" }, 500);
    if (body?.password !== expected) return json({ error: "senha inválida" }, 401);

    const { data, error } = await supabase.from("admin_sessions").insert({}).select("token, expires_at").single();
    if (error) return json({ error: error.message }, 500);
    return json({ token: data.token, expires_at: data.expires_at });
  }

  if (action === "logout") {
    const token = body?.token;
    if (token) await supabase.from("admin_sessions").delete().eq("token", token);
    return json({ ok: true });
  }

  if (action === "logout_all") {
    if (!body?.token) return json({ error: "token obrigatório" }, 400);
    await supabase.from("admin_sessions").delete().neq("token", "");
    return json({ ok: true });
  }

  return json({ error: "ação inválida" }, 400);
});
