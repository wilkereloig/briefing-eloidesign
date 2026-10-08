import { describe, it, expect } from 'vitest'
import { fmtBRL, centsDeBRL, centsDeReais, lerCents } from './dinheiro'
import { lerValor } from '../domain/importacao'

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
  it('trata ponto como decimal quando não há vírgula (bug 0.3)', () => {
    expect(centsDeBRL('1234.56')).toBe(123456)
    expect(centsDeBRL('1500.50')).toBe(150050)
    expect(centsDeBRL('10.5')).toBe(1050)
  })
  it('pt-BR: ponto é milhar, vírgula é decimal — parser único', () => {
    expect(centsDeBRL('1.500')).toBe(150000)
    expect(centsDeBRL('1.500,50')).toBe(150050)
    expect(centsDeBRL('10,5')).toBe(1050)
    expect(centsDeBRL('1500')).toBe(150000)
    expect(centsDeBRL('R$ 1.234.567,89')).toBe(123456789)
    expect(centsDeBRL('1,234.56')).toBe(123456) // formato internacional
    expect(centsDeBRL('1.5000')).toBe(0) // milhar fora de grupo de 3 não é número
    expect(lerCents('abc')).toBeNull()
    expect(lerCents('12,345')).toBeNull()
    expect(lerCents('(12,00)')).toBe(-1200)
    // mesma regra do extrato importado
    for (const v of ['1.500', '1.500,50', '10,5', '10.5', 'R$ 1.234.567,89', '-12,00']) {
      expect(lerValor(v)).toBe(lerCents(v))
    }
  })
  it('preserva o sinal de menos (bug 0.3 — cheque especial nascia positivo)', () => {
    expect(centsDeBRL('-500,00')).toBe(-50000)
    expect(centsDeBRL('-1234.56')).toBe(-123456)
    expect(centsDeBRL('-800')).toBe(-80000)
  })
  it('converte orcamentos.valor_total (reais) pra cents, mesma conta do trigger SQL', () => {
    expect(centsDeReais(11650)).toBe(1165000)
    expect(centsDeReais(0)).toBe(0)
    expect(centsDeReais(99.999)).toBe(10000)
  })
})
