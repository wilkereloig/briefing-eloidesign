import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdmin } from "./_shared/auth.ts";
import {
  chavesComSequencia, dataDaParcela, hojeEmSaoPaulo, planejarPagamentoFatura, planoDeParcelasEmprestimo, statusPorValor,
  vencimentoDaFatura,
} from "./_shared/financas.ts";

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Valor que entra em filtro PostgREST montado por string (`or`) precisa ser
 *  validado aqui: virgula e ponto sao separadores da sintaxe do filtro. */
const ehUuid = (v: unknown) => typeof v === "string" && UUID.test(v);
const ehData = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const ehMes = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}$/.test(v);

/** Espelha dividirParcelas() de app/src/domain/financeiro.ts — o resto da
 *  divisao vai inteiro na primeira parcela para nao sumir centavo. Se um dia
 *  mudar, mudar nos dois. */
function dividirParcelas(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const resto = total - base * n;
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + resto : base));
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

/** Cents de verdade: inteiro, finito e >= minimo. `Number(x) > 0` aceitava
 *  12.5 e "1e3" e gravava fracao de centavo. */
const ehCents = (v: unknown, minimo = 0) => Number.isSafeInteger(v) && (v as number) >= minimo;

/** Whitelist de colunas graváveis: só entra no row a chave que (1) está na
 *  lista e (2) veio no corpo. Ausente continua ausente — upsert/update parcial
 *  não zera o que a tela não mandou. Coluna fora da lista (origem, status,
 *  grupo_id, created_at…) nunca vem do corpo. */
function escolher(obj: Record<string, unknown>, campos: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of campos) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

// O que a tela pode escrever em eloi_transacoes. status, origem, grupo_id,
// parcela_*, recorrencia_id, importacao_chave e created_at sao do servidor.
const TRANSACAO_CAMPOS = [
  "tipo", "contexto", "descricao", "valor_cents", "recebido_cents",
  "conta_id", "conta_destino_id", "categoria_id", "cliente_id", "servico_id", "fornecedor",
  "data_competencia", "data_vencimento", "data_liquidacao", "forma_pagamento", "observacoes",
] as const;
const RECORRENCIA_CAMPOS = [
  "id", "nome", "tipo", "contexto", "valor_cents", "periodicidade", "dia_cobranca",
  "conta_id", "categoria_id", "fornecedor", "inicio", "fim", "proxima_cobranca", "observacoes",
] as const;
const CONTA_CAMPOS = [
  "id", "nome", "tipo", "contexto", "instituicao", "cor", "saldo_inicial_cents",
  "limite_cents", "dia_fechamento", "dia_vencimento", "ativa",
] as const;
const CATEGORIA_CAMPOS = ["id", "nome", "contexto", "tipo", "pai_id", "cor", "icone", "ativa"] as const;
const META_CAMPOS = ["id", "especie", "nome", "contexto", "categoria_id", "conta_id", "alvo_cents", "inicio", "fim"] as const;
const NOTA_CAMPOS = [
  "id", "cliente_id", "servico_id", "transacao_id", "numero", "status", "valor_cents",
  "imposto_cents", "competencia", "emitida_em", "enviada_em", "arquivo_path", "observacoes",
] as const;
// Cadastro do emprestimo. id e created_at ficam de fora: id vem a parte (decide
// entre inserir e atualizar).
const EMPRESTIMO_CAMPOS = [
  "nome", "instituicao", "contexto", "conta_id", "categoria_id", "valor_recebido_cents",
  "parcelas_total", "valor_parcela_cents", "primeiro_vencimento", "parcelas_pagas_antes",
  "ativo", "observacoes",
] as const;
const ARQUIVO_CAMPOS = [
  "id", "titulo", "path", "mime", "tamanho_bytes", "categoria",
  "cliente_id", "servico_id", "transacao_id", "nota_fiscal_id",
] as const;
/** Formato exato que arquivos.upload_url gera. Sem isso eloi_arquivos.path
 *  aceitava qualquer caminho do bucket — inclusive o PDF de uma nota fiscal,
 *  que arquivos.remover apagaria junto. */
const ARQUIVO_PATH = /^financeiro\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[\w.\-]{1,120}$/i;
const ehDia = (v: unknown) => v == null || (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 31);

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

  // Fuso do estudio, nao UTC: decide o que esta "vencido".
  const hoje = hojeEmSaoPaulo();

  // ── BOOTSTRAP ──────────────────────────────────────────────────────────────
  // Dados de referencia numa chamada so: sao tabelas pequenas e toda tela usa.
  if (action === "bootstrap") {
    const [contas, categorias, recorrencias, metas, conferencias, emprestimos] = await Promise.all([
      supabase.from("eloi_contas").select("*").order("contexto").order("nome"),
      supabase.from("eloi_categorias").select("*").eq("ativa", true).order("nome"),
      supabase.from("eloi_recorrencias").select("*").eq("ativa", true).order("proxima_cobranca"),
      supabase.from("eloi_metas").select("*").eq("ativa", true).order("inicio", { ascending: false }),
      // Ultimas conferencias: o card da conta mostra a mais recente.
      supabase.from("eloi_conferencias").select("*").order("data", { ascending: false }).limit(100),
      supabase.from("eloi_emprestimos").select("*").order("created_at"),
    ]);
    const erro = contas.error || categorias.error || recorrencias.error || metas.error || conferencias.error
      || emprestimos.error;
    if (erro) return json({ error: erro.message }, 500);
    return json({
      contas: contas.data ?? [], categorias: categorias.data ?? [],
      recorrencias: recorrencias.data ?? [], metas: metas.data ?? [],
      conferencias: conferencias.data ?? [], emprestimos: emprestimos.data ?? [],
    });
  }

  // ── TRANSACOES ─────────────────────────────────────────────────────────────
  if (action === "transacoes.list") {
    const f = body?.filtro ?? {};
    if (f.conta_id && !ehUuid(f.conta_id)) return json({ error: "conta_id invalido" }, 400);
    const de = ehData(f.de) ? f.de : null;
    const ate = ehData(f.ate) ? f.ate : null;
    if ((f.de && !de) || (f.ate && !ate)) return json({ error: "janela invalida" }, 400);
    // Builder novo a cada pagina: o do supabase-js nao e reutilizavel depois do await.
    const montar = () => {
      let q = supabase.from("eloi_transacoes").select("*");
      if (f.contexto) q = q.eq("contexto", f.contexto);
      if (f.conta_id) q = q.or(`conta_id.eq.${f.conta_id},conta_destino_id.eq.${f.conta_id}`);
      if (f.cliente_id) q = q.eq("cliente_id", f.cliente_id);
      if (f.categoria_id) q = q.eq("categoria_id", f.categoria_id);
      if (f.tipo) q = q.eq("tipo", f.tipo);
      if (f.status) q = q.eq("status", f.status);
      if (f.em_aberto) q = q.in("status", EM_ABERTO);
      // Janela opcional por competencia, com FALLBACK para vencimento: um
      // lancamento sem competencia explicita era excluido pelo gte/lte (NULL
      // nunca satisfaz comparacao). O front usa a mesma cascata em competenciaDe().
      // O /admin nao manda janela desde 2026-10-08: saldo precisa do historico inteiro.
      if (de || ate) {
        const faixa = (col: string) =>
          [de ? `${col}.gte.${de}` : null, ate ? `${col}.lte.${ate}` : null]
            .filter(Boolean).join(",");
        q = q.or(`and(data_competencia.not.is.null,${faixa("data_competencia")}),` +
          `and(data_competencia.is.null,data_vencimento.not.is.null,${faixa("data_vencimento")}),` +
          `and(data_competencia.is.null,data_vencimento.is.null)`);
      }
      return q.order("data_competencia", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false }).order("id");
    };
    // Paginado: o PostgREST corta cada resposta no max-rows do projeto (1000
    // por padrao). ponytail: historico inteiro em memoria; teto 20000 linhas —
    // passando disso, mover saldo para agregacao no banco.
    const limite = Math.min(Number(f.limite) || 500, 20000);
    const PAGINA = 1000;
    const todas: unknown[] = [];
    while (todas.length < limite) {
      const pedido = Math.min(PAGINA, limite - todas.length);
      const { data, error } = await montar().range(todas.length, todas.length + pedido - 1);
      if (error) return json({ error: error.message }, 500);
      todas.push(...(data ?? []));
      if ((data?.length ?? 0) < pedido) break; // ultima pagina
    }
    return json({ transacoes: todas });
  }

  if (action === "transacoes.upsert") {
    const t = body?.transacao ?? {};
    if (!t.descricao || !t.tipo || !t.contexto) return json({ error: "descricao, tipo e contexto sao obrigatorios" }, 400);
    if (!ehCents(t.valor_cents, 1)) return json({ error: "valor_cents deve ser inteiro maior que zero" }, 400);
    if (t.recebido_cents != null && !ehCents(t.recebido_cents)) {
      return json({ error: "recebido_cents deve ser inteiro nao negativo" }, 400);
    }
    for (const k of ["data_competencia", "data_vencimento", "data_liquidacao"]) {
      if (t[k] != null && !ehData(t[k])) return json({ error: `${k} invalida` }, 400);
    }
    if (t.tipo === "transferencia" && (!t.conta_id || !t.conta_destino_id || t.conta_id === t.conta_destino_id)) {
      return json({ error: "transferencia exige conta de origem e destino diferentes" }, 400);
    }
    if (t.tipo !== "transferencia" && !t.conta_id) {
      return json({ error: "receita e despesa exigem conta" }, 400);
    }

    // EDICAO: o formulario nao reenvia o que ja foi liquidado. Sem ler a linha
    // atual, `recebido_cents` voltaria a zero e um pagamento parcial registrado
    // desapareceria ao corrigir a descricao do lancamento.
    let anterior: Record<string, unknown> | null = null;
    if (t.id) {
      if (!ehUuid(t.id)) return json({ error: "id invalido" }, 400);
      const { data: atual } = await supabase.from("eloi_transacoes")
        .select("recebido_cents,status,data_liquidacao,data_vencimento").eq("id", t.id).maybeSingle();
      // id que nao existe nao vira insert com id escolhido pela tela.
      if (!atual) return json({ error: "transacao nao encontrada" }, 404);
      anterior = atual;
    }
    const valor = t.valor_cents as number;
    const recebido = t.recebido_cents != null ? t.recebido_cents as number : Number(anterior?.recebido_cents) || 0;
    if (recebido > valor) return json({ error: "recebido nao pode passar do valor" }, 400);
    const vencimento = (t.data_vencimento !== undefined ? t.data_vencimento : anterior?.data_vencimento) as string | null ?? null;

    // Sem `...t`: so entra coluna da whitelist. status sempre derivado aqui.
    const linha: Record<string, unknown> = {
      ...escolher(t, TRANSACAO_CAMPOS),
      // transferencia nao tem categoria de resultado: ela e neutra por definicao
      categoria_id: t.tipo === "transferencia" ? null : t.categoria_id ?? null,
      conta_destino_id: t.tipo === "transferencia" ? t.conta_destino_id : null,
      recebido_cents: recebido,
      // competencia cai no vencimento quando a tela nao informa: sem nenhuma das
      // duas o lancamento nao teria mes ao qual pertencer no relatorio
      data_competencia: t.data_competencia ?? t.data_vencimento ?? null,
      // Liquidacao acompanha o recebido: nada recebido, nada liquidado.
      data_liquidacao: recebido > 0 ? (t.data_liquidacao ?? anterior?.data_liquidacao ?? hoje) : null,
      // Cancelado so volta por transacoes.cancelar (reabrir:true) — editar
      // descricao/valor de um lancamento cancelado nao pode ressuscita-lo.
      status: anterior?.status === "cancelado" ? "cancelado" : statusPorValor(valor, recebido, vencimento, hoje),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = anterior
      ? await supabase.from("eloi_transacoes").update(linha).eq("id", t.id).select().single()
      : await supabase.from("eloi_transacoes").insert(linha).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ transacao: data });
  }

  // Estorno: cancelar preserva o historico (o lancamento continua na lista com
  // o chip "Cancelado") e zera o efeito em saldo e resultado — o dominio ignora
  // cancelado em saldoConta/resultado. Reabrir devolve o status derivado do
  // quanto ja tinha entrado.
  if (action === "transacoes.cancelar") {
    const { id, reabrir } = body ?? {};
    if (!id) return json({ error: "id obrigatorio" }, 400);
    const { data: atual, error: e1 } = await supabase
      .from("eloi_transacoes").select("*").eq("id", id).single();
    if (e1 || !atual) return json({ error: e1?.message || "transacao nao encontrada" }, 404);

    const status = reabrir
      ? statusPorValor(Number(atual.valor_cents), Number(atual.recebido_cents), atual.data_vencimento, hoje)
      : "cancelado";
    const { data, error } = await supabase.from("eloi_transacoes")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ transacao: data });
  }

  // Registrar pagamento (total ou parcial). O status sai do valor, nao da tela.
  if (action === "transacoes.liquidar") {
    const { id, valor_cents, data_liquidacao, forma_pagamento, conta_id, observacoes } = body ?? {};
    if (conta_id != null && !ehUuid(conta_id)) return json({ error: "conta_id invalido" }, 400);
    if (!id) return json({ error: "id obrigatorio" }, 400);
    if (!ehCents(valor_cents, 1)) return json({ error: "valor_cents deve ser inteiro maior que zero" }, 400);
    if (data_liquidacao != null && !ehData(data_liquidacao)) return json({ error: "data_liquidacao invalida" }, 400);
    const { data: atual, error: e1 } = await supabase
      .from("eloi_transacoes").select("*").eq("id", id).single();
    if (e1 || !atual) return json({ error: e1?.message || "transacao nao encontrada" }, 404);
    if (atual.status === "cancelado") {
      return json({ error: "lancamento cancelado: reabra antes de liquidar" }, 400);
    }

    const soma = Number(atual.recebido_cents) + valor_cents;
    if (soma > Number(atual.valor_cents)) {
      return json({ error: "pagamento excede o valor em aberto" }, 400);
    }
    const status = statusPorValor(Number(atual.valor_cents), soma, atual.data_vencimento, hoje);
    // Observacao da baixa vai para o rodape do que ja existe: quem recebeu em
    // duas vezes quer ver as duas anotacoes, nao a ultima sobrescrevendo.
    const nota = typeof observacoes === "string" && observacoes.trim()
      ? [atual.observacoes, `${data_liquidacao || hoje}: ${observacoes.trim()}`].filter(Boolean).join("\n")
      : atual.observacoes;
    const { data, error } = await supabase.from("eloi_transacoes").update({
      recebido_cents: soma,
      status,
      data_liquidacao: data_liquidacao || hoje,
      forma_pagamento: forma_pagamento ?? atual.forma_pagamento,
      // Conta em que o dinheiro caiu, quando difere da prevista.
      conta_id: conta_id ?? atual.conta_id,
      observacoes: nota,
      updated_at: new Date().toISOString(),
    }).eq("id", id).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ transacao: data });
  }

  // Reagendar so mexe no vencimento. O status volta a ser derivado: uma conta
  // vencida que ganha data futura deixa de ser "vencido" sem ninguem escolher.
  if (action === "transacoes.reagendar") {
    const { id, data_vencimento } = body ?? {};
    if (!id) return json({ error: "id obrigatorio" }, 400);
    if (!ehData(data_vencimento)) return json({ error: "data_vencimento invalida" }, 400);
    const { data: atual, error: e1 } = await supabase
      .from("eloi_transacoes").select("*").eq("id", id).single();
    if (e1 || !atual) return json({ error: e1?.message || "transacao nao encontrada" }, 404);
    if (atual.status === "cancelado" || atual.status === "realizado") {
      return json({ error: "so lancamento em aberto pode ser reagendado" }, 400);
    }
    const status = statusPorValor(Number(atual.valor_cents), Number(atual.recebido_cents), data_vencimento, hoje);
    const { data, error } = await supabase.from("eloi_transacoes")
      .update({ data_vencimento, status, updated_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ transacao: data });
  }

  // Compra parcelada: uma linha por parcela, irmas por grupo_id.
  if (action === "transacoes.parcelar") {
    const t = body?.transacao ?? {};
    const n = Number(body?.parcelas) || 0;
    if (n < 2) return json({ error: "use transacoes.upsert para parcela unica" }, 400);
    if (n > 120) return json({ error: "maximo de 120 parcelas" }, 400);
    if (!ehCents(t.valor_cents, 1)) return json({ error: "valor_cents deve ser inteiro maior que zero" }, 400);
    // Mesmas exigencias do upsert: parcelar nao e porta dos fundos pra gravar
    // linha invalida em lote.
    if (!t.descricao || !t.tipo || !t.contexto) return json({ error: "descricao, tipo e contexto sao obrigatorios" }, 400);
    if (t.tipo === "transferencia") return json({ error: "transferencia nao e parcelada" }, 400);
    if (!t.conta_id) return json({ error: "parcelamento exige conta" }, 400);
    const inicio = t.data_vencimento || hoje;
    const valores = dividirParcelas(Number(t.valor_cents), n);
    const grupo = crypto.randomUUID();

    // Molde pela mesma whitelist do upsert — `id` nao esta nela. (Antes era
    // `{ id, ...molde } = t`: tirava o id, mas deixava passar status, origem e
    // qualquer outra coluna do corpo.) Chave ausente fica ausente em todas as
    // linhas: o postgrest-js normaliza as chaves do lote e completaria com null.
    const molde = escolher(t, TRANSACAO_CAMPOS);

    const linhas = valores.map((v, i) => ({
      ...molde,
      origem: "parcelamento",
      grupo_id: grupo,
      parcela_num: i + 1,
      parcela_de: n,
      valor_cents: v,
      recebido_cents: 0,
      data_liquidacao: null,
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

  // ── EMPRESTIMOS ────────────────────────────────────────────────────────────
  // Sem id: cadastra E gera as parcelas que faltam (as pagas antes de entrar no
  // sistema nao viram transacao). Com id: so os campos editaveis — nunca regenera
  // parcela, e os campos estruturais (que moldaram as parcelas) nao podem mudar:
  // senao o cadastro divergiria dos lancamentos ja gerados/liquidados.
  if (action === "emprestimos.upsert") {
    const b = body?.emprestimo ?? {};
    const e = escolher(b, EMPRESTIMO_CAMPOS);
    const id = b.id;
    if (id != null && !ehUuid(id)) return json({ error: "id invalido" }, 400);
    const criar = id == null;
    // Tipos na borda: sem isso o Postgres devolveria 500 (check/uuid/boolean invalido).
    if ("nome" in e && (typeof e.nome !== "string" || !e.nome.trim())) {
      return json({ error: "nome deve ser texto nao vazio" }, 400);
    }
    if ("contexto" in e && e.contexto !== "pessoal" && e.contexto !== "empresa") {
      return json({ error: "contexto deve ser 'pessoal' ou 'empresa'" }, 400);
    }
    if ("ativo" in e && typeof e.ativo !== "boolean") {
      return json({ error: "ativo deve ser booleano" }, 400);
    }
    // Na criacao tudo que a regra exige tem de vir; na edicao so valida o que veio.
    if (criar) {
      if (!e.nome || !e.contexto) return json({ error: "nome e contexto sao obrigatorios" }, 400);
      e.valor_recebido_cents ??= 0;
      e.parcelas_pagas_antes ??= 0;
      if (e.parcelas_total === undefined || e.valor_parcela_cents === undefined || e.primeiro_vencimento === undefined) {
        return json({ error: "parcelas_total, valor_parcela_cents e primeiro_vencimento sao obrigatorios" }, 400);
      }
    }
    if ("valor_recebido_cents" in e && !ehCents(e.valor_recebido_cents)) {
      return json({ error: "valor_recebido_cents deve ser inteiro nao negativo" }, 400);
    }
    if ("valor_parcela_cents" in e && !ehCents(e.valor_parcela_cents, 1)) {
      return json({ error: "valor_parcela_cents deve ser inteiro maior que zero" }, 400);
    }
    // Teto de 600: parcelas viram linhas num insert so; 1e9 por engano travaria a function.
    if ("parcelas_total" in e && !(ehCents(e.parcelas_total, 1) && (e.parcelas_total as number) <= 600)) {
      return json({ error: "parcelas_total deve ser inteiro entre 1 e 600" }, 400);
    }
    if ("parcelas_pagas_antes" in e && !ehCents(e.parcelas_pagas_antes)) {
      return json({ error: "parcelas_pagas_antes deve ser inteiro nao negativo" }, 400);
    }
    if (e.parcelas_total !== undefined && e.parcelas_pagas_antes !== undefined
      && (e.parcelas_pagas_antes as number) > (e.parcelas_total as number)) {
      return json({ error: "parcelas_pagas_antes nao pode passar de parcelas_total" }, 400);
    }
    if ("primeiro_vencimento" in e && !ehData(e.primeiro_vencimento)) {
      return json({ error: "primeiro_vencimento invalido" }, 400);
    }
    for (const k of ["conta_id", "categoria_id"]) {
      if (e[k] != null && !ehUuid(e[k])) return json({ error: `${k} invalido` }, 400);
    }

    if (!criar) {
      const { data: atual, error: eAtual } = await supabase.from("eloi_emprestimos")
        .select("*").eq("id", id).maybeSingle();
      if (eAtual) return json({ error: eAtual.message }, 500);
      if (!atual) return json({ error: "emprestimo nao encontrado" }, 404);
      // Igual ao gravado passa (a tela manda o objeto inteiro); diferente, nao.
      const ESTRUTURAIS = ["parcelas_total", "valor_parcela_cents", "primeiro_vencimento", "parcelas_pagas_antes", "contexto"];
      if (ESTRUTURAIS.some((k) => k in e && String(e[k]) !== String(atual[k]))) {
        return json({
          error: "parcelas ja geradas: para mudar valor, quantidade, datas ou contexto, encerre este emprestimo e cadastre outro",
        }, 409);
      }
      const editavel = escolher(e, ["nome", "instituicao", "conta_id", "categoria_id", "valor_recebido_cents", "observacoes", "ativo"]);
      const { data, error } = await supabase.from("eloi_emprestimos")
        .update(editavel).eq("id", id).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ emprestimo: data });
    }

    // Categoria padrao: 'Emprestimos e dividas' (saida) do mesmo contexto, se existir.
    if (e.categoria_id == null) {
      const { data: cat, error: eCat } = await supabase.from("eloi_categorias").select("id")
        .eq("nome", "Empréstimos e dívidas").eq("contexto", e.contexto).eq("tipo", "saida").limit(1);
      if (eCat) return json({ error: eCat.message }, 500);
      e.categoria_id = cat?.[0]?.id ?? null;
    }

    const { data: emp, error: eEmp } = await supabase.from("eloi_emprestimos").insert(e).select().single();
    if (eEmp) return json({ error: eEmp.message }, 500);

    const plano = planoDeParcelasEmprestimo(emp);
    const linhas = plano.map((p) => ({
      tipo: "saida",
      contexto: emp.contexto,
      descricao: `${emp.nome} (${p.parcela_num}/${emp.parcelas_total})`,
      valor_cents: p.valor_cents,
      recebido_cents: 0,
      status: statusPorValor(p.valor_cents, 0, p.vencimento, hoje),
      conta_id: emp.conta_id,
      categoria_id: emp.categoria_id,
      fornecedor: emp.instituicao,
      data_competencia: p.vencimento,
      data_vencimento: p.vencimento,
      parcela_num: p.parcela_num,
      parcela_de: emp.parcelas_total,
      origem: "parcelamento",
      emprestimo_id: emp.id,
      grupo_id: emp.id, // parcelas de um emprestimo = um grupo ("excluir grupo" do app)
    }));
    let transacoes: unknown[] = [];
    if (linhas.length) {
      const { data, error } = await supabase.from("eloi_transacoes").insert(linhas).select();
      if (error) {
        // Sem orfao: cadastro sem parcelas e pior que nenhum cadastro.
        const { error: eDel } = await supabase.from("eloi_emprestimos").delete().eq("id", emp.id);
        return json({
          error: eDel ? `${error.message} (e o cadastro ${emp.id} nao pode ser desfeito: ${eDel.message})` : error.message,
        }, 500);
      }
      transacoes = data ?? [];
    }
    return json({ emprestimo: emp, transacoes });
  }

  // Encerrar sai do uso (ativo=false) sem apagar nem mexer nas parcelas lancadas.
  if (action === "emprestimos.encerrar") {
    const { id } = body ?? {};
    if (!ehUuid(id)) return json({ error: "id obrigatorio" }, 400);
    const { data, error } = await supabase.from("eloi_emprestimos")
      .update({ ativo: false }).eq("id", id).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ emprestimo: data });
  }

  // ── RECORRENCIAS ───────────────────────────────────────────────────────────
  if (action === "recorrencias.upsert") {
    const r = escolher(body?.recorrencia ?? {}, RECORRENCIA_CAMPOS);
    if (!r.nome || !r.contexto) return json({ error: "nome e contexto sao obrigatorios" }, 400);
    if (!ehCents(r.valor_cents, 1)) return json({ error: "valor_cents deve ser inteiro maior que zero" }, 400);
    for (const k of ["inicio", "fim", "proxima_cobranca"]) {
      if (r[k] != null && !ehData(r[k])) return json({ error: `${k} invalida` }, 400);
    }
    if (!r.proxima_cobranca) r.proxima_cobranca = r.inicio || hoje;
    const { data, error } = await supabase.from("eloi_recorrencias").upsert(r).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ recorrencia: data });
  }

  // Pausar / retomar / encerrar. Nao apaga o que ja foi gerado: a recorrencia e
  // molde, e as transacoes que ela criou sao obrigacoes reais que continuam
  // valendo. Encerrar sai do bootstrap (ativa=false) sem perder o historico.
  if (action === "recorrencias.estado") {
    const { id, estado } = body ?? {};
    if (!id) return json({ error: "id obrigatorio" }, 400);
    if (!["pausar", "retomar", "encerrar"].includes(estado)) {
      return json({ error: "estado deve ser pausar, retomar ou encerrar" }, 400);
    }
    const patch = estado === "pausar"
      ? { pausada_em: new Date().toISOString() }
      : estado === "retomar"
      ? { pausada_em: null, ativa: true, encerrada_em: null }
      : { encerrada_em: new Date().toISOString(), ativa: false };
    const { data, error } = await supabase.from("eloi_recorrencias")
      .update(patch).eq("id", id).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ recorrencia: data });
  }

  // Materializa as cobrancas que vencem ate ANTECEDENCIA_DIAS a frente: conta
  // fixa precisa aparecer antes de vencer, senao o aviso chega no proprio dia.
  // Idempotente: antes de lancar, confere se ja existe transacao daquela
  // recorrencia naquele vencimento.
  if (action === "recorrencias.gerar") {
    const ANTECEDENCIA_DIAS = 10;
    const limite = new Date(Date.parse(hoje) + ANTECEDENCIA_DIAS * 86_400_000).toISOString().slice(0, 10);
    const { data: recs, error: e1 } = await supabase
      .from("eloi_recorrencias").select("*").eq("ativa", true).is("encerrada_em", null)
      .lte("proxima_cobranca", limite);
    if (e1) return json({ error: e1.message }, 500);

    const criadas: unknown[] = [];
    const erros: { recorrencia_id: string; vencimento: string; erro: string }[] = [];
    for (const r of recs ?? []) {
      if (r.pausada_em) continue;
      let proxima: string = r.proxima_cobranca;
      // teto de 24 ciclos por chamada: recorrencia antiga e esquecida nao pode
      // virar loop infinito nem despejar centenas de linhas de uma vez
      for (let i = 0; i < 24 && proxima <= limite; i++) {
        if (r.fim && proxima > r.fim) break;
        const { data: existente, error: eBusca } = await supabase.from("eloi_transacoes")
          .select("id").eq("recorrencia_id", r.id).eq("data_vencimento", proxima).limit(1);
        if (eBusca) { erros.push({ recorrencia_id: r.id, vencimento: proxima, erro: eBusca.message }); break; }
        if (!existente?.length) {
          const { data: nova, error: eNova } = await supabase.from("eloi_transacoes").insert({
            tipo: r.tipo, contexto: r.contexto,
            status: statusPorValor(Number(r.valor_cents), 0, proxima, hoje),
            descricao: r.nome, valor_cents: r.valor_cents,
            conta_id: r.conta_id, categoria_id: r.categoria_id, fornecedor: r.fornecedor,
            data_competencia: proxima, data_vencimento: proxima,
            recorrencia_id: r.id, origem: "recorrencia",
          }).select().single();
          // Falhou: proxima_cobranca PARA aqui. Avancar mesmo assim pulava a
          // cobranca em silencio — a assinatura daquele mes nunca existiria.
          if (eNova) { erros.push({ recorrencia_id: r.id, vencimento: proxima, erro: eNova.message }); break; }
          criadas.push(nova);
        }
        proxima = avancar(proxima, r.periodicidade);
      }
      if (proxima !== r.proxima_cobranca) {
        const { error: eAvanca } = await supabase.from("eloi_recorrencias")
          .update({ proxima_cobranca: proxima }).eq("id", r.id);
        // A idempotencia por vencimento cobre a proxima chamada: nada duplica.
        if (eAvanca) erros.push({ recorrencia_id: r.id, vencimento: proxima, erro: eAvanca.message });
      }
    }
    return json({ criadas: criadas.length, transacoes: criadas, erros });
  }

  // ── IMPORTACAO DE EXTRATO ──────────────────────────────────────────────────
  // A tela ja mostrou o que vai entrar e o dono confirmou. Aqui: validar de
  // novo (nunca confiar so no cliente), pular chave ja importada nesta conta
  // e gravar com origem=importacao. Cartao entra pendente (vai para a fatura);
  // conta comum entra realizado (o extrato e fato consumado).
  if (action === "transacoes.importar") {
    const { conta_id, contexto, linhas } = body ?? {};
    if (!ehUuid(conta_id)) return json({ error: "conta_id invalido" }, 400);
    if (!Array.isArray(linhas) || linhas.length === 0) return json({ error: "nada a importar" }, 400);
    if (linhas.length > 500) return json({ error: "maximo de 500 linhas por importacao" }, 400);
    const { data: conta } = await supabase.from("eloi_contas").select("*").eq("id", conta_id).single();
    if (!conta) return json({ error: "conta nao encontrada" }, 404);
    const ctx = contexto === "pessoal" || contexto === "empresa" ? contexto : conta.contexto;
    const ehCartao = conta.tipo === "cartao_credito";
    // Compra no cartao: competencia = dia da compra (resultado), vencimento =
    // vencimento da FATURA daquele ciclo (quando o dinheiro sai). Antes as duas
    // eram a data da compra e a fatura importada "vencia" no dia de cada compra.
    const cicloOk = ehCartao && conta.dia_fechamento && conta.dia_vencimento;

    const validas: Record<string, unknown>[] = [];
    for (const l of linhas) {
      const cents = Number(l?.valor_cents);
      if (!ehData(l?.data) || !Number.isSafeInteger(cents) || cents === 0) continue;
      const chave = typeof l.chave === "string" && l.chave ? l.chave : `${l.data}|${cents}|${String(l.descricao ?? "").toLowerCase()}`;
      const abs = Math.abs(cents);
      const vencimento = cicloOk
        ? vencimentoDaFatura(l.data, Number(conta.dia_fechamento), Number(conta.dia_vencimento))
        : l.data;
      validas.push({
        tipo: cents > 0 ? "entrada" : "saida",
        contexto: ctx,
        descricao: String(l.descricao ?? "").trim().slice(0, 200) || "Importado",
        valor_cents: abs,
        recebido_cents: ehCartao ? 0 : abs,
        status: ehCartao ? statusPorValor(abs, 0, vencimento, hoje) : "realizado",
        conta_id,
        data_competencia: l.data, data_vencimento: vencimento,
        data_liquidacao: ehCartao ? null : l.data,
        origem: "importacao",
        importacao_chave: chave,
      });
    }
    if (!validas.length) return json({ error: "nenhuma linha valida" }, 400);
    // Linhas identicas no mesmo lote ganham #2, #3… (ver chavesComSequencia).
    chavesComSequencia(validas.map((v) => v.importacao_chave as string))
      .forEach((c, i) => { validas[i].importacao_chave = c; });

    const chaves = validas.map((v) => v.importacao_chave as string);
    const { data: existentes } = await supabase.from("eloi_transacoes")
      .select("importacao_chave").eq("conta_id", conta_id).in("importacao_chave", chaves);
    const ja = new Set((existentes ?? []).map((e: { importacao_chave: string }) => e.importacao_chave));
    const novas = validas.filter((v) => !ja.has(v.importacao_chave as string));
    if (!novas.length) return json({ importadas: 0, ignoradas: validas.length });
    const { error } = await supabase.from("eloi_transacoes").insert(novas);
    if (error) return json({ error: error.message }, 500);
    return json({ importadas: novas.length, ignoradas: validas.length - novas.length });
  }

  // ── PAGAMENTO DE FATURA ────────────────────────────────────────────────────
  // Uma transferencia conta -> cartao (regra 2: pagar fatura nao e despesa; a
  // despesa ja foi cada compra) + baixa das compras em aberto do cartao, da
  // mais antiga para a mais nova. Estorno em aberto entra como credito.
  //
  // O plano (quem quita quanto) sai de planejarPagamentoFatura, pura e testada;
  // a gravacao e UMA chamada a eloi_pagar_fatura (migracao
  // 2026-10-08-pagar-fatura.sql), que insere a transferencia e aplica as baixas
  // na mesma transacao. Falha no meio = nada gravado. A funcao so aplica cada
  // baixa se a linha ainda tiver o recebido_cents lido aqui: dois pagamentos ao
  // mesmo tempo nao quitam a mesma compra duas vezes — o segundo volta 409.
  if (action === "transacoes.pagar_fatura") {
    const { cartao_id, conta_id, valor_cents, data } = body ?? {};
    if (!ehUuid(cartao_id) || !ehUuid(conta_id)) return json({ error: "cartao_id e conta_id obrigatorios" }, 400);
    if (cartao_id === conta_id) return json({ error: "conta de origem e cartao precisam ser diferentes" }, 400);
    if (!ehCents(valor_cents, 1)) return json({ error: "valor_cents deve ser inteiro maior que zero" }, 400);
    if (!ehData(data)) return json({ error: "data invalida" }, 400);

    const { data: contas, error: eContas } = await supabase.from("eloi_contas")
      .select("id,nome,tipo,contexto").in("id", [cartao_id, conta_id]);
    if (eContas) return json({ error: eContas.message }, 500);
    const cartao = (contas ?? []).find((c: { id: string }) => c.id === cartao_id);
    const origem = (contas ?? []).find((c: { id: string }) => c.id === conta_id);
    if (!cartao || cartao.tipo !== "cartao_credito") return json({ error: "cartao nao encontrado" }, 404);
    if (!origem) return json({ error: "conta nao encontrada" }, 404);
    if (origem.tipo === "cartao_credito") return json({ error: "fatura se paga com conta, nao com outro cartao" }, 400);

    const { data: abertas, error: eAbertas } = await supabase.from("eloi_transacoes")
      .select("id,tipo,valor_cents,recebido_cents,data_vencimento,created_at")
      .eq("conta_id", cartao_id).in("tipo", ["saida", "entrada"])
      .not("status", "in", "(realizado,cancelado)");
    if (eAbertas) return json({ error: eAbertas.message }, 500);
    const plano = planejarPagamentoFatura(
      (abertas ?? []).map((l: Record<string, unknown>) => ({
        id: l.id as string, tipo: l.tipo as string,
        valor_cents: Number(l.valor_cents), recebido_cents: Number(l.recebido_cents),
        data_vencimento: (l.data_vencimento as string | null) ?? null, created_at: String(l.created_at),
      })),
      valor_cents, data, hoje,
    );

    const { data: transferencia, error } = await supabase.rpc("eloi_pagar_fatura", {
      p_transferencia: {
        tipo: "transferencia", contexto: cartao.contexto, status: "realizado",
        descricao: `Pagamento da fatura — ${cartao.nome}`,
        valor_cents, recebido_cents: valor_cents,
        conta_id, conta_destino_id: cartao_id, categoria_id: null,
        data_competencia: data, data_vencimento: data, data_liquidacao: data,
        origem: "manual",
      },
      p_baixas: plano.baixas,
    }).single();
    if (error) {
      return /fatura mudou/.test(error.message)
        ? json({ error: "a fatura mudou durante o pagamento — recarregue e tente de novo" }, 409)
        : json({ error: error.message }, 500);
    }
    return json({ transferencia, liquidadas: plano.baixas.length, sobra_cents: plano.sobra_cents });
  }

  // ── CONFERENCIA DE SALDO ───────────────────────────────────────────────────
  // Registro, nao correcao. O saldo do sistema vem calculado pela tela (e a
  // mesma conta que ela mostra); o que se grava e a fotografia. Ajuste so se
  // pedido, e sempre como transacao propria com origem=ajuste.
  if (action === "conferencias.registrar") {
    const { conta_id, data, saldo_informado_cents, saldo_sistema_cents, observacoes, criar_ajuste } = body ?? {};
    if (!ehUuid(conta_id)) return json({ error: "conta_id invalido" }, 400);
    if (!ehData(data)) return json({ error: "data invalida" }, 400);
    const informado = Math.trunc(Number(saldo_informado_cents));
    const sistema = Math.trunc(Number(saldo_sistema_cents));
    if (!Number.isFinite(informado) || !Number.isFinite(sistema)) return json({ error: "saldos invalidos" }, 400);
    const { data: conta } = await supabase.from("eloi_contas").select("*").eq("id", conta_id).single();
    if (!conta) return json({ error: "conta nao encontrada" }, 404);
    const diferenca = informado - sistema;

    let ajuste: unknown = null;
    if (criar_ajuste && diferenca !== 0) {
      const abs = Math.abs(diferenca);
      const { data: t, error: eA } = await supabase.from("eloi_transacoes").insert({
        tipo: diferenca > 0 ? "entrada" : "saida",
        contexto: conta.contexto,
        descricao: `Ajuste de conferência ${data}`,
        valor_cents: abs, recebido_cents: abs, status: "realizado",
        conta_id,
        data_competencia: data, data_vencimento: data, data_liquidacao: data,
        origem: "ajuste",
        observacoes: `Saldo informado ${(informado / 100).toFixed(2)} × sistema ${(sistema / 100).toFixed(2)}${observacoes ? ` — ${String(observacoes).trim()}` : ""}`,
      }).select().single();
      if (eA) return json({ error: eA.message }, 500);
      ajuste = t;
    }
    const { data: conf, error } = await supabase.from("eloi_conferencias").insert({
      conta_id, data,
      saldo_informado_cents: informado, saldo_sistema_cents: sistema, diferenca_cents: diferenca,
      observacoes: typeof observacoes === "string" ? observacoes.trim() || null : null,
      ajuste_transacao_id: (ajuste as { id?: string } | null)?.id ?? null,
    }).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ conferencia: conf, ajuste });
  }

  // ── NOTAS FISCAIS ──────────────────────────────────────────────────────────
  if (action === "nf.list") {
    const f = body?.filtro ?? {};
    let q = supabase.from("eloi_notas_fiscais").select("*");
    if (f.status) q = q.eq("status", f.status);
    if (f.cliente_id) q = q.eq("cliente_id", f.cliente_id);
    // f.mes = 'AAAA-MM'. Sem isso a query nunca teve corte de data — o limit(500)
    // sozinho corta pelas mais recentes e esconde meses antigos do filtro.
    if (f.mes) {
      if (!ehMes(f.mes)) return json({ error: "mes invalido" }, 400);
      const [a, m] = f.mes.split("-").map(Number);
      const de = new Date(Date.UTC(a, m - 1, 1)).toISOString().slice(0, 10);
      const ate = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10);
      q = q.gte("competencia", de).lt("competencia", ate);
    }
    const { data, error } = await q.order("competencia", { ascending: false, nullsFirst: false }).limit(500);
    if (error) return json({ error: error.message }, 500);
    // Serviços cobertos por cada nota (1 nota : N serviços, D-22). Uma consulta
    // para todas as notas da página, não uma por nota.
    const ids = (data ?? []).map((n: { id: string }) => n.id);
    const porNota: Record<string, unknown[]> = {};
    if (ids.length) {
      const { data: svc } = await supabase.from("eloi_servicos")
        .select("id,descricao,valor_cents,nota_fiscal_id,cliente_id,sub_cliente,data_competencia")
        .in("nota_fiscal_id", ids);
      for (const sv of svc ?? []) (porNota[sv.nota_fiscal_id] ??= []).push(sv);
    }
    return json({ notas: (data ?? []).map((n: { id: string }) => ({ ...n, servicos: porNota[n.id] ?? [] })) });
  }

  if (action === "nf.upsert") {
    // servico_ids NAO e coluna: sai do objeto antes do upsert, senao o Postgres
    // recusa a linha inteira. O vinculo e gravado depois, em eloi_servicos.
    const corpo = body?.nota ?? {};
    const servicoIds = corpo.servico_ids;
    const nf = escolher(corpo, NOTA_CAMPOS);
    if (!ehCents(nf.valor_cents)) return json({ error: "valor_cents deve ser inteiro nao negativo" }, 400);
    if (nf.imposto_cents != null && !ehCents(nf.imposto_cents)) {
      return json({ error: "imposto_cents deve ser inteiro nao negativo" }, 400);
    }
    // emitida sem numero e um registro que nao serve pra nada na contabilidade
    if (["emitida", "enviada"].includes(nf.status as string) && !nf.numero) {
      return json({ error: "nota emitida exige numero" }, 400);
    }
    if (servicoIds !== undefined && !Array.isArray(servicoIds)) {
      return json({ error: "servico_ids tem que ser lista" }, 400);
    }
    if (Array.isArray(servicoIds) && !servicoIds.every(ehUuid)) {
      return json({ error: "servico_ids invalido" }, 400);
    }

    // Todo serviço da nota tem que ser do mesmo cliente dela: nota de um
    // cliente cobrindo serviço de outro é erro de digitação, não caso de uso.
    // Conferido ANTES de gravar a nota (antes gravava e so depois recusava —
    // o 400 voltava com a nota ja alterada no banco).
    if (Array.isArray(servicoIds) && servicoIds.length) {
      let clienteDaNota = nf.cliente_id as string | null | undefined;
      if (clienteDaNota === undefined && nf.id) {
        const { data: atual } = await supabase.from("eloi_notas_fiscais")
          .select("cliente_id").eq("id", nf.id).maybeSingle();
        clienteDaNota = atual?.cliente_id ?? null;
      }
      const { data: svc, error: eSvc } = await supabase.from("eloi_servicos")
        .select("id,cliente_id").in("id", servicoIds);
      if (eSvc) return json({ error: eSvc.message }, 500);
      const estranho = (svc ?? []).find((sv: { cliente_id: string }) => sv.cliente_id !== clienteDaNota);
      if (estranho || (svc ?? []).length !== new Set(servicoIds).size) {
        return json({ error: "algum serviço não existe ou é de outro cliente" }, 400);
      }
    }

    const { data, error } = await supabase.from("eloi_notas_fiscais").upsert(nf).select().single();
    if (error) {
      return /duplicate|unique/i.test(error.message)
        ? json({ error: `já existe uma nota com o número ${nf.numero}` }, 409)
        : json({ error: error.message }, 500);
    }

    if (Array.isArray(servicoIds)) {
      // Desvincula quem saiu, vincula quem entrou. O trigger cuida do espelho
      // nf_numero dos dois lados.
      let solta = supabase.from("eloi_servicos").update({ nota_fiscal_id: null, nf_numero: null })
        .eq("nota_fiscal_id", data.id);
      if (servicoIds.length) solta = solta.not("id", "in", `(${servicoIds.join(",")})`);
      const { error: erroSolta } = await solta;
      if (erroSolta) return json({ error: erroSolta.message }, 500);
      if (servicoIds.length) {
        const { error: erroLiga } = await supabase.from("eloi_servicos")
          .update({ nota_fiscal_id: data.id }).in("id", servicoIds);
        if (erroLiga) return json({ error: erroLiga.message }, 500);
      }
    }
    return json({ nota: data });
  }

  if (action === "nf.remover") {
    const { id } = body ?? {};
    if (!id) return json({ error: "id obrigatorio" }, 400);
    // A FK e SET NULL: o servico sobreviveria com nf_numero espelhando uma nota
    // que nao existe mais. Limpa explicitamente antes de apagar.
    await supabase.from("eloi_servicos")
      .update({ nota_fiscal_id: null, nf_numero: null }).eq("nota_fiscal_id", id);
    const { error } = await supabase.from("eloi_notas_fiscais").delete().eq("id", id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  // ── CONTAS, CATEGORIAS, METAS ──────────────────────────────────────────────
  if (action === "contas.upsert") {
    const c = escolher(body?.conta ?? {}, CONTA_CAMPOS);
    if (!c.nome || !c.contexto) return json({ error: "nome e contexto sao obrigatorios" }, 400);
    // Saldo inicial pode ser negativo (conta que comecou no cheque especial).
    if (c.saldo_inicial_cents != null && !Number.isSafeInteger(c.saldo_inicial_cents)) {
      return json({ error: "saldo_inicial_cents deve ser inteiro" }, 400);
    }
    if (c.limite_cents != null && !ehCents(c.limite_cents)) return json({ error: "limite_cents deve ser inteiro nao negativo" }, 400);
    if (!ehDia(c.dia_fechamento) || !ehDia(c.dia_vencimento)) return json({ error: "dia deve ser inteiro de 1 a 31" }, 400);
    if (c.tipo === "cartao_credito" && (!c.dia_fechamento || !c.dia_vencimento)) {
      return json({ error: "cartao exige dia de fechamento e vencimento" }, 400);
    }
    const { data, error } = await supabase.from("eloi_contas").upsert(c).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ conta: data });
  }

  if (action === "categorias.upsert") {
    const c = escolher(body?.categoria ?? {}, CATEGORIA_CAMPOS);
    if (!c.nome || !c.contexto) return json({ error: "nome e contexto sao obrigatorios" }, 400);
    const { data, error } = await supabase.from("eloi_categorias").upsert(c).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ categoria: data });
  }

  if (action === "metas.upsert") {
    const m = escolher(body?.meta ?? {}, META_CAMPOS);
    if (!m.nome || !m.contexto) return json({ error: "nome e contexto sao obrigatorios" }, 400);
    if (!ehCents(m.alvo_cents, 1)) return json({ error: "alvo_cents deve ser inteiro maior que zero" }, 400);
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
    // So sai se ninguem mais aponta pra ele: o PDF de nota fiscal mora no mesmo
    // bucket e no mesmo prefixo (financeiro/), e um registro que apontasse pra
    // ele levaria a nota junto. Na duvida (erro de leitura), fica o orfao.
    if (arq?.path) {
      const [outros, notas] = await Promise.all([
        supabase.from("eloi_arquivos").select("id", { count: "exact", head: true }).eq("path", arq.path),
        supabase.from("eloi_notas_fiscais").select("id", { count: "exact", head: true }).eq("arquivo_path", arq.path),
      ]);
      const emUso = !!outros.error || !!notas.error || (outros.count ?? 1) > 0 || (notas.count ?? 1) > 0;
      if (!emUso) await supabase.storage.from(ARQUIVOS_BUCKET).remove([arq.path]);
    }
    return json({ ok: true });
  }

  if (action === "arquivos.upsert") {
    const a = escolher(body?.arquivo ?? {}, ARQUIVO_CAMPOS);
    if (!a.titulo || !a.path) return json({ error: "titulo e path sao obrigatorios" }, 400);
    if (typeof a.path !== "string" || !ARQUIVO_PATH.test(a.path)) {
      return json({ error: "path invalido: use o caminho devolvido por arquivos.upload_url" }, 400);
    }
    if (a.tamanho_bytes != null && !ehCents(a.tamanho_bytes)) return json({ error: "tamanho_bytes invalido" }, 400);
    const donos = ["cliente_id", "servico_id", "transacao_id", "nota_fiscal_id"].filter((k) => a[k]);
    if (!donos.length) return json({ error: "arquivo precisa estar ligado a um registro" }, 400);
    // O PDF de uma nota e da nota: registrar o mesmo path como arquivo avulso
    // daria a arquivos.remover um jeito de apaga-lo.
    const { count: daNota, error: eNota } = await supabase.from("eloi_notas_fiscais")
      .select("id", { count: "exact", head: true }).eq("arquivo_path", a.path);
    if (eNota) return json({ error: eNota.message }, 500);
    if ((daNota ?? 0) > 0) return json({ error: "esse arquivo pertence a uma nota fiscal" }, 409);
    const { data, error } = await supabase.from("eloi_arquivos").upsert(a).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ arquivo: data });
  }

  return json({ error: `acao desconhecida: ${action}` }, 400);
});
