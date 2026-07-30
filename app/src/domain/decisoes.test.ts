import { describe, it, expect } from 'vitest'
import { decisoesDoDia, prazos } from './decisoes'
import type { ServicoRow, MovimentoRow, OrcamentoRow } from '../lib/tipos'

const AGORA = new Date('2026-07-30T12:00:00Z').getTime()
const DIA = 24 * 3600 * 1000

function srv(over: Partial<ServicoRow> = {}): ServicoRow {
  return {
    id: 's1', cliente_id: 'c1', orcamento_id: null, sub_cliente: null, descricao: 'Identidade visual',
    valor_cents: 500000, status_execucao: 'concluida', pago: false, data_pagamento: null,
    data_competencia: null, nf_numero: null, nf_arquivo_url: null, observacoes: null,
    created_at: '2026-01-01', ...over,
  }
}
function mov(over: Partial<MovimentoRow> = {}): MovimentoRow {
  return {
    id: 'm1', caixa_id: 'cx1', tipo: 'entrada', status: 'previsto', descricao: 'Parcela 2',
    valor_cents: 200000, cliente_id: 'c1', servico_id: null, orcamento_id: null,
    data_competencia: null, data_movimento: null, forma_pagamento: null, observacoes: null, ...over,
  }
}
function orc(over: Partial<OrcamentoRow> = {}): OrcamentoRow {
  return {
    id: 'o1', created_at: '2026-07-01', updated_at: '2026-07-01', cliente: null, cliente_id: 'c1',
    titulo: 'Site novo', status: 'enviado', itens: [], valor_total: 5000, observacoes: null,
    link: null, share_token: null, numero: 1, revogado_em: null, ...over,
  }
}

describe('decisoesDoDia', () => {
  it('servico concluido sem NF vira decisao lancar_nf', () => {
    const ds = decisoesDoDia({ servicos: [srv({ nf_numero: null, pago: true })], movimentos: [], orcamentos: [], agora: AGORA })
    expect(ds).toContainEqual(expect.objectContaining({ acao: 'lancar_nf', id: 'nf:s1' }))
  })
  it('servico concluido nao pago vira decisao cobrar_pagamento', () => {
    const ds = decisoesDoDia({ servicos: [srv({ nf_numero: '123', pago: false })], movimentos: [], orcamentos: [], agora: AGORA })
    expect(ds).toContainEqual(expect.objectContaining({ acao: 'cobrar_pagamento', urgencia: 'normal' }))
  })
  it('servico concluido nao pago com competencia vencida vira urgencia atrasado', () => {
    const ds = decisoesDoDia({
      servicos: [srv({ nf_numero: '123', pago: false, data_competencia: '2026-07-01' })],
      movimentos: [], orcamentos: [], agora: AGORA,
    })
    expect(ds).toContainEqual(expect.objectContaining({ acao: 'cobrar_pagamento', urgencia: 'atrasado' }))
  })
  it('servico em execucao nao gera nenhuma decisao', () => {
    const ds = decisoesDoDia({ servicos: [srv({ status_execucao: 'em_execucao' })], movimentos: [], orcamentos: [], agora: AGORA })
    expect(ds).toHaveLength(0)
  })
  it('movimento previsto vencido vira conferir_recebimento', () => {
    const ds = decisoesDoDia({ servicos: [], movimentos: [mov({ data_movimento: '2026-07-20' })], orcamentos: [], agora: AGORA })
    expect(ds).toContainEqual(expect.objectContaining({ acao: 'conferir_recebimento', urgencia: 'atrasado' }))
  })
  it('movimento previsto futuro nao vira decisao', () => {
    const ds = decisoesDoDia({ servicos: [], movimentos: [mov({ data_movimento: '2026-08-20' })], orcamentos: [], agora: AGORA })
    expect(ds).toHaveLength(0)
  })
  it('orcamento enviado ha 5+ dias vira cobrar_decisao', () => {
    const ds = decisoesDoDia({
      servicos: [], movimentos: [],
      orcamentos: [orc({ updated_at: new Date(AGORA - 6 * DIA).toISOString() })],
      agora: AGORA,
    })
    expect(ds).toContainEqual(expect.objectContaining({ acao: 'cobrar_decisao', urgencia: 'normal' }))
  })
  it('orcamento enviado ha 10+ dias vira urgencia atrasado', () => {
    const ds = decisoesDoDia({
      servicos: [], movimentos: [],
      orcamentos: [orc({ updated_at: new Date(AGORA - 11 * DIA).toISOString() })],
      agora: AGORA,
    })
    expect(ds).toContainEqual(expect.objectContaining({ acao: 'cobrar_decisao', urgencia: 'atrasado' }))
  })
  it('orcamento enviado ha menos de 5 dias nao gera decisao', () => {
    const ds = decisoesDoDia({
      servicos: [], movimentos: [],
      orcamentos: [orc({ updated_at: new Date(AGORA - 2 * DIA).toISOString() })],
      agora: AGORA,
    })
    expect(ds).toHaveLength(0)
  })
})

describe('prazos', () => {
  it('ordena por distancia, atrasados primeiro (dias negativo)', () => {
    const ps = prazos({
      servicos: [
        srv({ id: 'a', status_execucao: 'em_execucao', data_competencia: new Date(AGORA + 3 * DIA).toISOString() }),
        srv({ id: 'b', status_execucao: 'em_execucao', data_competencia: new Date(AGORA - 1 * DIA).toISOString() }),
      ],
      agora: AGORA,
    })
    expect(ps.map((p) => p.id)).toEqual(['b', 'a'])
    expect(ps[0].dias).toBeLessThan(0)
  })
  it('ignora servico concluido ou sem data_competencia', () => {
    const ps = prazos({
      servicos: [srv({ status_execucao: 'concluida', data_competencia: '2026-08-01' }), srv({ id: 'x', data_competencia: null })],
      agora: AGORA,
    })
    expect(ps).toHaveLength(0)
  })
})
