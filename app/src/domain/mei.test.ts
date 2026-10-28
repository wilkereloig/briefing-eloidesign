import { describe, expect, it } from 'vitest'
import { faturamentoMei, mesesDeAtividade, situacaoMei } from './mei'

const nota = (status: string, valor_cents: number, emitida_em: string | null, competencia: string | null = null) =>
  ({ status, valor_cents, emitida_em, competencia }) as Parameters<typeof faturamentoMei>[0][number]

describe('faturamentoMei', () => {
  it('soma só emitida/enviada do ano, pela emissão, caindo na competência', () => {
    const notas = [
      nota('emitida', 100_00, '2026-02-01'),
      nota('enviada', 50_00, null, '2026-03-10'),
      nota('cancelada', 999_00, '2026-04-01'),
      nota('substituida', 999_00, '2026-04-01'),
      nota('pendente', 999_00, null),
      nota('emitida', 70_00, '2025-12-31'),
    ]
    expect(faturamentoMei(notas, 2026)).toBe(150_00)
  })
})

describe('mesesDeAtividade', () => {
  it('mês de abertura conta inteiro; ano anterior = 12; sem data = 12', () => {
    expect(mesesDeAtividade('2026-01-30', 2026)).toBe(12)
    expect(mesesDeAtividade('2026-02-01', 2026)).toBe(11)
    expect(mesesDeAtividade('2025-06-10', 2026)).toBe(12)
    expect(mesesDeAtividade(null, 2026)).toBe(12)
  })
})

describe('situacaoMei', () => {
  it('dentro, atenção, acima do teto e desenquadramento retroativo', () => {
    expect(situacaoMei(5_000_000).estado).toBe('dentro')
    expect(situacaoMei(7_500_000).estado).toBe('atencao')
    const acima = situacaoMei(8_843_000)
    expect(acima.estado).toBe('acima')
    expect(acima.folga_teto_cents).toBe(-743_000)
    expect(acima.folga_limite_cents).toBe(877_000)
    expect(situacaoMei(9_720_001).estado).toBe('desenquadra')
  })
  it('teto proporcional para CNPJ aberto no ano', () => {
    const s = situacaoMei(0, 11)
    expect(s.teto_cents).toBe(7_425_000)
    expect(s.limite_cents).toBe(8_910_000)
  })
})
