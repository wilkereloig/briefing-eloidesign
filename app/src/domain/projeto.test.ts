import { describe, it, expect } from 'vitest'
import { etapaDoProjeto, juntarProjetos } from './projeto'
import type { OrcamentoRow, ServicoRow } from '../lib/tipos'

function orc(over: Partial<OrcamentoRow> = {}): OrcamentoRow {
  return {
    id: 'o1', created_at: '2026-01-01', updated_at: '2026-01-01', cliente: null,
    cliente_id: 'c1', titulo: 'Site novo', status: 'enviado', itens: [], valor_total: 1000,
    observacoes: null, link: null, share_token: null, numero: 1, revogado_em: null, ...over,
  }
}
function srv(over: Partial<ServicoRow> = {}): ServicoRow {
  return {
    id: 's1', cliente_id: 'c1', orcamento_id: 'o1', sub_cliente: null, descricao: 'Site novo',
    valor_cents: 100000, status_execucao: 'aguardando_inicio', pago: false, data_pagamento: null,
    data_competencia: null, nf_numero: null, nf_arquivo_url: null, observacoes: null,
    created_at: '2026-01-01', ...over,
  }
}

describe('etapaDoProjeto', () => {
  it('rascunho ou enviado sem servico -> orcamento', () => {
    expect(etapaDoProjeto('rascunho', null)).toBe('orcamento')
    expect(etapaDoProjeto('enviado', null)).toBe('orcamento')
  })
  it('recusado sem servico -> null (fora do board)', () => {
    expect(etapaDoProjeto('recusado', null)).toBeNull()
  })
  it('aprovado sem servico vinculado -> aprovado (defensivo, trigger deveria ter criado)', () => {
    expect(etapaDoProjeto('aprovado', null)).toBe('aprovado')
  })
  it('servico aguardando_inicio -> aprovado', () => {
    expect(etapaDoProjeto('aprovado', srv({ status_execucao: 'aguardando_inicio' }))).toBe('aprovado')
  })
  it('servico em_execucao -> execucao', () => {
    expect(etapaDoProjeto('aprovado', srv({ status_execucao: 'em_execucao' }))).toBe('execucao')
  })
  it('servico concluida + nao pago -> entregue', () => {
    expect(etapaDoProjeto('aprovado', srv({ status_execucao: 'concluida', pago: false }))).toBe('entregue')
  })
  it('servico concluida + pago -> pago', () => {
    expect(etapaDoProjeto('aprovado', srv({ status_execucao: 'concluida', pago: true }))).toBe('pago')
  })
})

describe('juntarProjetos', () => {
  it('orcamento enviado sem servico vira 1 projeto na etapa orcamento', () => {
    const ps = juntarProjetos([orc()], [])
    expect(ps).toHaveLength(1)
    expect(ps[0]).toMatchObject({ etapa: 'orcamento', clienteId: 'c1', valorCents: 100000 })
  })
  it('orcamento recusado nao aparece', () => {
    expect(juntarProjetos([orc({ status: 'recusado' })], [])).toHaveLength(0)
  })
  it('orcamento aprovado + servico vinculado usa a etapa do servico, nao duplica', () => {
    const ps = juntarProjetos([orc({ status: 'aprovado' })], [srv()])
    expect(ps).toHaveLength(1)
    expect(ps[0].etapa).toBe('aprovado')
  })
  it('servico sem orcamento_id (criado a mao) e um projeto proprio', () => {
    const ps = juntarProjetos([], [srv({ orcamento_id: null, status_execucao: 'em_execucao' })])
    expect(ps).toHaveLength(1)
    expect(ps[0]).toMatchObject({ etapa: 'execucao', orcamento: null })
  })
  it('rascunho conta como etapa orcamento (trabalho ja iniciado, so nao enviado)', () => {
    const ps = juntarProjetos([orc({ status: 'rascunho' })], [])
    expect(ps[0].etapa).toBe('orcamento')
  })
})
