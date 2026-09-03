import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { ipDaRequisicao } from "./_shared/ip.ts";
import { JANELA_MS } from "./_shared/throttle.ts";

// Endpoint PUBLICO: o cliente envia a resposta do briefing pelo token.
// Duas defesas (2026-09-03): throttle por IP e "respondido não se sobrescreve".
const TABELA_TENTATIVAS = "briefing_submit_ip_attempts";
// Envios legítimos por IP em 15 min: um formulário e alguns reenvios por
// erro de rede. 10 folga isso e ainda mata varredura de token.
const LIMITE_IP = 10;
const FAXINA_MS = 24 * 3600 * 1000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* ignore */ }

  const token = (body?.token || "").toString();
  const raw = body?.raw && typeof body.raw === "object" ? body.raw : null;
  if (!token || !raw) return json({ error: "token e raw obrigatorios" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Throttle por IP, mesmo desenho de admin-auth: conta ANTES de validar e
  // falha fechada — contador que não respondeu não vale como zero.
  const ip = ipDaRequisicao(req.headers);
  const desde = new Date(Date.now() - JANELA_MS).toISOString();
  const { count, error: erroContagem } = await supabase.from(TABELA_TENTATIVAS)
    .select("id", { count: "exact", head: true }).eq("ip", ip).gte("attempted_at", desde);
  if (erroContagem || count == null) {
    console.error("throttle indisponível", erroContagem);
    return json({ error: "não foi possível receber agora, tente de novo" }, 503);
  }
  if (count >= LIMITE_IP) return json({ error: "muitos envios, tente novamente mais tarde" }, 429);
  const { error: erroRegistro } = await supabase.from(TABELA_TENTATIVAS).insert({ ip });
  if (erroRegistro) {
    console.error("não registrou a tentativa", erroRegistro);
    return json({ error: "não foi possível receber agora, tente de novo" }, 503);
  }

  // Respondido não se sobrescreve: link vazado ou reenvio acidental não apaga
  // o que o cliente já mandou. Reabrir é ação de admin (briefing-links), não
  // deste endpoint.
  const { data: link } = await supabase.from("briefing_links")
    .select("status").eq("token", token)
    .is("revogado_em", null) // D7: revogado -> mesmo caminho de token inexistente
    .maybeSingle();
  if (!link) return json({ error: "token invalido" }, 404);
  if (link.status === "respondido") return json({ error: "este briefing já foi respondido" }, 409);

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
    .is("revogado_em", null)
    .neq("status", "respondido") // guarda de corrida: dois envios simultâneos, um só grava
    .select("token")
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ error: "este briefing já foi respondido" }, 409);

  // Faxina oportunista, só no sucesso: linha fora da janela não decide nada.
  await supabase.from(TABELA_TENTATIVAS).delete()
    .lt("attempted_at", new Date(Date.now() - FAXINA_MS).toISOString());

  return json({ ok: true });
});
