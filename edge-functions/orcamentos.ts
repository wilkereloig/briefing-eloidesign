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

  const action = body?.action || "list";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── PÚBLICO (sem senha): visualização de um orçamento por token secreto ──
  if (action === "public_get") {
    const token = body?.token;
    if (!token) return json({ error: "token obrigatório" }, 400);
    const { data, error } = await supabase
      .from("orcamentos")
      .select("cliente,titulo,itens,valor_total,created_at")
      .eq("share_token", token)
      .single();
    if (error || !data) return json({ error: "não encontrado" }, 404);
    return json({ orcamento: data });
  }

  // ── daqui pra baixo exige sessão admin ──
  if (!(await verifyAdminToken(supabase, body?.token))) return json({ error: "unauthorized" }, 401);

  if (action === "list") {
    const { data, error } = await supabase
      .from("orcamentos").select("*").order("created_at", { ascending: false });
    if (error) return json({ error: error.message }, 500);
    return json({ orcamentos: data });
  }

  if (action === "create") {
    const o = body?.orcamento || {};
    const { data, error } = await supabase.from("orcamentos").insert({
      cliente: o.cliente ?? null,
      cliente_id: o.cliente_id ?? null,
      titulo: o.titulo ?? null,
      status: o.status ?? "rascunho",
      itens: o.itens ?? [],
      valor_total: o.valor_total ?? 0,
      observacoes: o.observacoes ?? null,
      link: o.link ?? null,
    }).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ orcamento: data });
  }

  if (action === "update") {
    const o = body?.orcamento || {};
    if (!o.id) return json({ error: "id obrigatório" }, 400);
    const { data, error } = await supabase.from("orcamentos").update({
      cliente: o.cliente ?? null,
      cliente_id: o.cliente_id ?? null,
      titulo: o.titulo ?? null,
      status: o.status ?? "rascunho",
      itens: o.itens ?? [],
      valor_total: o.valor_total ?? 0,
      observacoes: o.observacoes ?? null,
      link: o.link ?? null,
      updated_at: new Date().toISOString(),
    }).eq("id", o.id).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ orcamento: data });
  }

  if (action === "delete") {
    if (!body?.id) return json({ error: "id obrigatório" }, 400);
    const { error } = await supabase.from("orcamentos").delete().eq("id", body.id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  // ── CATÁLOGO DE SERVIÇOS (orçamento inteligente) ──

  if (action === "catalog_list") {
    const { data, error } = await supabase
      .from("catalogo_servicos").select("*").order("ordem", { ascending: true }).order("nome", { ascending: true });
    if (error) return json({ error: error.message }, 500);
    return json({ servicos: data });
  }

  if (action === "catalog_save") {
    const s = body?.servico || {};
    const row = {
      nome: s.nome ?? "",
      categoria: s.categoria ?? null,
      preco_base: Number(s.preco_base) || 0,
      unidade: s.unidade ?? "un",
      ativo: s.ativo !== false,
      ordem: Number(s.ordem) || 0,
    };
    if (!row.nome) return json({ error: "nome obrigatório" }, 400);
    if (s.id) {
      const { data, error } = await supabase.from("catalogo_servicos")
        .update({ ...row, updated_at: new Date().toISOString() }).eq("id", s.id).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ servico: data });
    } else {
      const { data, error } = await supabase.from("catalogo_servicos")
        .insert(row).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ servico: data });
    }
  }

  if (action === "catalog_delete") {
    if (!body?.id) return json({ error: "id obrigatório" }, 400);
    const { error } = await supabase.from("catalogo_servicos").delete().eq("id", body.id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  return json({ error: "ação inválida" }, 400);
});
