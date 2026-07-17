import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BUCKET = "eloi-notas";
const PORTAL_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32, sem I L O U

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

function b64(b: Uint8Array) { let s = ""; for (const x of b) s += String.fromCharCode(x); return btoa(s); }
async function hashPassword(secret: string): Promise<string> {
  const ITERATIONS = 600_000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, key, 256);
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}
function randomToken(len: number) {
  return Array.from(crypto.getRandomValues(new Uint8Array(len)), (b) => PORTAL_ALPHABET[b % PORTAL_ALPHABET.length]).join("");
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

  if (!(await verifyAdminToken(supabase, body?.token))) return json({ error: "unauthorized" }, 401);

  // ── CLIENTES ──
  if (action === "clientes.list") {
    const { data: clientes, error } = await supabase
      .from("eloi_clientes").select("*").order("nome");
    if (error) return json({ error: error.message }, 500);
    const { data: svc } = await supabase
      .from("eloi_servicos").select("cliente_id,valor_cents");
    const agg: Record<string, { total_servicos: number; total_cents: number }> = {};
    for (const s of svc ?? []) {
      const a = agg[s.cliente_id] ?? (agg[s.cliente_id] = { total_servicos: 0, total_cents: 0 });
      a.total_servicos++; a.total_cents += Number(s.valor_cents) || 0;
    }
    return json({ clientes: (clientes ?? []).map((c) => ({ ...c, ...(agg[c.id] ?? { total_servicos: 0, total_cents: 0 }) })) });
  }

  if (action === "clientes.upsert") {
    const c = body?.cliente || {};
    if (!c.nome) return json({ error: "nome obrigatório" }, 400);
    const row = {
      nome: c.nome,
      cor: c.cor || "#7B2CBF",
      contato: c.contato ?? null,
      marca_slug: c.marca_slug || null,
      marca_publicada: c.marca_publicada === true,
    };
    if (c.id) {
      const { data, error } = await supabase.from("eloi_clientes").update(row).eq("id", c.id).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ cliente: data });
    }
    const { data, error } = await supabase.from("eloi_clientes").insert(row).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ cliente: data });
  }

  if (action === "clientes.gerar_senha_portal") {
    const clienteId = body?.cliente_id;
    if (!clienteId) return json({ error: "cliente_id obrigatório" }, 400);
    let prefix = "";
    for (let tries = 0; tries < 5; tries++) {
      prefix = randomToken(4);
      const { count } = await supabase.from("eloi_clientes").select("id", { count: "exact", head: true }).eq("portal_senha_prefix", prefix);
      if (!count) break;
    }
    const secret = randomToken(8);
    const hash = await hashPassword(secret);
    const { error } = await supabase.from("eloi_clientes").update({
      portal_senha_prefix: prefix, portal_senha_hash: hash,
      portal_senha_gerada_em: new Date().toISOString(),
      portal_tentativas_falhas: 0, portal_bloqueado_ate: null, portal_ativo: true,
    }).eq("id", clienteId);
    if (error) return json({ error: error.message }, 500);
    return json({ senha: `${prefix}-${secret}` });
  }

  if (action === "clientes.delete") {
    if (!body?.id) return json({ error: "id obrigatório" }, 400);
    const { count } = await supabase.from("eloi_servicos")
      .select("id", { count: "exact", head: true }).eq("cliente_id", body.id);
    if ((count ?? 0) > 0) return json({ error: "cliente tem serviços; mova ou exclua antes" }, 409);
    const { error } = await supabase.from("eloi_clientes").delete().eq("id", body.id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  // ── SERVIÇOS ──
  if (action === "servicos.list") {
    const f = body?.filtro || {};
    let q = supabase.from("eloi_servicos").select("*").order("created_at", { ascending: false });
    if (f.cliente_id) q = q.eq("cliente_id", f.cliente_id);
    if (f.status_execucao) q = q.eq("status_execucao", f.status_execucao);
    if (typeof f.pago === "boolean") q = q.eq("pago", f.pago);
    if (f.mes) { // 'YYYY-MM' sobre data_pagamento
      const start = `${f.mes}-01`;
      const [y, m] = f.mes.split("-").map(Number);
      const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
      q = q.gte("data_pagamento", start).lt("data_pagamento", end);
    }
    const { data, error } = await q;
    if (error) return json({ error: error.message }, 500);
    return json({ servicos: data });
  }

  if (action === "servicos.upsert") {
    const s = body?.servico || {};
    if (!s.cliente_id) return json({ error: "cliente_id obrigatório" }, 400);
    if (!s.descricao) return json({ error: "descricao obrigatória" }, 400);
    const row: any = {
      cliente_id: s.cliente_id,
      descricao: s.descricao,
      valor_cents: Number(s.valor_cents) || 0,
      status_execucao: ["aguardando_inicio", "em_execucao", "concluida"].includes(s.status_execucao) ? s.status_execucao : "em_execucao",
      pago: s.pago === true,
      data_pagamento: s.data_pagamento || null,
      nf_numero: s.nf_numero || null,
      observacoes: s.observacoes || null,
    };
    if (typeof s.nf_arquivo_url === "string") row.nf_arquivo_url = s.nf_arquivo_url || null;
    if (s.id) {
      const { data, error } = await supabase.from("eloi_servicos").update(row).eq("id", s.id).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ servico: data });
    }
    const { data, error } = await supabase.from("eloi_servicos").insert(row).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ servico: data });
  }

  if (action === "servicos.from_orcamento") {
    const orcamentoId = body?.orcamento_id;
    if (!orcamentoId) return json({ error: "orcamento_id obrigatório" }, 400);
    const { data: existente } = await supabase.from("eloi_servicos").select("*").eq("orcamento_id", orcamentoId).maybeSingle();
    if (existente) return json({ servico: existente, ja_existia: true });
    const { data: o, error: oErr } = await supabase.from("orcamentos").select("cliente_id,titulo,valor_total").eq("id", orcamentoId).single();
    if (oErr || !o) return json({ error: "orçamento não encontrado" }, 404);
    if (!o.cliente_id) return json({ error: "orçamento sem cliente cadastrado vinculado -- edite o orçamento e escolha um cliente cadastrado antes" }, 400);
    const { data, error } = await supabase.from("eloi_servicos").insert({
      cliente_id: o.cliente_id,
      orcamento_id: orcamentoId,
      descricao: o.titulo || "Serviço",
      valor_cents: Math.round((Number(o.valor_total) || 0) * 100),
      status_execucao: "aguardando_inicio",
    }).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ servico: data, ja_existia: false });
  }

  if (action === "servicos.delete") {
    if (!body?.id) return json({ error: "id obrigatório" }, 400);
    const { error } = await supabase.from("eloi_servicos").delete().eq("id", body.id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  // ── NOTA FISCAL (Storage) ──
  if (action === "nf.upload_url") {
    if (!body?.servico_id || !body?.filename) return json({ error: "servico_id e filename obrigatórios" }, 400);
    const safe = String(body.filename).replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${body.servico_id}/${Date.now()}_${safe}`;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) return json({ error: error.message }, 500);
    return json({ path, signed_url: data.signedUrl, token: data.token });
  }

  if (action === "nf.view_url") {
    if (!body?.path) return json({ error: "path obrigatório" }, 400);
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(body.path, 120);
    if (error) return json({ error: error.message }, 500);
    return json({ url: data.signedUrl });
  }

  // ── DASHBOARD ──
  if (action === "dashboard.stats") {
    const { data: rows, error } = await supabase
      .from("eloi_servicos")
      .select("valor_cents,status_execucao,pago,data_pagamento,nf_numero,cliente_id");
    if (error) return json({ error: error.message }, 500);
    const now = new Date();
    const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    let faturado_mes = 0, a_receber = 0, em_execucao = 0, concluido_sem_nf = 0;
    const porCli: Record<string, number> = {};
    for (const r of rows ?? []) {
      const v = Number(r.valor_cents) || 0;
      if (r.pago && r.data_pagamento && String(r.data_pagamento).slice(0, 7) === ym) faturado_mes += v;
      if (!r.pago) a_receber += v;
      if (r.status_execucao === "em_execucao") em_execucao++;
      if (r.status_execucao === "concluida" && !r.nf_numero) concluido_sem_nf++;
      porCli[r.cliente_id] = (porCli[r.cliente_id] ?? 0) + v;
    }
    const { data: clientes } = await supabase.from("eloi_clientes").select("id,nome,cor");
    const por_cliente = (clientes ?? [])
      .map((c) => ({ nome: c.nome, cor: c.cor, total_cents: porCli[c.id] ?? 0 }))
      .sort((a, b) => b.total_cents - a.total_cents);
    return json({ faturado_mes, a_receber, em_execucao, concluido_sem_nf, por_cliente });
  }

  return json({ error: "ação inválida" }, 400);
});
