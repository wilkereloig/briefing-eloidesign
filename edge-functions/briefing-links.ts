import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function verifyAdminToken(supabase: any, token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const { data } = await supabase.from("admin_sessions").select("expires_at").eq("token", token).maybeSingle();
  if (!data || new Date(data.expires_at) < new Date()) return false;
  await supabase.from("admin_sessions")
    .update({ last_seen_at: new Date().toISOString(), expires_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString() })
    .eq("token", token);
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* ignore */ }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (!(await verifyAdminToken(supabase, body?.token))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const action = body?.action || "list";

  if (action === "create") {
    const cliente = (body?.cliente || "").toString().slice(0, 200);
    const tipo = (body?.tipo || "").toString().slice(0, 60);
    const cliente_id = body?.cliente_id || null;
    if (!tipo) {
      return new Response(JSON.stringify({ error: "tipo obrigatorio" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const { data, error } = await supabase
      .from("briefing_links")
      .insert({ cliente, tipo, cliente_id })
      .select("token, cliente, cliente_id, tipo, status, created_at")
      .single();
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ invite: data }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (action === "delete") {
    // nota: body.token é o token de sessão admin (injetado por EloiAdminAuth.call);
    // o convite é identificado por id, igual às demais edge functions (clientes.delete, orcamentos delete etc.)
    const id = (body?.id || "").toString();
    await supabase.from("briefing_links").delete().eq("id", id);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // default: list
  const { data, error } = await supabase
    .from("briefing_links")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ invites: data }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
