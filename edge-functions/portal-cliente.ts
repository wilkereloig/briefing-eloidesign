import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { faxinarSessoes, requireCliente, sessaoValida } from "./_shared/auth.ts";
import { normalizarSenha } from "./_shared/senha.ts";
import { ipDaRequisicao } from "./_shared/ip.ts";

// Portal do cliente (NF, orcamentos, briefings, marca, entregas) -- sessao propria
// (portal_sessions), separada da sessao de admin (admin_sessions). Marca voltou a
// exigir sessao (fase 4 da reorganizacao) -- bucket privado eloi-entregas, signed
// urls, sem link publico permanente (decisao anterior do addendum-area-cliente.md
// revertida a pedido do dono: gráfica nao precisa mais de link direto).

const NF_BUCKET = "eloi-notas";
const ENTREGAS_BUCKET = "eloi-entregas";

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

// ── hashing de senha (PBKDF2-SHA256, mesmo formato que eloi-gestao.ts gera) ──
function unb64(s: string) { return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); }
async function verifyPassword(secret: string, stored: string): Promise<boolean> {
  const [, iterStr, saltB64, hashB64] = stored.split("$");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]);
  const derived = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: unb64(saltB64), iterations: Number(iterStr), hash: "SHA-256" }, key, 256));
  return timingSafeEqual(derived, unb64(hashB64));
}
function timingSafeEqual(a: Uint8Array, b: Uint8Array) { // sem early-exit, tempo constante
  if (a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
// gerado 1x offline (PBKDF2-SHA256, 600k iter, segredo dummy) -- queimado no caminho "prefixo nao existe" p/ fechar timing leak
const DUMMY_HASH = "pbkdf2$600000$hqnSvVbexTFv5tanHOZPxw==$YqpS6qfRKNQIXygHyXF2y9P2LlrikAW6J3dmH7Co0eg=";

// ── sessao de ADMIN: usada so pelo admin_preview. SEM sliding-renewal (nao usa
// _shared/auth.ts:requireAdmin de proposito -- requireAdmin renova a expiracao
// a cada chamada, o que mudaria o comportamento aqui). A REGRA de validade
// (inatividade + teto absoluto) e a mesma de la, via sessaoValida. ──
async function verifyAdminToken(supabase: any, token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const { data } = await supabase.from("admin_sessions").select("expires_at,created_at").eq("token", token).maybeSingle();
  return !!data && sessaoValida(data);
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

  // ── PUBLICO (sem sessao): login ──
  if (action === "login") {
    const ip = ipDaRequisicao(req.headers);
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { count } = await supabase.from("portal_login_ip_attempts")
      .select("id", { count: "exact", head: true }).eq("ip", ip).gte("attempted_at", since);
    if ((count ?? 0) >= 20) return json({ error: "muitas tentativas, aguarde" }, 429); // limite alto: so pega scan de prefixo
    await supabase.from("portal_login_ip_attempts").insert({ ip }); // conta antes de validar, sem branch pra burlar

    const { prefix, secret } = normalizarSenha(body?.senha);

    const { data: c } = await supabase.from("eloi_clientes")
      .select("id,nome,portal_senha_hash,portal_tentativas_falhas,portal_bloqueado_ate,portal_ativo")
      .eq("portal_senha_prefix", prefix).maybeSingle();

    if (!c || !c.portal_ativo || !c.portal_senha_hash) {
      await verifyPassword(secret, DUMMY_HASH); // custo de tempo parecido ao caminho "achou" -- fecha timing leak
      return json({ error: "senha invalida" }, 401);
    }
    if (c.portal_bloqueado_ate && new Date(c.portal_bloqueado_ate) > new Date()) {
      return json({ error: "muitas tentativas, tente novamente mais tarde" }, 429); // sem rodar PBKDF2 -- ja bloqueado
    }

    const ok = await verifyPassword(secret, c.portal_senha_hash);
    if (!ok) {
      const tentativas = (c.portal_tentativas_falhas ?? 0) + 1;
      const patch: Record<string, unknown> = { portal_tentativas_falhas: tentativas };
      if (tentativas >= 5) { patch.portal_bloqueado_ate = new Date(Date.now() + 15 * 60_000).toISOString(); patch.portal_tentativas_falhas = 0; }
      await supabase.from("eloi_clientes").update(patch).eq("id", c.id);
      return json({ error: "senha invalida" }, 401);
    }

    await supabase.from("eloi_clientes").update({ portal_tentativas_falhas: 0, portal_bloqueado_ate: null }).eq("id", c.id);
    // Faxina oportunista no sucesso (2026-09-03): sessões mortas e tentativas
    // fora de qualquer janela. Antes nada apagava nenhuma das duas tabelas.
    await Promise.all([
      faxinarSessoes(supabase, "portal_sessions"),
      supabase.from("portal_login_ip_attempts").delete().lt("attempted_at", new Date(Date.now() - 24 * 3600_000).toISOString()),
    ]);
    const { data: sess, error } = await supabase.from("portal_sessions").insert({ cliente_id: c.id }).select("token").single();
    if (error) return json({ error: error.message }, 500);
    return json({ token: sess.token, cliente_nome: c.nome });
  }

  // ── PREVIEW DE ADMIN: emite uma sessao de portal normal para um cliente. ──
  // Aqui (e SO aqui) cliente_id vem do body -- por isso a autoridade tem que vir
  // do token de admin, nao do body. Sem esse if, a action seria bypass total:
  // qualquer um forjaria sessao para qualquer cliente_id.
  // De proposito NAO cria caminho novo nas actions de dados: a sessao emitida e
  // igual a do cliente real, entao nao ha "modo admin" para vazar la embaixo.
  if (action === "admin_preview") {
    if (!(await verifyAdminToken(supabase, body?.admin_token))) return json({ error: "unauthorized" }, 401);
    const clienteId = String(body?.cliente_id || "");
    if (!clienteId) return json({ error: "cliente_id obrigatorio" }, 400);

    const { data: c } = await supabase.from("eloi_clientes").select("id,nome").eq("id", clienteId).maybeSingle();
    if (!c) return json({ error: "cliente nao encontrado" }, 404);

    // Sessao identica a do login real (mesma tabela, mesma expiracao padrao).
    // Tentei emitir com 1h, mas requireCliente (_shared/auth.ts) renova pra 12h
    // na primeira chamada -- expiracao curta aqui seria so um comentario mentindo.
    const { data: sess, error } = await supabase.from("portal_sessions")
      .insert({ cliente_id: c.id }).select("token").single();
    if (error) return json({ error: error.message }, 500);
    return json({ token: sess.token, cliente_nome: c.nome, preview: true });
  }

  // ── daqui pra baixo exige sessao de portal (cliente), NAO admin ──
  const session = await requireCliente(supabase, body?.token);
  if (!session) return json({ error: "unauthorized" }, 401);
  const clienteId = session.cliente_id;

  if (action === "logout") {
    await supabase.from("portal_sessions").delete().eq("token", body.token);
    return json({ ok: true });
  }

  if (action === "me") {
    const { data, error } = await supabase.from("eloi_clientes")
      .select("nome,marca_slug,marca_publicada").eq("id", clienteId).single();
    if (error) return json({ error: error.message }, 500);
    return json({ cliente: data });
  }

  if (action === "servicos.list") {
    const { data, error } = await supabase.from("eloi_servicos")
      .select("id,descricao,valor_cents,status_execucao,pago,data_pagamento,nf_numero,nf_arquivo_url,created_at,valor_sugerido_cents,valor_sugerido_em,valor_sugerido_observacao")
      .eq("cliente_id", clienteId).order("created_at", { ascending: false });
    if (error) return json({ error: error.message }, 500);
    const servicos = (data ?? []).map(({ nf_arquivo_url, ...rest }: any) => ({ ...rest, tem_nf: !!nf_arquivo_url }));
    return json({ servicos });
  }

  // Cliente sugere um valor pra um servico ainda sem preco definido. Nao vira
  // valor_cents oficial aqui -- so o dono aprova isso, em eloi-gestao.ts
  // (servicos.aprovar_valor_sugerido). Mesmo padrao de posse que nf.view_url:
  // busca por id e confere s.cliente_id === clienteId antes de aceitar.
  if (action === "servicos.sugerir_valor") {
    if (!body?.servico_id) return json({ error: "servico_id obrigatório" }, 400);
    const valorCents = body?.valor_cents;
    if (!Number.isInteger(valorCents) || valorCents <= 0) {
      return json({ error: "valor_cents inválido" }, 400);
    }
    const { data: s } = await supabase.from("eloi_servicos")
      .select("id,cliente_id,pago").eq("id", body?.servico_id).maybeSingle();
    if (!s || s.cliente_id !== clienteId) return json({ error: "não encontrado" }, 404);
    if (s.pago) return json({ error: "serviço já pago" }, 400);

    const observacao = typeof body?.observacao === "string" ? body.observacao.trim() || null : null;
    const { data, error } = await supabase.from("eloi_servicos")
      .update({
        valor_sugerido_cents: valorCents,
        valor_sugerido_em: new Date().toISOString(),
        valor_sugerido_observacao: observacao,
      })
      .eq("id", s.id).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ servico: data });
  }

  if (action === "nf.view_url") {
    if (!body?.servico_id) return json({ error: "servico_id obrigatório" }, 400);
    const { data: s } = await supabase.from("eloi_servicos")
      .select("cliente_id,nf_arquivo_url").eq("id", body.servico_id).maybeSingle();
    if (!s || s.cliente_id !== clienteId || !s.nf_arquivo_url) return json({ error: "não encontrado" }, 404);
    const { data, error } = await supabase.storage.from(NF_BUCKET).createSignedUrl(s.nf_arquivo_url, 120);
    if (error) return json({ error: error.message }, 500);
    return json({ url: data.signedUrl });
  }

  // rascunho é preço/itens ainda em construção — a F2 (quem define valor) não
  // pode ver antes do estúdio decidir enviar. Vazaria posição de negociação.
  if (action === "orcamentos.list") {
    const { data, error } = await supabase.from("orcamentos")
      .select("id,titulo,status,valor_total,share_token,created_at")
      .eq("cliente_id", clienteId).neq("status", "rascunho")
      .order("created_at", { ascending: false });
    if (error) return json({ error: error.message }, 500);
    return json({ orcamentos: data });
  }

  if (action === "marca.manifest") {
    const manifestPath = `${clienteId}/marca/manifest.json`;
    const { data: file, error: dlErr } = await supabase.storage.from(ENTREGAS_BUCKET).download(manifestPath);
    if (dlErr || !file) return json({ manifest: null });
    let manifest: any;
    try { manifest = JSON.parse(await file.text()); } catch (_) { return json({ manifest: null }); }
    const relPaths: string[] = [];
    for (const v of manifest.variacoes ?? []) {
      for (const hex of Object.keys(v.arquivos ?? {})) {
        const f = v.arquivos[hex];
        if (f.svg) relPaths.push(f.svg);
        if (f.png) relPaths.push(f.png);
        if (f.preview) relPaths.push(f.preview);
      }
    }
    if (manifest.slug) relPaths.push(`${manifest.slug}-marca-completa.zip`);
    const fullPaths = relPaths.map((p) => `${clienteId}/marca/${p}`);
    const { data: signed } = await supabase.storage.from(ENTREGAS_BUCKET).createSignedUrls(fullPaths, 600);
    const urls: Record<string, string> = {};
    (signed ?? []).forEach((s: any, i: number) => { if (s.signedUrl) urls[relPaths[i]] = s.signedUrl; });
    return json({ manifest, urls });
  }

  // entregas.list saiu daqui: listava o Storage cru (storage.list()), sem
  // filtro de publicação — rascunho virava baixável. Quem lista pro cliente
  // agora é sempre materiais.list, que filtra status = 'publicado'. Bug 0.2
  // de docs/ROTEIRO-SISTEMA-2026-08-28.md.
  if (action === "entregas.view_url") {
    const p = body?.path;
    if (!p || typeof p !== "string" || !p.startsWith(`${clienteId}/`)) return json({ error: "acesso negado" }, 403);
    const { data, error } = await supabase.storage.from(ENTREGAS_BUCKET).createSignedUrl(p, 120);
    if (error) return json({ error: error.message }, 500);
    return json({ url: data.signedUrl });
  }

  // Materiais novos (eloi_materiais): cliente só vê PUBLICADO, e só os dele —
  // cliente_id vem da sessão, nunca do body. Download via entregas.view_url
  // (o path já é validado contra o clienteId da sessão lá).
  if (action === "materiais.list") {
    const { data, error } = await supabase.from("eloi_materiais")
      .select("id,titulo,descricao,categoria,versao,path,published_at")
      .eq("cliente_id", clienteId).eq("status", "publicado")
      .order("published_at", { ascending: false });
    if (error) return json({ error: error.message }, 500);
    return json({ materiais: data });
  }

  if (action === "briefings.list") {
    const { data, error } = await supabase.from("briefing_links")
      .select("id,tipo,status,created_at,responded_at")
      .eq("cliente_id", clienteId).order("created_at", { ascending: false });
    if (error) return json({ error: error.message }, 500);
    return json({ briefings: data });
  }

  return json({ error: "ação inválida" }, 400);
});
