import { describe, it, expect } from 'vitest'
import { diasEntre, hojeISO, mesAtual } from './datas'

describe('hojeISO / mesAtual (fuso de Brasília)', () => {
  it('21:30 em Brasília ainda é hoje, mesmo já sendo amanhã em UTC', () => {
    // 2026-10-08 21:30 BRT = 2026-10-09 00:30 UTC
    const agora = Date.parse('2026-10-09T00:30:00Z')
    expect(new Date(agora).toISOString().slice(0, 10)).toBe('2026-10-09')
    expect(hojeISO(agora)).toBe('2026-10-08')
  })
  it('último dia do mês às 22h não pula para o mês seguinte', () => {
    const agora = Date.parse('2026-11-01T01:00:00Z') // 31/10 22:00 BRT
    expect(mesAtual(agora)).toBe('2026-10')
  })
  it('de manhã cedo bate com UTC', () => {
    expect(hojeISO(Date.parse('2026-10-08T12:00:00Z'))).toBe('2026-10-08')
  })
  it('diasEntre conta dias de calendário', () => {
    expect(diasEntre('2026-10-08', '2026-10-08')).toBe(0)
    expect(diasEntre('2026-10-08', '2026-10-05')).toBe(-3)
    expect(diasEntre('2026-02-27', '2026-03-02')).toBe(3)
  })
})
