/**
 * Teto de faturamento do MEI (LC 123/2006, art. 18-A): R$ 81.000 por ano,
 * proporcional a R$ 6.750 por mês de atividade quando o CNPJ abriu no ano
 * (o mês de abertura conta inteiro). Passar até 20% do teto: segue MEI no ano e
 * paga a diferença; passar de 20%: desenquadramento retroativo a janeiro.
 *
 * Faturamento = notas `emitida`/`enviada` do ano pela data de emissão (cai na
 * competência se a emissão não foi preenchida). Cancelada e substituída ficam fora.
 */
import type { NotaFiscal } from '../lib/tipos'

export const TETO_MEI_ANUAL_CENTS = 8_100_000
const TETO_MEI_MES_CENTS = 675_000
const TOLERANCIA = 1.2

export type EstadoMei = 'dentro' | 'atencao' | 'acima' | 'desenquadra'

export interface SituacaoMei {
  faturado_cents: number
  teto_cents: number
  /** Teto + 20%: acima disso o desenquadramento é retroativo. */
  limite_cents: number
  /** Quanto falta até o teto; negativo = já passou. */
  folga_teto_cents: number
  /** Quanto falta até o limite de 20%; negativo = já passou. */
  folga_limite_cents: number
  estado: EstadoMei
}

/** Meses de atividade no ano de `ano` (1–12) para um CNPJ aberto em `abertura` (AAAA-MM-DD). */
export function mesesDeAtividade(abertura: string | null | undefined, ano: number): number {
  if (!abertura) return 12
  const a = Number(abertura.slice(0, 4))
  if (a < ano) return 12
  if (a > ano) return 0
  return 13 - Number(abertura.slice(5, 7))
}

export function faturamentoMei(notas: Pick<NotaFiscal, 'status' | 'valor_cents' | 'emitida_em' | 'competencia'>[],
  ano: number): number {
  return notas
    .filter((n) => n.status === 'emitida' || n.status === 'enviada')
    .filter((n) => Number((n.emitida_em ?? n.competencia ?? '').slice(0, 4)) === ano)
    .reduce((s, n) => s + n.valor_cents, 0)
}

export function situacaoMei(faturado_cents: number, meses = 12): SituacaoMei {
  const teto = meses >= 12 ? TETO_MEI_ANUAL_CENTS : meses * TETO_MEI_MES_CENTS
  const limite = Math.round(teto * TOLERANCIA)
  const estado: EstadoMei = faturado_cents > limite ? 'desenquadra'
    : faturado_cents > teto ? 'acima'
    : faturado_cents > teto * 0.9 ? 'atencao' : 'dentro'
  return {
    faturado_cents, teto_cents: teto, limite_cents: limite,
    folga_teto_cents: teto - faturado_cents, folga_limite_cents: limite - faturado_cents, estado,
  }
}
