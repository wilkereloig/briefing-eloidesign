import { describe, it, expect } from 'vitest'
import { agrupar, buscar, normalizar, pontuar, type FonteBusca } from './busca'

const fonte = (over: Partial<FonteBusca> = {}): FonteBusca => ({
  clientes: [], subClientes: [], servicos: [], orcamentos: [], notas: [],
  transacoes: [], comandos: [],
  nomeCliente: (id) => (id ? `Cliente ${id}` : ''),
  formatarValor: (c) => `R$ ${(c / 100).toFixed(2)}`,
  ...over,
})

describe('normalizar', () => {
  it('tira acento e caixa', () => {
    expect(normalizar('Orçamento')).toBe('orcamento')
    expect(normalizar('  AÇÃO  ')).toBe('acao')
  })
})

describe('pontuar', () => {
  it('igual vale mais que começo, que vale mais que meio', () => {
    expect(pontuar('Vibra', 'vibra')).toBe(100)
    expect(pontuar('Vibra Energia', 'vibra')).toBe(70)
    expect(pontuar('Campanha Vibra', 'vibra')).toBe(50)
    expect(pontuar('Revibração', 'vibra')).toBe(20)
  })
  it('não casa devolve zero', () => {
    expect(pontuar('ASUS', 'vibra')).toBe(0)
    expect(pontuar('', 'vibra')).toBe(0)
    expect(pontuar('Vibra', '')).toBe(0)
  })
  it('ignora acento dos dois lados', () => {
    expect(pontuar('Orçamento', 'orcamento')).toBe(100)
    expect(pontuar('Orcamento', 'orçamento')).toBe(100)
  })
})

describe('buscar', () => {
  it('com menos de duas letras devolve só comandos', () => {
    const f = fonte({
      comandos: [{ id: 'c1', titulo: 'Novo cliente' }],
      clientes: [{ id: 'x', nome: 'F2 Experience' }],
    })
    const r = buscar(f, 'f')
    expect(r).toHaveLength(1)
    expect(r[0].tipo).toBe('comando')
  })

  it('acha cliente e monta o destino da ficha', () => {
    const f = fonte({ clientes: [{ id: 'abc', nome: 'F2 Experience' }] })
    const r = buscar(f, 'f2')
    expect(r[0]).toMatchObject({ tipo: 'cliente', titulo: 'F2 Experience', destino: '/admin/clientes/abc' })
  })

  it('marca casa e mostra de quem é', () => {
    const f = fonte({
      subClientes: [{ id: 'm1', nome: 'Vibra', cliente_id: 'c1', ativo: true }],
    })
    const r = buscar(f, 'vibra')
    expect(r[0].tipo).toBe('marca')
    expect(r[0].detalhe).toContain('Cliente c1')
  })

  it('marca encerrada aparece, com aviso no detalhe', () => {
    const f = fonte({ subClientes: [{ id: 'm1', nome: 'Trisul', cliente_id: 'c1', ativo: false }] })
    expect(buscar(f, 'trisul')[0].detalhe).toContain('encerrada')
  })

  it('projeto também casa pelo nome da marca, com peso menor', () => {
    const f = fonte({
      servicos: [
        { id: 's1', descricao: 'Vibra — key visual', cliente_id: 'c1', valor_cents: 1000, sub_cliente: null },
        { id: 's2', descricao: 'Key visual', cliente_id: 'c1', valor_cents: 1000, sub_cliente: 'Vibra' },
      ],
    })
    const r = buscar(f, 'vibra').filter((x) => x.tipo === 'projeto')
    expect(r.map((x) => x.id)).toEqual(['s1', 's2'])
  })

  it('corta em 5 por tipo — 40 lançamentos não empurram o cliente pra fora', () => {
    const f = fonte({
      clientes: [{ id: 'c', nome: 'Teste cliente' }],
      transacoes: Array.from({ length: 40 }, (_, i) => ({
        id: `t${i}`, descricao: `Teste ${i}`, valor_cents: 100, data_vencimento: null,
      })),
    })
    const r = buscar(f, 'teste')
    expect(r.filter((x) => x.tipo === 'lancamento')).toHaveLength(5)
    expect(r.some((x) => x.tipo === 'cliente')).toBe(true)
  })

  it('ordena por relevância entre tipos diferentes', () => {
    const f = fonte({
      clientes: [{ id: 'c1', nome: 'Constel' }],
      servicos: [{ id: 's1', descricao: 'Proposta para Constel', cliente_id: 'c1', valor_cents: 1, sub_cliente: null }],
    })
    expect(buscar(f, 'constel')[0].tipo).toBe('cliente')
  })

  it('nota sem número ainda é encontrável e não quebra', () => {
    const f = fonte({ notas: [{ id: 'n1', numero: null, cliente_id: null, valor_cents: 5000 }] })
    expect(buscar(f, 'nota')[0].titulo).toBe('Nota sem número')
  })
})

describe('agrupar', () => {
  it('ação vem primeiro e grupo vazio não aparece', () => {
    const f = fonte({
      comandos: [{ id: 'k', titulo: 'Novo cliente' }],
      clientes: [{ id: 'c1', nome: 'Cliente novo' }],
    })
    const g = agrupar(buscar(f, 'novo'))
    expect(g.map((x) => x.tipo)).toEqual(['comando', 'cliente'])
  })
})
