import { describe, it, expect } from 'vitest'
import { fmtBRL, centsDeBRL, centsDeReais } from './dinheiro'

describe('dinheiro', () => {
  it('formata cents em BRL', () => {
    expect(fmtBRL(1165000)).toBe('R$ 11.650,00')
    expect(fmtBRL(0)).toBe('R$ 0,00')
  })
  it('parseia entrada humana pra cents sem float', () => {
    expect(centsDeBRL('11.650,00')).toBe(1165000)
    expect(centsDeBRL('R$ 1.234,5')).toBe(123450)
    expect(centsDeBRL('800')).toBe(80000)
    expect(centsDeBRL('')).toBe(0)
  })
  it('converte orcamentos.valor_total (reais) pra cents, mesma conta do trigger SQL', () => {
    expect(centsDeReais(11650)).toBe(1165000)
    expect(centsDeReais(0)).toBe(0)
    expect(centsDeReais(99.999)).toBe(10000)
  })
})
