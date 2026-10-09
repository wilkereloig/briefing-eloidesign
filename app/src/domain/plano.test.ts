import { describe, it, expect } from 'vitest'
import { eventosPorDia, lerPlano, resumoPlano } from './plano'

// Dados sintéticos: o repositório é público.
const base = () => ({
  de: '2026-01-01', ate: '2026-01-04', limite_cheque_cents: 100000, taxa_cheque_mensal: 0.06,
  premissas: ['gasto do dia a dia fixo'],
  decisoes: [{ titulo: 'Adiar', texto: 'Combinar nova data', prazo: '2026-01-02', urgente: true }],
  dias: [
    { data: '2026-01-02', caixa_cents: 0, cheque_cents: 30000 },
    { data: '2026-01-01', caixa_cents: 5000, cheque_cents: 0 },
    { data: '2026-01-03', caixa_cents: 0, cheque_cents: 30000 },
    { data: '2026-01-04', caixa_cents: 2000, cheque_cents: 0 },
  ],
  eventos: [
    { data: '2026-01-04', descricao: 'Cliente paga', tipo: 'recebe', valor_cents: 32000, caixa_cents: 2000, quita_cheque_cents: 30000 },
    { data: '2026-01-02', descricao: 'Boleto', tipo: 'paga', valor_cents: 35000, caixa_cents: 5000, cheque_cents: 30000, nota: 'vence hoje' },
    { data: '2026-01-02', descricao: 'Adiar conta', tipo: 'decisao', valor_cents: 0 },
  ] as Record<string, unknown>[],
})

describe('lerPlano', () => {
  it('aceita o formato e ordena dias e eventos pela data', () => {
    const p = lerPlano(base())!
    expect(p.dias.map((d) => d.data)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'])
    expect(p.eventos[0].descricao).toBe('Boleto')
    expect(p.eventos[1]).toMatchObject({ tipo: 'decisao', caixa_cents: 0, cheque_cents: 0, nota: null })
  })

  it('recusa saída cuja origem não fecha com o valor', () => {
    const d = base()
    d.eventos[1] = { ...d.eventos[1], cheque_cents: 29999 }
    expect(lerPlano(d)).toBeNull()
  })

  it('recusa entrada cuja divisão não fecha com o valor', () => {
    const d = base()
    d.eventos[0] = { ...d.eventos[0], quita_cheque_cents: 1 }
    expect(lerPlano(d)).toBeNull()
  })

  it('recusa reais com fração no lugar de cents, data torta e tipo desconhecido', () => {
    expect(lerPlano({ ...base(), limite_cheque_cents: 10.5 })).toBeNull()
    const d1 = base(); d1.dias[0] = { ...d1.dias[0], data: '02/01/2026' }
    expect(lerPlano(d1)).toBeNull()
    const d2 = base(); d2.eventos[2] = { ...d2.eventos[2], tipo: 'talvez' }
    expect(lerPlano(d2)).toBeNull()
  })

  it('recusa período invertido, sem dias e lixo', () => {
    expect(lerPlano({ ...base(), de: '2026-02-01' })).toBeNull()
    expect(lerPlano({ ...base(), dias: [] })).toBeNull()
    expect(lerPlano(null)).toBeNull()
    expect(lerPlano([])).toBeNull()
  })
})

describe('resumoPlano', () => {
  it('pico, dias no cheque, juros estimados e saldo final', () => {
    const r = resumoPlano(lerPlano(base())!)
    expect(r.pico_cheque_cents).toBe(30000)
    expect(r.pico_em).toBe('2026-01-02')
    expect(r.dias_no_cheque).toBe(2)
    // 60.000 cents·dia × 6% / 30 = 120
    expect(r.juros_cheque_cents).toBe(120)
    expect(r.saldo_final_cents).toBe(2000)
    expect(r.entra_cents).toBe(32000)
    expect(r.sai_cents).toBe(35000)
  })

  it('sem cheque: pico zero e data nula', () => {
    const d = base()
    d.dias = d.dias.map((x) => ({ ...x, caixa_cents: 100, cheque_cents: 0 }))
    const r = resumoPlano(lerPlano(d)!)
    expect(r).toMatchObject({ pico_cheque_cents: 0, pico_em: null, dias_no_cheque: 0, juros_cheque_cents: 0 })
  })
})

describe('eventosPorDia', () => {
  it('agrupa na ordem do calendário', () => {
    const g = eventosPorDia(lerPlano(base())!)
    expect(g.map((x) => [x.data, x.eventos.length])).toEqual([['2026-01-02', 2], ['2026-01-04', 1]])
  })
})
