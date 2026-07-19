// edge-functions/eloi-financeiro.ts
// Fase 5 do painel unificado: caixas + movimentações financeiras.
// Mesmo modelo de auth das outras funções admin (admin_sessions).
// Valores sempre em cents. Deploy com verify_jwt: false (auth é a sessão de admin).
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

const CAIXA_TIPOS = ["caixa", "conta_bancaria", "carteira", "cartao", "outro"];
const MOV_TIPOS = ["entrada", "saida"];
const MOV_STATUS = ["previsto", "realizado", "cancelado"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* ignore */ }
  const action = body?.action || "";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (!(await verifyAdminToken(supabase, body?.token))) return json({ error: "unauthorized" }, 401);

  // ── CAIXAS ──
  if (action === "caixas.list") {
    const { data, error } = await supabase.from("eloi_caixas").select("*").order("nome");
    if (error) return json({ error: error.message }, 500);
    // saldo realizado por caixa = saldo inicial + entradas realizadas − saídas realizadas
    const { data: movs } = await supabase.from("eloi_movimentos_financeiros")
      .select("caixa_id,tipo,valor_cents").eq("status", "realizado");
    const delta: Record<string, number> = {};
    for (const m of movs ?? []) {
      const v = Number(m.valor_cents) || 0;
      delta[m.caixa_id] = (delta[m.caixa_id] ?? 0) + (m.tipo === "entrada" ? v : -v);
    }
    return json({
      caixas: (data ?? []).map((c) => ({
        ...c,
        saldo_cents: (Number(c.saldo_inicial_cents) || 0) + (delta[c.id] ?? 0),
      })),
    });
  }

  if (action === "caixas.upsert") {
    const c = body?.caixa || {};
    const nome = String(c.nome || "").trim();
    if (!nome) return json({ error: "nome obrigatório" }, 400);
    const tipo = c.tipo || "outro";
    if (!CAIXA_TIPOS.includes(tipo)) return json({ error: `tipo inválido — use um de: ${CAIXA_TIPOS.join(", ")}` }, 400);
    const row = {
      nome,
      tipo,
      saldo_inicial_cents: Math.round(Number(c.saldo_inicial_cents) || 0),
      ativo: c.ativo !== false,
      updated_at: new Date().toISOString(),
    };
    if (c.id) {
      const { data, error } = await supabase.from("eloi_caixas").update(row).eq("id", c.id).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ caixa: data });
    }
    const { data, error } = await supabase.from("eloi_caixas").insert(row).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ caixa: data });
  }

  if (action === "caixas.delete") {
    if (!body?.id) return json({ error: "id obrigatório" }, 400);
    const { count } = await supabase.from("eloi_movimentos_financeiros")
      .select("id", { count: "exact", head: true }).eq("caixa_id", body.id);
    if ((count ?? 0) > 0) return json({ error: "caixa tem movimentações; desative em vez de excluir" }, 409);
    const { error } = await supabase.from("eloi_caixas").delete().eq("id", body.id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  // ── MOVIMENTAÇÕES ──
  if (action === "movimentos.list") {
    const f = body?.filtro || {};
    let q = supabase.from("eloi_movimentos_financeiros").select("*").order("created_at", { ascending: false });
    if (f.caixa_id) q = q.eq("caixa_id", f.caixa_id);
    if (f.cliente_id) q = q.eq("cliente_id", f.cliente_id);
    if (f.servico_id) q = q.eq("servico_id", f.servico_id);
    if (f.tipo) q = q.eq("tipo", f.tipo);
    if (f.status) q = q.eq("status", f.status);
    if (f.mes) { // 'YYYY-MM' sobre data_movimento
      const [y, m] = String(f.mes).split("-").map(Number);
      const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
      q = q.gte("data_movimento", `${f.mes}-01`).lt("data_movimento", end);
    }
    const { data, error } = await q;
    if (error) return json({ error: error.message }, 500);
    return json({ movimentos: data });
  }

  if (action === "movimentos.upsert") {
    const m = body?.movimento || {};
    const descricao = String(m.descricao || "").trim();
    if (!m.caixa_id) return json({ error: "caixa_id obrigatório" }, 400);
    if (!descricao) return json({ error: "descricao obrigatória" }, 400);
    if (!MOV_TIPOS.includes(m.tipo)) return json({ error: `tipo inválido — use um de: ${MOV_TIPOS.join(", ")}` }, 400);
    const status = m.status || "realizado";
    if (!MOV_STATUS.includes(status)) return json({ error: `status inválido — use um de: ${MOV_STATUS.join(", ")}` }, 400);
    const valor = Math.round(Number(m.valor_cents) || 0);
    if (valor <= 0) return json({ error: "valor_cents deve ser maior que zero" }, 400);
    const row = {
      caixa_id: m.caixa_id,
      cliente_id: m.cliente_id || null,
      servico_id: m.servico_id || null,
      orcamento_id: m.orcamento_id || null,
      tipo: m.tipo,
      status,
      descricao,
      valor_cents: valor,
      data_competencia: m.data_competencia || null,
      data_movimento: m.data_movimento || null,
      forma_pagamento: m.forma_pagamento || null,
      observacoes: m.observacoes || null,
      updated_at: new Date().toISOString(),
    };
    if (m.id) {
      const { data, error } = await supabase.from("eloi_movimentos_financeiros").update(row).eq("id", m.id).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ movimento: data });
    }
    const { data, error } = await supabase.from("eloi_movimentos_financeiros").insert(row).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ movimento: data });
  }

  if (action === "movimentos.delete") {
    if (!body?.id) return json({ error: "id obrigatório" }, 400);
    const { error } = await supabase.from("eloi_movimentos_financeiros").delete().eq("id", body.id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  // ── STATS ──
  // Separa com rigor: faturado (serviços) ≠ recebido (entradas realizadas) ≠
  // previsto (movimentos status previsto). Cancelado fica fora de tudo.
  if (action === "financeiro.stats") {
    const [caixas, movs, servs] = await Promise.all([
      supabase.from("eloi_caixas").select("id,saldo_inicial_cents,ativo"),
      supabase.from("eloi_movimentos_financeiros").select("tipo,status,valor_cents,servico_id"),
      supabase.from("eloi_servicos").select("id,valor_cents,status_execucao,pago,nf_numero"),
    ]);
    if (caixas.error || movs.error || servs.error) {
      return json({ error: (caixas.error || movs.error || servs.error)!.message }, 500);
    }
    let recebido = 0, despesas = 0, entradas_previstas = 0, saidas_previstas = 0;
    const recebidoPorServico: Record<string, number> = {};
    for (const m of movs.data ?? []) {
      const v = Number(m.valor_cents) || 0;
      if (m.status === "realizado") {
        if (m.tipo === "entrada") {
          recebido += v;
          if (m.servico_id) recebidoPorServico[m.servico_id] = (recebidoPorServico[m.servico_id] ?? 0) + v;
        } else despesas += v;
      } else if (m.status === "previsto") {
        if (m.tipo === "entrada") entradas_previstas += v; else saidas_previstas += v;
      }
    }
    let faturado = 0, a_receber = 0, em_execucao = 0, concluido_sem_nf = 0, pagamentos_pendentes = 0;
    for (const s of servs.data ?? []) {
      const v = Number(s.valor_cents) || 0;
      faturado += v;
      a_receber += Math.max(0, v - (recebidoPorServico[s.id] ?? 0));
      if (s.status_execucao === "em_execucao") em_execucao++;
      if (s.status_execucao === "concluida" && !s.nf_numero) concluido_sem_nf++;
      if (!s.pago) pagamentos_pendentes++;
    }
    let saldo = recebido - despesas;
    for (const c of caixas.data ?? []) saldo += Number(c.saldo_inicial_cents) || 0;
    return json({
      faturado_cents: faturado,
      recebido_cents: recebido,
      a_receber_cents: a_receber,
      despesas_cents: despesas,
      saldo_cents: saldo,
      entradas_previstas_cents: entradas_previstas,
      saidas_previstas_cents: saidas_previstas,
      em_execucao,
      concluido_sem_nf,
      pagamentos_pendentes,
    });
  }

  return json({ error: "ação inválida" }, 400);
});
