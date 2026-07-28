import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Endpoint PUBLICO: o cliente envia a resposta do briefing pelo token.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* ignore */ }

  const token = (body?.token || "").toString();
  const raw = body?.raw && typeof body.raw === "object" ? body.raw : null;
  if (!token || !raw) {
    return new Response(JSON.stringify({ error: "token e raw obrigatorios" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase
    .from("briefing_links")
    .update({
      raw,
      nome: raw.nome ?? null,
      email: raw.email ?? null,
      whatsapp: raw.whatsapp ?? null,
      empresa: raw.ec_empresa ?? raw.q1 ?? raw.empresa ?? null,
      status: "respondido",
      responded_at: new Date().toISOString(),
    })
    .eq("token", token)
    .is("revogado_em", null) // D7: revogado -> mesmo caminho de token inexistente
    .select("token, status")
    .single();

  if (error || !data) {
    return new Response(JSON.stringify({ error: error?.message || "token invalido" }), {
      status: 404, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
