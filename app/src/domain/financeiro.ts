// Regras financeiras do Gestão ELOI — FONTE ÚNICA de todo cálculo de dinheiro.
// Nenhuma tela recalcula saldo, resultado ou pendência por conta própria: se um
// número aparece na interface, ele saiu daqui. Duas telas com contas próprias é
// como um sistema financeiro passa a mostrar dois valores para a mesma coisa.
//
// Invariantes (espelham as constraints de db/2026-08-04-gestao-eloi-financeiro.sql):
//  · valor em cents inteiros, sempre;
//  · TRANSFERÊNCIA não é receita nem despesa — só troca de bolso. Ela move saldo
//    entre contas e é neutra no resultado. Contar transferência como receita é o
//    erro que infla faturamento e é o motivo de o tipo existir separado;
//  · o que entrou de fato é `recebido_cents`; `valor_cents` é o combinado.
//    Pagamento parcial é normal, não exceção;
//  · competência (a que mês pertence) ≠ liquidação (quando o dinheiro andou).
//    Resultado usa competência; saldo usa liquidação.
import type { Transacao, Conta, Contexto, StatusMov } from '../lib/tipos'

/** Status em que a transação ainda não liquidou e continua devida. */
const EM_ABERTO: StatusMov[] = ['previsto', 'pendente', 'parcial', 'vencido']

export const estaEmAberto = (t: Transacao) => EM_ABERTO.includes(t.status)
export const estaCancelada = (t: Transacao) => t.status === 'cancelada'

/** Quanto ainda falta entrar/sair desta transação. */
export function saldoAberto(t: Transacao): number {
  if (estaCancelada(t)) return 0
  return Math.max(0, t.valor_cents - t.recebido_cents)
}

/** Quanto já andou de dinheiro nesta transação. */
export function valorLiquidado(t: Transacao): number {
  if (estaCancelada(t)) return 0
  // 'realizado' com recebido zerado é o caso comum de quem marcou pago sem
  // informar valor: liquidou tudo.
  if (t.status === 'realizado' && t.recebido_cents === 0) return t.valor_cents
  return t.recebido_cents
}

// ── saldo de conta ───────────────────────────────────────────────────────────

/**
 * Saldo real da conta: só dinheiro que efetivamente andou.
 * Transferência entra aqui (move saldo) e fica fora do resultado.
 */
export function saldoConta(conta: Conta, transacoes: Transacao[]): number {
  let saldo = conta.saldo_inicial_cents
  for (const t of transacoes) {
    const v = valorLiquidado(t)
    if (v === 0) continue
    if (t.tipo === 'transferencia') {
      if (t.conta_id === conta.id) saldo -= v
      if (t.conta_destino_id === conta.id) saldo += v
      continue
    }
    if (t.conta_id !== conta.id) continue
    saldo += t.tipo === 'entrada' ? v : -v
  }
  return saldo
}

/** Soma de saldos das contas de um contexto. Cartão de crédito fica de fora:
 *  fatura é dívida, não saldo disponível — some em `faturaAberta`. */
export function saldoDisponivel(contas: Conta[], transacoes: Transacao[], contexto?: Contexto): number {
  return contas
    .filter((c) => c.ativa && c.tipo !== 'cartao_credito' && (!contexto || c.contexto === contexto))
    .reduce((s, c) => s + saldoConta(c, transacoes), 0)
}

// ── resultado do período (regime de competência) ─────────────────────────────

export interface Resultado {
  receita_cents: number
  despesa_cents: number
  lucro_cents: number
  margem: number
  /** Receita combinada que ainda não entrou. */
  a_receber_cents: number
  /** Despesa combinada que ainda não saiu. */
  a_pagar_cents: number
}

/** `mes` no formato 'AAAA-MM'; omitido, considera todas as competências. */
export function resultado(transacoes: Transacao[], contexto?: Contexto, mes?: string): Resultado {
  let receita = 0, despesa = 0, aReceber = 0, aPagar = 0
  for (const t of transacoes) {
    // transferência é neutra: nunca entra em resultado
    if (t.tipo === 'transferencia' || estaCancelada(t)) continue
    if (contexto && t.contexto !== contexto) continue
    if (mes && !competenciaNoMes(t, mes)) continue

    const liquidado = valorLiquidado(t)
    const aberto = saldoAberto(t)
    if (t.tipo === 'entrada') { receita += liquidado; aReceber += aberto }
    else { despesa += liquidado; aPagar += aberto }
  }
  const lucro = receita - despesa
  return {
    receita_cents: receita,
    despesa_cents: despesa,
    lucro_cents: lucro,
    margem: receita > 0 ? lucro / receita : 0,
    a_receber_cents: aReceber,
    a_pagar_cents: aPagar,
  }
}

/** Competência da transação, com fallback pro vencimento e depois liquidação —
 *  lançamento sem competência explícita não pode sumir do relatório. */
export function competenciaDe(t: Transacao): string | null {
  const d = t.data_competencia || t.data_vencimento || t.data_liquidacao
  return d ? d.slice(0, 7) : null
}

const competenciaNoMes = (t: Transacao, mes: string) => competenciaDe(t) === mes

// ── pendências e vencimentos ─────────────────────────────────────────────────

/** Vencidas de verdade: em aberto e com vencimento anterior a `hoje`.
 *  `hoje` entra por parâmetro para o cálculo ser determinístico e testável. */
export function vencidas(transacoes: Transacao[], hoje: string, contexto?: Contexto): Transacao[] {
  return transacoes.filter((t) =>
    estaEmAberto(t) && !!t.data_vencimento && t.data_vencimento < hoje &&
    (!contexto || t.contexto === contexto))
}

export function diasDeAtraso(t: Transacao, hoje: string): number {
  if (!t.data_vencimento || !estaEmAberto(t)) return 0
  const ms = Date.parse(hoje) - Date.parse(t.data_vencimento)
  return Math.max(0, Math.floor(ms / 86_400_000))
}

/** Em aberto vencendo nos próximos `dias`. Ordenado do mais próximo. */
export function proximosVencimentos(transacoes: Transacao[], hoje: string, dias = 30): Transacao[] {
  const limite = new Date(Date.parse(hoje) + dias * 86_400_000).toISOString().slice(0, 10)
  return transacoes
    .filter((t) => estaEmAberto(t) && !!t.data_vencimento && t.data_vencimento >= hoje && t.data_vencimento <= limite)
    .sort((a, b) => (a.data_vencimento! < b.data_vencimento! ? -1 : 1))
}

// ── cartão de crédito ────────────────────────────────────────────────────────

/**
 * Fatura de um cartão: soma das compras em aberto do ciclo.
 * O pagamento da fatura é uma TRANSFERÊNCIA (conta corrente → cartão) e por isso
 * não aparece de novo como despesa — a despesa já foi lançada na compra.
 */
export function faturaAberta(cartao: Conta, transacoes: Transacao[]): number {
  return transacoes
    .filter((t) => t.conta_id === cartao.id && t.tipo === 'saida' && !estaCancelada(t))
    .reduce((s, t) => s + saldoAberto(t), 0)
}

export function limiteDisponivel(cartao: Conta, transacoes: Transacao[]): number | null {
  if (cartao.limite_cents == null) return null
  return cartao.limite_cents - faturaAberta(cartao, transacoes)
}

/**
 * Divide um valor em N parcelas sem perder centavo: o resto da divisão vai
 * inteiro para a primeira parcela. 100,00 em 3 = 33,34 + 33,33 + 33,33.
 */
export function dividirParcelas(valor_cents: number, n: number): number[] {
  if (n < 1) throw new Error('parcelas deve ser >= 1')
  const base = Math.floor(valor_cents / n)
  const resto = valor_cents - base * n
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + resto : base))
}

/** Data da parcela `i` (0-based) a partir de uma data inicial 'AAAA-MM-DD'.
 *  Dia 31 em mês de 30 cai no último dia do mês, não vaza pro mês seguinte. */
export function dataDaParcela(inicio: string, i: number): string {
  const [a, m, d] = inicio.split('-').map(Number)
  const alvo = new Date(Date.UTC(a, m - 1 + i, 1))
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate()
  alvo.setUTCDate(Math.min(d, ultimoDia))
  return alvo.toISOString().slice(0, 10)
}

// ── previsão de caixa ────────────────────────────────────────────────────────

export interface Cenario { conservador: number; provavel: number; otimista: number }

/**
 * Previsão de saldo ao fim do horizonte. Três cenários variam só o quanto do
 * "a receber" se acredita: vencido tem menos chance de entrar que a vencer.
 * Realizado nunca é projetado — já é fato e está no saldo.
 */
export function previsaoCaixa(
  contas: Conta[], transacoes: Transacao[], hoje: string, dias = 90, contexto?: Contexto,
): Cenario {
  const saldo = saldoDisponivel(contas, transacoes, contexto)
  const limite = new Date(Date.parse(hoje) + dias * 86_400_000).toISOString().slice(0, 10)

  let receberEmDia = 0, receberAtrasado = 0, pagar = 0
  for (const t of transacoes) {
    if (t.tipo === 'transferencia' || !estaEmAberto(t)) continue
    if (contexto && t.contexto !== contexto) continue
    const venc = t.data_vencimento
    if (!venc || venc > limite) continue
    const aberto = saldoAberto(t)
    if (t.tipo === 'saida') { pagar += aberto; continue }
    if (venc < hoje) receberAtrasado += aberto
    else receberEmDia += aberto
  }
  // despesa prevista entra inteira nos três: conta a pagar não escolhe cenário
  return {
    conservador: saldo + Math.round(receberEmDia * 0.7) - pagar,
    provavel: saldo + receberEmDia + Math.round(receberAtrasado * 0.5) - pagar,
    otimista: saldo + receberEmDia + receberAtrasado - pagar,
  }
}

// ── agregações de análise ────────────────────────────────────────────────────

export interface Fatia { chave: string; total_cents: number; qtd: number }

/** Agrupa por uma chave da transação, do maior total pro menor. */
export function agrupar(
  transacoes: Transacao[], chave: (t: Transacao) => string | null, tipo: 'entrada' | 'saida',
): Fatia[] {
  const mapa = new Map<string, Fatia>()
  for (const t of transacoes) {
    if (t.tipo !== tipo || estaCancelada(t)) continue
    const k = chave(t)
    if (!k) continue
    const atual = mapa.get(k) || { chave: k, total_cents: 0, qtd: 0 }
    atual.total_cents += valorLiquidado(t)
    atual.qtd += 1
    mapa.set(k, atual)
  }
  return [...mapa.values()].filter((f) => f.total_cents > 0).sort((a, b) => b.total_cents - a.total_cents)
}

/** Consumo de um orçamento de gasto: quanto do limite já foi usado. */
export function consumoOrcamento(alvo_cents: number, gasto_cents: number) {
  return {
    usado_cents: gasto_cents,
    restante_cents: alvo_cents - gasto_cents,
    percentual: alvo_cents > 0 ? gasto_cents / alvo_cents : 0,
    estourou: gasto_cents > alvo_cents,
  }
}
