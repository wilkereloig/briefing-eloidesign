// Formatação compartilhada pelas telas. Fica fora dos componentes para nenhuma
// tela precisar importar outra só por causa de um rótulo.
import type { TipoConta, Periodicidade } from '../lib/tipos'

/** 'AAAA-MM-DD' → '04 ago'. Meio-dia UTC evita o dia voltar por fuso. */
export const dataCurta = (iso: string) =>
  new Date(iso + 'T12:00:00Z').toLocaleDateString('pt-BR',
    { day: '2-digit', month: 'short', timeZone: 'UTC' })

/** 'AAAA-MM-DD' → '04/08/2026'. */
export const dataLonga = (iso: string) =>
  new Date(iso + 'T12:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC' })

const ROTULO_CONTA: Record<TipoConta, string> = {
  corrente: 'Conta corrente', poupanca: 'Poupança', digital: 'Conta digital',
  dinheiro: 'Dinheiro', cartao_credito: 'Cartão de crédito',
  investimento: 'Investimento', reserva: 'Reserva', outro: 'Outra',
}
export const rotuloConta = (t: TipoConta) => ROTULO_CONTA[t] ?? t

const ROTULO_PERIODO: Record<Periodicidade, string> = {
  semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal', bimestral: 'Bimestral',
  trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual',
}
export const rotuloPeriodo = (p: Periodicidade) => ROTULO_PERIODO[p] ?? p

/** Quantos meses cabem num ano, por periodicidade — para custo anual. */
const VEZES_POR_ANO: Record<Periodicidade, number> = {
  semanal: 52, quinzenal: 24, mensal: 12, bimestral: 6,
  trimestral: 4, semestral: 2, anual: 1,
}
export const custoAnual = (valor_cents: number, p: Periodicidade) =>
  valor_cents * (VEZES_POR_ANO[p] ?? 12)
export const custoMensal = (valor_cents: number, p: Periodicidade) =>
  Math.round(custoAnual(valor_cents, p) / 12)

/** Variação percentual contra o mês anterior, já em texto de interface. */
export function variacao(atual: number, anterior: number): string {
  if (anterior === 0) return atual === 0 ? 'Sem histórico anterior' : 'Primeiro mês com movimento'
  const pct = ((atual - anterior) / anterior) * 100
  return `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(0)}% vs. mês anterior`
}
