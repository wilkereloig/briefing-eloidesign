import { describe, it, expect } from 'vitest'
import { deslocarMes, ultimoDiaDoMes } from './financas-store'

describe('ultimoDiaDoMes', () => {
  it('acha o último dia real, não sempre 31 (bug 0.1)', () => {
    expect(ultimoDiaDoMes('2026-09')).toBe('2026-09-30')
    expect(ultimoDiaDoMes('2027-02')).toBe('2027-02-28')
    expect(ultimoDiaDoMes('2028-02')).toBe('2028-02-29') // bissexto
    expect(ultimoDiaDoMes('2026-04')).toBe('2026-04-30')
    expect(ultimoDiaDoMes('2026-06')).toBe('2026-06-30')
    expect(ultimoDiaDoMes('2026-11')).toBe('2026-11-30')
    expect(ultimoDiaDoMes('2026-08')).toBe('2026-08-31')
  })

  it('nunca gera data que o Postgres recusa, pra janela de deslocarMes(mes, 12)', () => {
    for (let m = 1; m <= 12; m++) {
      const mes = `2026-${String(m).padStart(2, '0')}`
      const ate = ultimoDiaDoMes(deslocarMes(mes, 12))
      expect(ate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(new Date(ate + 'T00:00:00Z').toISOString().slice(0, 10)).toBe(ate)
    }
  })
})
