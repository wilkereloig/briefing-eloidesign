/**
 * Plano de pagamentos dia a dia (`eloi_relatorios`, tipo `plano_pagamento`).
 *
 * O plano é um RETRATO gerado sob pedido: carrega decisões (pagar só o mínimo,
 * adiar uma conta, de onde sai o dinheiro) que não existem nos lançamentos. Quem
 * grava é o assistente, direto no banco; a tela só lê o mais recente. Por isso o
 * formato é conferido aqui na leitura — jsonb não tem schema e um retrato malformado
 * tem de virar "formato desconhecido", não tela quebrada nem número inventado.
 *
 * Valores em cents inteiros, como no resto do financeiro.
 */

export type TipoEvento = 'paga' | 'recebe' | 'decisao'

export interface EventoPlano {
  data: string
  descricao: string
  nota: string | null
  tipo: TipoEvento
  /** Positivo. O sentido vem do tipo; decisão tem 0. */
  valor_cents: number
  /** Saída: quanto sai do dinheiro em conta. Entrada: quanto fica em conta. */
  caixa_cents: number
  /** Saída: quanto sai do cheque especial. */
  cheque_cents: number
  /** Entrada: quanto vai para devolver o cheque especial. */
  quita_cheque_cents: number
}

/** Fim do dia: dinheiro em conta e cheque especial em uso (nunca os dois > 0). */
export interface DiaPlano { data: string; caixa_cents: number; cheque_cents: number }

export interface DecisaoPlano { titulo: string; texto: string; prazo: string | null; urgente: boolean }

export interface PlanoPagamento {
  de: string
  ate: string
  limite_cheque_cents: number
  /** Taxa mensal do cheque especial usada na estimativa de juros (0.08 = 8%). */
  taxa_cheque_mensal: number
  premissas: string[]
  decisoes: DecisaoPlano[]
  dias: DiaPlano[]
  eventos: EventoPlano[]
}

const DATA = /^\d{4}-\d{2}-\d{2}$/
const ehData = (v: unknown): v is string => typeof v === 'string' && DATA.test(v)
const ehCents = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
const ehTexto = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const TIPOS: TipoEvento[] = ['paga', 'recebe', 'decisao']

type Bruto = Record<string, unknown>
const objeto = (v: unknown): v is Bruto => typeof v === 'object' && v !== null && !Array.isArray(v)

function lerDia(v: unknown): DiaPlano | null {
  if (!objeto(v) || !ehData(v.data) || !ehCents(v.caixa_cents) || !ehCents(v.cheque_cents)) return null
  return { data: v.data, caixa_cents: v.caixa_cents, cheque_cents: v.cheque_cents }
}

function lerEvento(v: unknown): EventoPlano | null {
  if (!objeto(v) || !ehData(v.data) || !ehTexto(v.descricao)) return null
  if (!TIPOS.includes(v.tipo as TipoEvento) || !ehCents(v.valor_cents)) return null
  const opcional = (k: string) => (v[k] == null ? 0 : ehCents(v[k]) ? (v[k] as number) : null)
  const caixa = opcional('caixa_cents'), cheque = opcional('cheque_cents'), quita = opcional('quita_cheque_cents')
  if (caixa === null || cheque === null || quita === null) return null
  // De onde sai tem de fechar com o valor: é o que a tela promete ao dono.
  if (v.tipo === 'paga' && caixa + cheque !== v.valor_cents) return null
  if (v.tipo === 'recebe' && caixa + quita !== v.valor_cents) return null
  return {
    data: v.data, descricao: v.descricao, nota: ehTexto(v.nota) ? v.nota : null,
    tipo: v.tipo as TipoEvento, valor_cents: v.valor_cents,
    caixa_cents: caixa, cheque_cents: cheque, quita_cheque_cents: quita,
  }
}

function lerDecisao(v: unknown): DecisaoPlano | null {
  if (!objeto(v) || !ehTexto(v.titulo) || !ehTexto(v.texto)) return null
  if (v.prazo != null && !ehData(v.prazo)) return null
  return { titulo: v.titulo, texto: v.texto, prazo: (v.prazo as string | null) ?? null, urgente: v.urgente === true }
}

/** Confere o retrato gravado. Qualquer peça fora do formato → null (tudo ou nada:
 *  um plano com um dia faltando mostraria o cheque especial errado). */
export function lerPlano(dados: unknown): PlanoPagamento | null {
  if (!objeto(dados) || !ehData(dados.de) || !ehData(dados.ate) || dados.de > dados.ate) return null
  if (!ehCents(dados.limite_cheque_cents)) return null
  const taxa = dados.taxa_cheque_mensal
  if (typeof taxa !== 'number' || !(taxa >= 0 && taxa < 1)) return null
  const lista = <T,>(v: unknown, ler: (x: unknown) => T | null): T[] | null => {
    if (!Array.isArray(v)) return null
    const out = v.map(ler)
    return out.every((x) => x !== null) ? (out as T[]) : null
  }
  const dias = lista(dados.dias, lerDia)
  const eventos = lista(dados.eventos, lerEvento)
  const decisoes = lista(dados.decisoes ?? [], lerDecisao)
  const premissas = lista(dados.premissas ?? [], (x) => (ehTexto(x) ? x : null))
  if (!dias || !eventos || !decisoes || !premissas || dias.length === 0) return null
  const ordenados = <T extends { data: string }>(xs: T[]) => [...xs].sort((a, b) => a.data.localeCompare(b.data))
  return {
    de: dados.de, ate: dados.ate, limite_cheque_cents: dados.limite_cheque_cents, taxa_cheque_mensal: taxa,
    premissas, decisoes, dias: ordenados(dias), eventos: ordenados(eventos),
  }
}

export interface ResumoPlano {
  pico_cheque_cents: number
  /** Primeiro dia em que o pico acontece; null se o cheque nunca é usado. */
  pico_em: string | null
  dias_no_cheque: number
  /** Estimativa: juros simples diários sobre o saldo de cada fim de dia. */
  juros_cheque_cents: number
  /** Dinheiro em conta menos cheque em uso no último dia. */
  saldo_final_cents: number
  entra_cents: number
  sai_cents: number
}

export function resumoPlano(p: PlanoPagamento): ResumoPlano {
  let pico = 0, picoEm: string | null = null, dias = 0, chequeDia = 0
  for (const d of p.dias) {
    if (d.cheque_cents > 0) dias++
    chequeDia += d.cheque_cents
    if (d.cheque_cents > pico) { pico = d.cheque_cents; picoEm = d.data }
  }
  const ultimo = p.dias[p.dias.length - 1]
  const soma = (t: TipoEvento) => p.eventos.filter((e) => e.tipo === t).reduce((s, e) => s + e.valor_cents, 0)
  return {
    pico_cheque_cents: pico, pico_em: picoEm, dias_no_cheque: dias,
    juros_cheque_cents: Math.round((chequeDia * p.taxa_cheque_mensal) / 30),
    saldo_final_cents: ultimo.caixa_cents - ultimo.cheque_cents,
    entra_cents: soma('recebe'), sai_cents: soma('paga'),
  }
}

/** Eventos agrupados por data, na ordem do calendário. */
export function eventosPorDia(p: PlanoPagamento): { data: string; eventos: EventoPlano[] }[] {
  const grupos = new Map<string, EventoPlano[]>()
  for (const e of p.eventos) grupos.set(e.data, [...(grupos.get(e.data) ?? []), e])
  return [...grupos].map(([data, eventos]) => ({ data, eventos }))
}
