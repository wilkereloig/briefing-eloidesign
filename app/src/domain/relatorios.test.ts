import { describe, it, expect } from 'vitest'
import { aging, aplicarFiltro, montarCsv, porCliente, reaisCsv, resumoFiscal, resumoProjetos } from './relatorios'
import type { NotaFiscal, ServicoRow, Transacao } from '../lib/tipos'
import type { Projeto } from './projeto'

const tx = (p: Partial<Transacao> & { id: string }): Transacao => ({
  tipo: 'entrada', contexto: 'empresa', status: 'pendente', descricao: 'x', valor_cents: 100, recebido_cents: 0,
  conta_id: null, conta_destino_id: null, categoria_id: null, cliente_id: 'c1', servico_id: null,
  fornecedor: null, data_competencia: '2026-09-01', data_vencimento: '2026-09-10', data_liquidacao: null,
  forma_pagamento: null, grupo_id: null, parcela_num: null, parcela_de: null,
  recorrencia_id: null, observacoes: null, origem: 'manual', importacao_chave: null, created_at: '2026-01-01', ...p,
})
const srv = (p: Partial<ServicoRow> & { id: string }): ServicoRow => ({
  cliente_id: 'c1', orcamento_id: null, sub_cliente_id: null, sub_cliente: null, nota_fiscal_id: null,
  prazo: null, descricao: 'Site', valor_cents: 5000, status_execucao: 'em_execucao', pago: false,
  data_pagamento: null, data_competencia: null, nf_numero: null, nf_arquivo_url: null, observacoes: null,
  created_at: '2026-01-01', valor_sugerido_cents: null, valor_sugerido_em: null, valor_sugerido_observacao: null, ...p,
})
const hoje = '2026-09-15'

describe('filtro', () => {
  const servicos = new Map([['s1', { sub_cliente_id: 'm1', sub_cliente: 'Vibra' }]])
  it('período por competência, cliente e marca via serviço', () => {
    const ts = [
      tx({ id: 'a', data_competencia: '2026-08-15' }),
      tx({ id: 'b', data_competencia: '2026-09-15', servico_id: 's1' }),
      tx({ id: 'c', data_competencia: '2026-09-20', cliente_id: 'c2' }),
    ]
    expect(aplicarFiltro(ts, { de: '2026-09-01' }, servicos).map((t) => t.id)).toEqual(['b', 'c'])
    expect(aplicarFiltro(ts, { clienteId: 'c1' }, servicos).map((t) => t.id)).toEqual(['a', 'b'])
    expect(aplicarFiltro(ts, { subClienteId: 'm1' }, servicos).map((t) => t.id)).toEqual(['b'])
  })
})

describe('por cliente', () => {
  it('recebido, a receber, projetos e ticket; ordena por recebido', () => {
    const r = porCliente([
      tx({ id: 'a', status: 'realizado', valor_cents: 1000 }),
      tx({ id: 'b', status: 'parcial', valor_cents: 1000, recebido_cents: 400 }),
      tx({ id: 'c', cliente_id: 'c2', status: 'realizado', valor_cents: 5000 }),
      tx({ id: 'd', tipo: 'saida', status: 'realizado', valor_cents: 9999 }),
    ], [srv({ id: 's1' }), srv({ id: 's2' })])
    expect(r.map((l) => l.chave)).toEqual(['c2', 'c1'])
    expect(r[1]).toEqual({ chave: 'c1', recebido_cents: 1400, a_receber_cents: 600, projetos: 2, ticket_cents: 700 })
  })

  it('por marca usa o serviço da transação', () => {
    const r = porCliente(
      [tx({ id: 'a', status: 'realizado', valor_cents: 1000, servico_id: 's1' }), tx({ id: 'b', status: 'realizado', valor_cents: 1 })],
      [srv({ id: 's1', sub_cliente_id: 'm1' })], true)
    expect(r).toEqual([{ chave: 'm1', recebido_cents: 1000, a_receber_cents: 0, projetos: 1, ticket_cents: 1000 }])
  })
})

describe('aging de recebíveis', () => {
  it('vencido por faixa e a vencer acumulado por horizonte', () => {
    const a = aging([
      tx({ id: 'v1', data_vencimento: '2026-09-10', valor_cents: 100 }),
      tx({ id: 'v2', data_vencimento: '2026-07-01', valor_cents: 200 }),
      tx({ id: 'p1', data_vencimento: '2026-09-30', valor_cents: 300 }),
      tx({ id: 'p2', data_vencimento: '2026-11-01', valor_cents: 400 }),
      tx({ id: 'pago', data_vencimento: '2026-07-01', status: 'realizado', valor_cents: 999 }),
      tx({ id: 'saida', tipo: 'saida', data_vencimento: '2026-07-01', valor_cents: 999 }),
    ], hoje)
    expect(a.vencido_cents).toBe(300)
    expect(a.faixas.find((f) => f.faixa === '1-30')).toEqual({ faixa: '1-30', qtd: 1, cents: 100 })
    expect(a.faixas.find((f) => f.faixa === '61-90')).toEqual({ faixa: '61-90', qtd: 1, cents: 200 })
    expect(a.proximos.map((p) => p.cents)).toEqual([300, 700, 700])
  })
})

describe('projetos e fiscal', () => {
  it('resumo de projetos conta atrasado por prazo', () => {
    const p = (etapa: Projeto['etapa'], servico: ServicoRow | null, v = 100): Projeto =>
      ({ id: etapa, clienteId: 'c1', titulo: etapa, etapa, valorCents: v, orcamento: null, servico })
    const r = resumoProjetos([
      p('execucao', srv({ id: 'a', prazo: '2026-09-01' })),
      p('aprovado', srv({ id: 'b' }), 50),
      p('entregue', srv({ id: 'c', status_execucao: 'concluida', prazo: '2026-09-01' })),
      p('pago', srv({ id: 'd', status_execucao: 'concluida' })),
    ], hoje)
    expect(r.atrasados).toBe(1)
    expect(r.entregues).toBe(2)
    expect(r.em_execucao_cents).toBe(150)
    expect(r.porEtapa.find((e) => e.etapa === 'execucao')).toEqual({ etapa: 'execucao', qtd: 1, cents: 100 })
  })

  it('fiscal separa emitidas de pendentes e soma imposto', () => {
    const nf = (p: Partial<NotaFiscal> & { id: string }): NotaFiscal => ({
      cliente_id: 'c1', servico_id: null, transacao_id: null, numero: null, status: 'pendente',
      valor_cents: 100, imposto_cents: 6, competencia: '2026-09', emitida_em: null, enviada_em: null,
      arquivo_path: null, observacoes: null, ...p,
    })
    const r = resumoFiscal([
      nf({ id: 'a', status: 'emitida', emitida_em: '2026-09-02' }),
      nf({ id: 'b', status: 'enviada', emitida_em: '2026-09-03', valor_cents: 200, imposto_cents: 12 }),
      nf({ id: 'c', status: 'pronta' }),
      nf({ id: 'd', status: 'cancelada' }),
    ], {})
    expect(r).toEqual({ emitidas: 2, emitido_cents: 300, imposto_cents: 18, pendentes: 1, pendente_cents: 100 })
  })
})

describe('csv', () => {
  it('ponto e vírgula, BOM e aspas só quando precisa', () => {
    const csv = montarCsv(['a', 'b'], [['x;y', 1], ['plain', null]])
    expect(csv.charCodeAt(0)).toBe(0xFEFF)
    expect(csv.slice(1)).toBe('a;b\n"x;y";1\nplain;')
    expect(reaisCsv(123456)).toBe('1234,56')
  })
})
