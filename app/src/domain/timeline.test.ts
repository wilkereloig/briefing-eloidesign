import { describe, it, expect } from 'vitest'
import { timeline, type FonteTimeline } from './timeline'

const fonte = (over: Partial<FonteTimeline> = {}): FonteTimeline => ({
  servicos: [], orcamentos: [], notas: [], briefings: [], materiais: [], ...over,
})

describe('timeline', () => {
  it('mais recente primeiro', () => {
    const ev = timeline(fonte({
      servicos: [
        { id: 'a', descricao: 'Antigo', created_at: '2026-01-10', status_execucao: 'concluida', pago: false, data_pagamento: null, sub_cliente: null },
        { id: 'b', descricao: 'Novo', created_at: '2026-08-10', status_execucao: 'concluida', pago: false, data_pagamento: null, sub_cliente: null },
      ],
    }))
    expect(ev.map((e) => e.titulo)).toEqual(['Novo', 'Antigo'])
  })

  it('proposta criada e aprovada viram dois eventos', () => {
    const ev = timeline(fonte({
      orcamentos: [{ id: 'o1', titulo: 'Site', status: 'aprovado', created_at: '2026-05-01', updated_at: '2026-05-09', numero: 7 }],
    }))
    expect(ev.map((e) => e.tipo)).toEqual(['proposta_aprovada', 'proposta_criada'])
    expect(ev[0].titulo).toBe('#7 Site')
  })

  it('proposta nunca tocada não duplica a data de criação', () => {
    const ev = timeline(fonte({
      orcamentos: [{ id: 'o1', titulo: 'Site', status: 'rascunho', created_at: '2026-05-01', updated_at: '2026-05-01', numero: null }],
    }))
    expect(ev).toHaveLength(1)
    expect(ev[0].tipo).toBe('proposta_criada')
  })

  it('proposta enviada admite que a data é aproximada', () => {
    const ev = timeline(fonte({
      orcamentos: [{ id: 'o1', titulo: 'Site', status: 'enviado', created_at: '2026-05-01', updated_at: '2026-05-04', numero: null }],
    }))
    expect(ev[0]).toMatchObject({ tipo: 'proposta_enviada', detalhe: 'data aproximada' })
  })

  it('pagamento só entra quando pago e com data', () => {
    const base = { id: 's', descricao: 'X', created_at: '2026-03-01', status_execucao: 'concluida', sub_cliente: null }
    expect(timeline(fonte({ servicos: [{ ...base, pago: true, data_pagamento: '2026-04-02' }] })))
      .toHaveLength(2)
    expect(timeline(fonte({ servicos: [{ ...base, pago: true, data_pagamento: null }] })))
      .toHaveLength(1)
    expect(timeline(fonte({ servicos: [{ ...base, pago: false, data_pagamento: '2026-04-02' }] })))
      .toHaveLength(1)
  })

  it('nota sem emissão cai na competência; sem as duas, não entra', () => {
    expect(timeline(fonte({ notas: [{ id: 'n', numero: '4', emitida_em: null, competencia: '2026-02-05' }] }))[0].data)
      .toBe('2026-02-05')
    expect(timeline(fonte({ notas: [{ id: 'n', numero: '4', emitida_em: null, competencia: null }] })))
      .toHaveLength(0)
  })

  it('briefing gera envio, e resposta só quando respondido', () => {
    const b = { id: 'b', cliente: 'Solarium', tipo: 'briefing', created_at: '2026-06-01' }
    expect(timeline(fonte({ briefings: [{ ...b, status: 'pendente', responded_at: null }] })))
      .toHaveLength(1)
    const ev = timeline(fonte({ briefings: [{ ...b, status: 'respondido', responded_at: '2026-06-05' }] }))
    expect(ev.map((e) => e.tipo)).toEqual(['briefing_respondido', 'briefing_enviado'])
  })

  it('material sem data de publicação não entra', () => {
    expect(timeline(fonte({ materiais: [{ id: 'm', titulo: 'Logo', published_at: null }] })))
      .toHaveLength(0)
    expect(timeline(fonte({ materiais: [{ id: 'm', titulo: 'Logo', published_at: '2026-07-07' }] })))
      .toHaveLength(1)
  })

  it('corta a hora — a linha do tempo é por dia', () => {
    const ev = timeline(fonte({
      servicos: [{ id: 's', descricao: 'X', created_at: '2026-03-01T18:22:00Z', status_execucao: 'concluida', pago: false, data_pagamento: null, sub_cliente: null }],
    }))
    expect(ev[0].data).toBe('2026-03-01')
  })
})
