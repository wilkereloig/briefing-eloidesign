// Relatórios que ajudam a decidir, não gráficos porque existe dado. Tudo
// deriva do que já está carregado; nada aqui é gravado. Filtro de período,
// cliente e marca entra uma vez (`aplicarFiltro`) e vale para todas as abas —
// duas telas filtrando de jeitos diferentes dariam dois números para a
// mesma pergunta.
import type { NotaFiscal, ServicoRow, Transacao } from '../lib/tipos'
import { competenciaDe, diasDeAtraso, estaCancelada, estaEmAberto, saldoAberto, valorLiquidado } from './financeiro'
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
