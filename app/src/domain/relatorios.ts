// Relatórios que ajudam a decidir, não gráficos porque existe dado. Tudo
// deriva do que já está carregado; nada aqui é gravado. Filtro de período,
// cliente e marca entra uma vez (`aplicarFiltro`) e vale para todas as abas —
// duas telas filtrando de jeitos diferentes dariam dois números para a
// mesma pergunta.
import type { Categoria, Contexto, Emprestimo, NotaFiscal, Recorrencia, ServicoRow, Transacao } from '../lib/tipos'
import { competenciaDe, diasDeAtraso, estaCancelada, estaEmAberto, naturezaDaCategoria, resumoEmprestimo, saldoAberto, valorLiquidado } from './financeiro'
import type { Projeto } from './projeto'

export interface Filtro {
  /** 'AAAA-MM-DD'; ambos opcionais. Compara com a competência do lançamento. */
  de?: string
  ate?: string
  clienteId?: string
  subClienteId?: string
}

/** Serviço por id, para a transação saber a marca via `servico_id`. */
export type MapaServicos = Map<string, Pick<ServicoRow, 'sub_cliente_id' | 'sub_cliente'>>

export function aplicarFiltro(transacoes: Transacao[], f: Filtro, servicos: MapaServicos): Transacao[] {
  return transacoes.filter((t) => {
    if (f.clienteId && t.cliente_id !== f.clienteId) return false
    if (f.subClienteId) {
      const sv = t.servico_id ? servicos.get(t.servico_id) : null
      if (!sv || sv.sub_cliente_id !== f.subClienteId) return false
    }
    if (f.de || f.ate) {
      const c = competenciaDe(t)
      const dia = t.data_competencia || t.data_vencimento || t.data_liquidacao
      if (!c || !dia) return false
      if (f.de && dia < f.de) return false
      if (f.ate && dia > f.ate) return false
    }
    return true
  })
}

// ── clientes ─────────────────────────────────────────────────────────────────

export interface LinhaCliente {
  chave: string
  /** Recebido de fato (liquidado). */
  recebido_cents: number
  /** Combinado e ainda não entrado. */
  a_receber_cents: number
  /** Serviços registrados. */
  projetos: number
  /** Recebido ÷ recebimentos liquidados. */
  ticket_cents: number
}

/** Uma linha por cliente (ou por marca, com `porMarca`). Quem não tem
 *  entrada nem serviço não aparece — linha zerada não ajuda a decidir. */
export function porCliente(
  transacoes: Transacao[], servicos: ServicoRow[], porMarca = false,
): LinhaCliente[] {
  const mapa = new Map<string, LinhaCliente & { n: number }>()
  const pegar = (k: string) => {
    let l = mapa.get(k)
    if (!l) { l = { chave: k, recebido_cents: 0, a_receber_cents: 0, projetos: 0, ticket_cents: 0, n: 0 }; mapa.set(k, l) }
    return l
  }
  const servicoPorId = new Map(servicos.map((s) => [s.id, s]))
  const chaveDe = (clienteId: string | null, servicoId: string | null) => {
    if (!porMarca) return clienteId
    const sv = servicoId ? servicoPorId.get(servicoId) : null
    return sv?.sub_cliente_id ?? null
  }
  for (const t of transacoes) {
    if (t.tipo !== 'entrada' || estaCancelada(t)) continue
    const k = chaveDe(t.cliente_id, t.servico_id)
    if (!k) continue
    const l = pegar(k)
    const liq = valorLiquidado(t)
    if (liq > 0) { l.recebido_cents += liq; l.n += 1 }
    l.a_receber_cents += saldoAberto(t)
  }
  for (const s of servicos) {
    const k = porMarca ? s.sub_cliente_id : s.cliente_id
    if (!k) continue
    pegar(k).projetos += 1
  }
  return [...mapa.values()]
    .map(({ n, ...l }) => ({ ...l, ticket_cents: n ? Math.round(l.recebido_cents / n) : 0 }))
    .sort((a, b) => b.recebido_cents - a.recebido_cents || b.a_receber_cents - a.a_receber_cents)
}

// ── projetos ─────────────────────────────────────────────────────────────────

export interface ResumoProjetos {
  porEtapa: { etapa: Projeto['etapa']; qtd: number; cents: number }[]
  entregues: number
  atrasados: number
  /** Valor do que está aprovado ou em execução. */
  em_execucao_cents: number
}

export function resumoProjetos(projetos: Projeto[], hoje: string): ResumoProjetos {
  const etapas: Projeto['etapa'][] = ['orcamento', 'aprovado', 'execucao', 'entregue', 'pago']
  const porEtapa = etapas.map((etapa) => {
    const ps = projetos.filter((p) => p.etapa === etapa)
    return { etapa, qtd: ps.length, cents: ps.reduce((s, p) => s + p.valorCents, 0) }
  })
  return {
    porEtapa,
    entregues: projetos.filter((p) => p.etapa === 'entregue' || p.etapa === 'pago').length,
    atrasados: projetos.filter((p) =>
      p.servico?.prazo && p.servico.prazo < hoje && p.servico.status_execucao !== 'concluida').length,
    em_execucao_cents: projetos.filter((p) => p.etapa === 'aprovado' || p.etapa === 'execucao')
      .reduce((s, p) => s + p.valorCents, 0),
  }
}

// ── recebíveis ───────────────────────────────────────────────────────────────

export type FaixaAging = '1-30' | '31-60' | '61-90' | '90+'
export interface Aging {
  faixas: { faixa: FaixaAging; qtd: number; cents: number }[]
  vencido_cents: number
  /** Em aberto vencendo até N dias, acumulado (30 inclui 0–30, 60 inclui 0–60…). */
  proximos: { dias: 30 | 60 | 90; qtd: number; cents: number }[]
}

/** Só entradas em aberto. Vencido por faixa de atraso; a vencer por horizonte. */
export function aging(transacoes: Transacao[], hoje: string): Aging {
  const abertas = transacoes.filter((t) => t.tipo === 'entrada' && estaEmAberto(t))
  const faixaDe = (dias: number): FaixaAging => dias <= 30 ? '1-30' : dias <= 60 ? '31-60' : dias <= 90 ? '61-90' : '90+'
  const faixas = (['1-30', '31-60', '61-90', '90+'] as FaixaAging[]).map((faixa) => ({ faixa, qtd: 0, cents: 0 }))
  let vencido = 0
  const proximos = ([30, 60, 90] as const).map((dias) => ({ dias, qtd: 0, cents: 0 }))
  for (const t of abertas) {
    const atraso = diasDeAtraso(t, hoje)
    const aberto = saldoAberto(t)
    if (atraso > 0) {
      const f = faixas.find((x) => x.faixa === faixaDe(atraso))!
      f.qtd += 1; f.cents += aberto; vencido += aberto
      continue
    }
    if (!t.data_vencimento) continue
    const dias = Math.floor((Date.parse(t.data_vencimento) - Date.parse(hoje)) / 86_400_000)
    for (const p of proximos) if (dias <= p.dias) { p.qtd += 1; p.cents += aberto }
  }
  return { faixas, vencido_cents: vencido, proximos }
}

// ── fiscal ───────────────────────────────────────────────────────────────────

export interface ResumoFiscal {
  emitidas: number
  emitido_cents: number
  imposto_cents: number
  pendentes: number
  pendente_cents: number
}

export function resumoFiscal(notas: NotaFiscal[], f: Filtro): ResumoFiscal {
  const dentro = notas.filter((n) => {
    if (f.clienteId && n.cliente_id !== f.clienteId) return false
    const d = n.emitida_em ?? n.competencia
    if ((f.de || f.ate) && !d) return false
    if (f.de && d! < f.de) return false
    if (f.ate && d! > f.ate) return false
    return true
  })
  const emitidas = dentro.filter((n) => n.status === 'emitida' || n.status === 'enviada')
  const pendentes = dentro.filter((n) => n.status === 'pendente' || n.status === 'pronta')
  return {
    emitidas: emitidas.length,
    emitido_cents: emitidas.reduce((s, n) => s + n.valor_cents, 0),
    imposto_cents: emitidas.reduce((s, n) => s + n.imposto_cents, 0),
    pendentes: pendentes.length,
    pendente_cents: pendentes.reduce((s, n) => s + n.valor_cents, 0),
  }
}

// ── exportação ───────────────────────────────────────────────────────────────

/** CSV com `;` (Excel em pt-BR abre direto) e BOM para acento. Célula com
 *  `;`, aspas ou quebra de linha vai entre aspas. */
export function montarCsv(cabecalho: string[], linhas: (string | number | null | undefined)[][]): string {
  const cel = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + [cabecalho, ...linhas].map((l) => l.map(cel).join(';')).join('\n')
}

/** Cents → "1234,56" para planilha somar sem conversão. */
export const reaisCsv = (cents: number) => (cents / 100).toFixed(2).replace('.', ',')

// ── análise de gastos ────────────────────────────────────────────────────────
// "Para onde está indo o dinheiro?" — pelo valor ORIGINAL (pago ou não) no mês
// de competência: compra no cartão conta no mês da compra, mesmo com a fatura
// em aberto. Transferência (inclusive pagar fatura) não é gasto.

export type GrupoGasto = 'dia_a_dia' | 'divida' | 'juros' | 'cartao_sem_detalhe'

/** Fatura lançada como total provisório (sem os itens): é gasto, mas sem "em quê". */
const ehFaturaSemDetalhe = (t: Transacao) => /^fatura\b/i.test(t.descricao)
/** Chave da linha "cartão sem detalhe" em `porCategoria`. */
export const CARTAO_SEM_DETALHE = '__cartao_sem_detalhe'

/** Nome curto do lugar/fornecedor para o ranking: "99 — corrida" → "99";
 *  "PIX para Fulano" → "PIX para pessoas". */
export function lugarDoGasto(t: Pick<Transacao, 'descricao' | 'fornecedor'>): string {
  const d = (t.fornecedor || t.descricao).trim()
  if (/^pix (para|no cartão)/i.test(d)) return 'PIX para pessoas'
  return d.split(/ — | - | \(|\s\d+\/\d+/)[0].trim() || d
}

export interface AnaliseGastos {
  meses: string[]
  total_cents: number
  media_mensal_cents: number
  /** Entradas operacionais (o que é renda de verdade: sem empréstimo, sem
   *  dinheiro vindo de outra conta, sem estorno, sem ajuste). */
  renda_cents: number
  renda_media_cents: number
  /** Dívida + juros: o que se paga pelo passado. */
  passado_cents: number
  porGrupo: Record<GrupoGasto, number>
  /** Lançamentos em cada grupo. */
  qtdPorGrupo: Record<GrupoGasto, number>
  porMes: { mes: string; saidas_cents: number; renda_cents: number }[]
  porCategoria: { categoria_id: string | null; total_cents: number; qtd: number; porMes: number[] }[]
  lugares: { nome: string; total_cents: number; qtd: number }[]
}

export function analiseGastos(
  transacoes: Transacao[], categorias: Categoria[], meses: string[], contexto?: Contexto,
): AnaliseGastos {
  const cat = new Map(categorias.map((c) => [c.id, c]))
  const idx = new Map(meses.map((m, i) => [m, i]))
  const porGrupo: Record<GrupoGasto, number> = { dia_a_dia: 0, divida: 0, juros: 0, cartao_sem_detalhe: 0 }
  const qtdPorGrupo: Record<GrupoGasto, number> = { dia_a_dia: 0, divida: 0, juros: 0, cartao_sem_detalhe: 0 }
  const porMes = meses.map((mes) => ({ mes, saidas_cents: 0, renda_cents: 0 }))
  const porCat = new Map<string, AnaliseGastos['porCategoria'][number]>()
  const lugares = new Map<string, { nome: string; total_cents: number; qtd: number }>()
  let total = 0, renda = 0
  for (const t of transacoes) {
    if (t.tipo === 'transferencia' || estaCancelada(t) || t.origem === 'ajuste') continue
    if (contexto && t.contexto !== contexto) continue
    const m = competenciaDe(t)?.slice(0, 7)
    const i = m == null ? undefined : idx.get(m)
    if (i === undefined) continue
    const c = t.categoria_id ? cat.get(t.categoria_id) : undefined
    const nat = naturezaDaCategoria(c)
    if (t.tipo === 'entrada') {
      if (nat === 'operacional' && c?.nome !== 'Estornos e devoluções') { renda += t.valor_cents; porMes[i].renda_cents += t.valor_cents }
      continue
    }
    total += t.valor_cents
    porMes[i].saidas_cents += t.valor_cents
    const grupo: GrupoGasto = ehFaturaSemDetalhe(t) ? 'cartao_sem_detalhe'
      : nat === 'divida' ? 'divida' : nat === 'financeira' ? 'juros' : 'dia_a_dia'
    porGrupo[grupo] += t.valor_cents
    qtdPorGrupo[grupo] += 1
    // Fatura provisória fica numa linha própria: somá-la em "Outros" esconderia
    // que o gasto existe mas ainda não se sabe em quê.
    const k = grupo === 'cartao_sem_detalhe' ? CARTAO_SEM_DETALHE : t.categoria_id ?? ''
    const linha = porCat.get(k) ?? { categoria_id: grupo === 'cartao_sem_detalhe' ? CARTAO_SEM_DETALHE : t.categoria_id, total_cents: 0, qtd: 0, porMes: meses.map(() => 0) }
    linha.total_cents += t.valor_cents; linha.qtd += 1; linha.porMes[i] += t.valor_cents
    porCat.set(k, linha)
    if (grupo === 'dia_a_dia') {
      const nome = lugarDoGasto(t)
      const l = lugares.get(nome.toLowerCase()) ?? { nome, total_cents: 0, qtd: 0 }
      l.total_cents += t.valor_cents; l.qtd += 1
      lugares.set(nome.toLowerCase(), l)
    }
  }
  const n = Math.max(meses.length, 1)
  return {
    meses, total_cents: total, media_mensal_cents: Math.round(total / n),
    renda_cents: renda, renda_media_cents: Math.round(renda / n),
    passado_cents: porGrupo.divida + porGrupo.juros, porGrupo, qtdPorGrupo, porMes,
    porCategoria: [...porCat.values()].sort((a, b) => b.total_cents - a.total_cents),
    lugares: [...lugares.values()].sort((a, b) => b.total_cents - a.total_cents).slice(0, 10),
  }
}

// ── compromisso mensal ───────────────────────────────────────────────────────

/** Quantas vezes por mês cada periodicidade cobra (média do ano). */
const VEZES_POR_MES: Record<string, number> = {
  semanal: 52 / 12, quinzenal: 26 / 12, mensal: 1, bimestral: 1 / 2, trimestral: 1 / 3, semestral: 1 / 6, anual: 1 / 12,
}

export interface CompromissoMensal {
  /** Contas fixas (recorrências de saída ativas), normalizadas para o mês. */
  fixas_cents: number
  /** Parcelas mensais dos empréstimos que ainda têm saldo devedor. */
  dividas_cents: number
  total_cents: number
  itens: { nome: string; valor_cents: number; tipo: 'fixa' | 'divida' }[]
}

/** O que já está comprometido todo mês antes de qualquer gasto do dia a dia. */
export function compromissoMensal(
  recorrencias: Recorrencia[], emprestimos: Emprestimo[], transacoes: Transacao[], contexto?: Contexto,
): CompromissoMensal {
  const itens: CompromissoMensal['itens'] = []
  for (const r of recorrencias) {
    if (r.tipo !== 'saida' || !r.ativa || r.pausada_em || r.encerrada_em) continue
    if (contexto && r.contexto !== contexto) continue
    itens.push({ nome: r.nome, valor_cents: Math.round(r.valor_cents * (VEZES_POR_MES[r.periodicidade] ?? 1)), tipo: 'fixa' })
  }
  for (const e of emprestimos) {
    if (!e.ativo || (contexto && e.contexto !== contexto)) continue
    if (resumoEmprestimo(e, transacoes).falta_cents <= 0) continue
    itens.push({ nome: e.nome, valor_cents: e.valor_parcela_cents, tipo: 'divida' })
  }
  itens.sort((a, b) => b.valor_cents - a.valor_cents)
  const fixas = itens.filter((i) => i.tipo === 'fixa').reduce((s, i) => s + i.valor_cents, 0)
  const dividas = itens.filter((i) => i.tipo === 'divida').reduce((s, i) => s + i.valor_cents, 0)
  return { fixas_cents: fixas, dividas_cents: dividas, total_cents: fixas + dividas, itens }
}
