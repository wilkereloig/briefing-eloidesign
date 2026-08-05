import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdmin } from "./_shared/auth.ts";

// Gestao ELOI — nucleo financeiro (eloi_contas, eloi_categorias, eloi_transacoes,
// eloi_recorrencias, eloi_notas_fiscais, eloi_metas, eloi_arquivos).
//
// O que EXIGE servidor e nao pode ficar so no cliente (secao 29 do briefing):
//  · parcelamento — quem divide o valor e o servidor, senao dois clientes
//    arredondam diferente e a soma das parcelas deixa de bater com o total;
//  · liquidacao — recebido_cents nunca pode passar de valor_cents e o status
//    deriva do valor, nao da escolha da tela;
//  · geracao de recorrencia — precisa ser idempotente por competencia, senao
//    abrir o painel duas vezes no mesmo dia lanca a assinatura duas vezes.
//
// Leitura agregada (saldo, resultado, previsao) fica no cliente, em
// app/src/domain/financeiro.ts: sao contas puras sobre dados ja carregados.

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

const EM_ABERTO = ["previsto", "pendente", "parcial", "vencido"];
// Mesmo bucket privado que ja guarda as notas do painel legado.
const ARQUIVOS_BUCKET = "eloi-notas";

/** Espelha dividirParcelas() de app/src/domain/financeiro.ts — o resto da
 *  divisao vai inteiro na primeira parcela para nao sumir centavo. Se um dia
 *  mudar, mudar nos dois. */
function dividirParcelas(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const resto = total - base * n;
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + resto : base));
}

/** Espelha dataDaParcela(): dia 31 em mes de 30 cai no ultimo dia do mes. */
function dataDaParcela(inicio: string, i: number): string {
  const [a, m, d] = inicio.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + i, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

const PASSO_MESES: Record<string, number> = {
  mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12,
};

function avancar(data: string, periodicidade: string): string {
  if (periodicidade === "semanal") {
    return new Date(Date.parse(data) + 7 * 86_400_000).toISOString().slice(0, 10);
  }
  if (periodicidade === "quinzenal") {
    return new Date(Date.parse(data) + 15 * 86_400_000).toISOString().slice(0, 10);
  }
  return dataDaParcela(data, PASSO_MESES[periodicidade] ?? 1);
}

/** Status derivado do quanto entrou — nunca vem escolhido pela tela. */
function statusPorValor(valor: number, recebido: number, vencimento: string | null, hoje: string): string {
  if (recebido >= valor) return "realizado";
  if (recebido > 0) return "parcial";
  if (vencimento && vencimento < hoje) return "vencido";
  return "pendente";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* corpo nao-JSON */ }
  const action = body?.action || "";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (!(await requireAdmin(supabase, body?.token))) return json({ error: "unauthorized" }, 401);

  const hoje = new Date().toISOString().slice(0, 10);

  // ── BOOTSTRAP ──────────────────────────────────────────────────────────────
  // Dados de referencia numa chamada so: sao tabelas pequenas e toda tela usa.
  if (action === "bootstrap") {
    const [contas, categorias, recorrencias, metas] = await Promise.all([
      supabase.from("eloi_contas").select("*").order("contexto").order("nome"),
      supabase.from("eloi_categorias").select("*").eq("ativa", true).order("nome"),
      supabase.from("eloi_recorrencias").select("*").eq("ativa", true).order("proxima_cobranca"),
      supabase.from("eloi_metas").select("*").eq("ativa", true).order("inicio", { ascending: false }),
    ]);
    const erro = contas.error || categorias.error || recorrencias.error || metas.error;
    if (erro) return json({ error: erro.message }, 500);
    return json({
      contas: contas.data ?? [], categorias: categorias.data ?? [],
      recorrencias: recorrencias.data ?? [], metas: metas.data ?? [],
    });
  }

  // ── TRANSACOES ─────────────────────────────────────────────────────────────
  if (action === "transacoes.list") {
    const f = body?.filtro ?? {};
    let q = supabase.from("eloi_transacoes").select("*");
    if (f.contexto) q = q.eq("contexto", f.contexto);
    if (f.conta_id) q = q.or(`conta_id.eq.${f.conta_id},conta_destino_id.eq.${f.conta_id}`);
    if (f.cliente_id) q = q.eq("cliente_id", f.cliente_id);
    if (f.categoria_id) q = q.eq("categoria_id", f.categoria_id);
    if (f.tipo) q = q.eq("tipo", f.tipo);
    if (f.status) q = q.eq("status", f.status);
    if (f.em_aberto) q = q.in("status", EM_ABERTO);
    // Janela por competencia. Sem janela o painel puxaria o historico inteiro —
    // o briefing pede explicitamente para nao carregar tudo de uma vez.
    if (f.de) q = q.gte("data_competencia", f.de);
    if (f.ate) q = q.lte("data_competencia", f.ate);
    const limite = Math.min(Number(f.limite) || 500, 2000);
    const { data, error } = await q
      .order("data_competencia", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(limite);
    if (error) return json({ error: error.message }, 500);
    return json({ transacoes: data ?? [] });
  }

  if (action === "transacoes.upsert") {
    const t = body?.transacao ?? {};
    if (!t.descricao || !t.tipo || !t.contexto) return json({ error: "descricao, tipo e contexto sao obrigatorios" }, 400);
    if (!(Number(t.valor_cents) > 0)) return json({ error: "valor deve ser maior que zero" }, 400);
    if (t.tipo === "transferencia" && (!t.conta_id || !t.conta_destino_id || t.conta_id === t.conta_destino_id)) {
      return json({ error: "transferencia exige conta de origem e destino diferentes" }, 400);
    }
    const recebido = Number(t.recebido_cents) || 0;
    if (recebido > Number(t.valor_cents)) return json({ error: "recebido nao pode passar do valor" }, 400);

    const linha = {
      ...t,
      recebido_cents: recebido,
      status: t.status || statusPorValor(Number(t.valor_cents), recebido, t.data_vencimento ?? null, hoje),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("eloi_transacoes").upsert(linha).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ transacao: data });
  }

  // Registrar pagamento (total ou parcial). O status sai do valor, nao da tela.
  if (action === "transacoes.liquidar") {
    const { id, valor_cents, data_liquidacao, forma_pagamento } = body ?? {};
    if (!id) return json({ error: "id obrigatorio" }, 400);
    const { data: atual, error: e1 } = await supabase
      .from("eloi_transacoes").select("*").eq("id", id).single();
    if (e1 || !atual) return json({ error: e1?.message || "transacao nao encontrada" }, 404);

    const soma = Number(atual.recebido_cents) + (Number(valor_cents) || 0);
    if (soma > Number(atual.valor_cents)) {
      return json({ error: "pagamento excede o valor em aberto" }, 400);
    }
    const status = statusPorValor(Number(atual.valor_cents), soma, atual.data_vencimento, hoje);
    const { data, error } = await supabase.from("eloi_transacoes").update({
      recebido_cents: soma,
      status,
      data_liquidacao: data_liquidacao || hoje,
      forma_pagamento: forma_pagamento ?? atual.forma_pagamento,
      updated_at: new Date().toISOString(),
    }).eq("id", id).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ transacao: data });
  }

  // Compra parcelada: uma linha por parcela, irmas por grupo_id.
  if (action === "transacoes.parcelar") {
    const t = body?.transacao ?? {};
    const n = Number(body?.parcelas) || 0;
    if (n < 2) return json({ error: "use transacoes.upsert para parcela unica" }, 400);
    if (n > 120) return json({ error: "maximo de 120 parcelas" }, 400);
    if (!(Number(t.valor_cents) > 0)) return json({ error: "valor deve ser maior que zero" }, 400);
    const inicio = t.data_vencimento || hoje;
    const valores = dividirParcelas(Number(t.valor_cents), n);
    const grupo = crypto.randomUUID();

    const linhas = valores.map((v, i) => ({
      ...t,
      id: undefined,
      grupo_id: grupo,
      parcela_num: i + 1,
      parcela_de: n,
      valor_cents: v,
      recebido_cents: 0,
      status: "previsto",
      data_vencimento: dataDaParcela(inicio, i),
      data_competencia: t.data_competencia ? dataDaParcela(t.data_competencia, i) : dataDaParcela(inicio, i),
      descricao: `${t.descricao} (${i + 1}/${n})`,
    }));
    const { data, error } = await supabase.from("eloi_transacoes").insert(linhas).select();
    if (error) return json({ error: error.message }, 500);
    return json({ transacoes: data ?? [], grupo_id: grupo });
  }

  if (action === "transacoes.remover") {
    const { id, grupo_id } = body ?? {};
    if (!id && !grupo_id) return json({ error: "id ou grupo_id obrigatorio" }, 400);
    // Remover o grupo inteiro e o comportamento esperado de "cancelar o
    // parcelamento"; remover uma parcela sozinha deixaria 3/12 orfa.
    const q = grupo_id
      ? supabase.from("eloi_transacoes").delete().eq("grupo_id", grupo_id)
      : supabase.from("eloi_transacoes").delete().eq("id", id);
    const { error } = await q;
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  // ── RECORRENCIAS ───────────────────────────────────────────────────────────
  if (action === "recorrencias.upsert") {
    const r = body?.recorrencia ?? {};
    if (!r.nome || !r.contexto) return json({ error: "nome e contexto sao obrigatorios" }, 400);
    if (!(Number(r.valor_cents) > 0)) return json({ error: "valor deve ser maior que zero" }, 400);
    if (!r.proxima_cobranca) r.proxima_cobranca = r.inicio || hoje;
    const { data, error } = await supabase.from("eloi_recorrencias").upsert(r).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ recorrencia: data });
  }

  // Materializa as cobrancas devidas ate hoje. Idempotente: antes de lancar,
  // confere se ja existe transacao daquela recorrencia naquele vencimento.
  if (action === "recorrencias.gerar") {
    const { data: recs, error: e1 } = await supabase
      .from("eloi_recorrencias").select("*").eq("ativa", true).is("encerrada_em", null)
      .lte("proxima_cobranca", hoje);
    if (e1) return json({ error: e1.message }, 500);

    const criadas: unknown[] = [];
    for (const r of recs ?? []) {
      if (r.pausada_em) continue;
      let proxima: string = r.proxima_cobranca;
      // teto de 24 ciclos por chamada: recorrencia antiga e esquecida nao pode
      // virar loop infinito nem despejar centenas de linhas de uma vez
      for (let i = 0; i < 24 && proxima <= hoje; i++) {
        if (r.fim && proxima > r.fim) break;
        const { data: existente } = await supabase.from("eloi_transacoes")
          .select("id").eq("recorrencia_id", r.id).eq("data_vencimento", proxima).limit(1);
        if (!existente?.length) {
          const { data: nova } = await supabase.from("eloi_transacoes").insert({
            tipo: r.tipo, contexto: r.contexto, status: "pendente",
            descricao: r.nome, valor_cents: r.valor_cents,
            conta_id: r.conta_id, categoria_id: r.categoria_id, fornecedor: r.fornecedor,
            data_competencia: proxima, data_vencimento: proxima,
            recorrencia_id: r.id,
          }).select().single();
          if (nova) criadas.push(nova);
        }
        proxima = avancar(proxima, r.periodicidade);
      }
      await supabase.from("eloi_recorrencias").update({ proxima_cobranca: proxima }).eq("id", r.id);
    }
    return json({ criadas: criadas.length, transacoes: criadas });
  }

  // ── NOTAS FISCAIS ──────────────────────────────────────────────────────────
  if (action === "nf.list") {
    const f = body?.filtro ?? {};
    let q = supabase.from("eloi_notas_fiscais").select("*");
    if (f.status) q = q.eq("status", f.status);
    if (f.cliente_id) q = q.eq("cliente_id", f.cliente_id);
    const { data, error } = await q.order("competencia", { ascending: false, nullsFirst: false }).limit(500);
    if (error) return json({ error: error.message }, 500);
    return json({ notas: data ?? [] });
  }

  if (action === "nf.upsert") {
    const nf = body?.nota ?? {};
    if (!(Number(nf.valor_cents) >= 0)) return json({ error: "valor invalido" }, 400);
    // emitida sem numero e um registro que nao serve pra nada na contabilidade
    if (["emitida", "enviada"].includes(nf.status) && !nf.numero) {
      return json({ error: "nota emitida exige numero" }, 400);
    }
    const { data, error } = await supabase.from("eloi_notas_fiscais").upsert(nf).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ nota: data });
  }

  // ── CONTAS, CATEGORIAS, METAS ──────────────────────────────────────────────
  if (action === "contas.upsert") {
    const c = body?.conta ?? {};
    if (!c.nome || !c.contexto) return json({ error: "nome e contexto sao obrigatorios" }, 400);
    if (c.tipo === "cartao_credito" && (!c.dia_fechamento || !c.dia_vencimento)) {
      return json({ error: "cartao exige dia de fechamento e vencimento" }, 400);
    }
    const { data, error } = await supabase.from("eloi_contas").upsert(c).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ conta: data });
  }

  if (action === "categorias.upsert") {
    const c = body?.categoria ?? {};
    if (!c.nome || !c.contexto) return json({ error: "nome e contexto sao obrigatorios" }, 400);
    const { data, error } = await supabase.from("eloi_categorias").upsert(c).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ categoria: data });
  }

  if (action === "metas.upsert") {
    const m = body?.meta ?? {};
    if (!m.nome || !m.contexto) return json({ error: "nome e contexto sao obrigatorios" }, 400);
    if (!(Number(m.alvo_cents) > 0)) return json({ error: "alvo deve ser maior que zero" }, 400);
    const { data, error } = await supabase.from("eloi_metas").upsert(m).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ meta: data });
  }

  // Desativar preserva historico; apagar meta perderia o registro do que foi
  // planejado — o briefing pede exclusao segura.
  if (action === "metas.desativar") {
    const { id } = body ?? {};
    if (!id) return json({ error: "id obrigatorio" }, 400);
    const { error } = await supabase.from("eloi_metas").update({ ativa: false }).eq("id", id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  // ── ARQUIVOS ───────────────────────────────────────────────────────────────
  if (action === "arquivos.list") {
    const f = body?.filtro ?? {};
    let q = supabase.from("eloi_arquivos").select("*");
    for (const k of ["cliente_id", "servico_id", "transacao_id", "nota_fiscal_id"]) {
      if (f[k]) q = q.eq(k, f[k]);
    }
    if (f.categoria) q = q.eq("categoria", f.categoria);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(500);
    if (error) return json({ error: error.message }, 500);
    return json({ arquivos: data ?? [] });
  }

  // URL assinada de upload: o binario vai direto do navegador pro Storage, sem
  // passar pela function (limite de corpo) e sem expor a service_role.
  if (action === "arquivos.upload_url") {
    const nome = String(body?.nome || "").replace(/[^\w.\-]+/g, "_").slice(0, 120);
    if (!nome) return json({ error: "nome do arquivo obrigatorio" }, 400);
    const caminho = `financeiro/${crypto.randomUUID()}-${nome}`;
    const { data, error } = await supabase.storage.from(ARQUIVOS_BUCKET)
      .createSignedUploadUrl(caminho);
    if (error) return json({ error: error.message }, 500);
    return json({ path: caminho, signedUrl: data.signedUrl, token: data.token });
  }

  // URL assinada de leitura: o bucket e privado, entao o link expira.
  if (action === "arquivos.url") {
    const caminho = String(body?.path || "");
    if (!caminho) return json({ error: "path obrigatorio" }, 400);
    const { data, error } = await supabase.storage.from(ARQUIVOS_BUCKET)
      .createSignedUrl(caminho, 60 * 10);
    if (error) return json({ error: error.message }, 500);
    return json({ url: data.signedUrl });
  }

  if (action === "arquivos.remover") {
    const { id } = body ?? {};
    if (!id) return json({ error: "id obrigatorio" }, 400);
    const { data: arq } = await supabase.from("eloi_arquivos").select("path").eq("id", id).single();
    const { error } = await supabase.from("eloi_arquivos").delete().eq("id", id);
    if (error) return json({ error: error.message }, 500);
    // O binario sai depois do registro: se o storage falhar, sobra um orfao no
    // bucket, que e melhor do que uma linha apontando pra arquivo inexistente.
    if (arq?.path) await supabase.storage.from(ARQUIVOS_BUCKET).remove([arq.path]);
    return json({ ok: true });
  }

  if (action === "arquivos.upsert") {
    const a = body?.arquivo ?? {};
    if (!a.titulo || !a.path) return json({ error: "titulo e path sao obrigatorios" }, 400);
    const donos = ["cliente_id", "servico_id", "transacao_id", "nota_fiscal_id"].filter((k) => a[k]);
    if (!donos.length) return json({ error: "arquivo precisa estar ligado a um registro" }, 400);
    const { data, error } = await supabase.from("eloi_arquivos").upsert(a).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ arquivo: data });
  }

  return json({ error: `acao desconhecida: ${action}` }, 400);
});
