import { describe, it, expect } from 'vitest'
import { decisoesDoDia, pendenciasDeServicos, prazos, semNotaFiscal } from './decisoes'
import type { ServicoRow, OrcamentoRow } from '../lib/tipos'

const AGORA = new Date('2026-07-30T12:00:00Z').getTime()
const DIA = 24 * 3600 * 1000

function srv(over: Partial<ServicoRow> = {}): ServicoRow {
  return {
    id: 's1', cliente_id: 'c1', orcamento_id: null, sub_cliente_id: null, sub_cliente: null, nota_fiscal_id: null, prazo: null, descricao: 'Identidade visual',
    valor_cents: 500000, status_execucao: 'concluida', pago: false, data_pagamento: null,
    data_competencia: null, data_vencimento: null, nf_numero: null, nf_arquivo_url: null, observacoes: null,
    valor_sugerido_cents: null, valor_sugerido_em: null, valor_sugerido_observacao: null,
    created_at: '2026-01-01', ...over,
  }
}
function orc(over: Partial<OrcamentoRow> = {}): OrcamentoRow {
  return {
    id: 'o1', created_at: '2026-07-01', updated_at: '2026-07-01', cliente: null, cliente_id: 'c1',
    titulo: 'Site novo', status: 'enviado', itens: [], valor_total: 5000, observacoes: null,
    link: null, share_token: null, numero: 1, revogado_em: null,
    complexidade: 'simples', urgencia: 'normal', desconto_pct: 0, ...over,
  }
}

describe('decisoesDoDia', () => {
  it('servico concluido sem NF vira decisao lancar_nf', () => {
    const ds = decisoesDoDia({ servicos: [srv({ nf_numero: null, pago: true })], orcamentos: [], agora: AGORA })
    expect(ds).toContainEqual(expect.objectContaining({ acao: 'lancar_nf', id: 'nf:s1' }))
  })
  it('servico concluido nao pago vira decisao cobrar_pagamento', () => {
    const ds = decisoesDoDia({ servicos: [srv({ nf_numero: '123', pago: false })], orcamentos: [], agora: AGORA })
    expect(ds).toContainEqual(expect.objectContaining({ acao: 'cobrar_pagamento', urgencia: 'normal' }))
  })
  it('servico concluido nao pago com competencia vencida vira urgencia atrasado', () => {
    const ds = decisoesDoDia({
      servicos: [srv({ nf_numero: '123', pago: false, data_competencia: '2026-07-01' })],
      orcamentos: [], agora: AGORA,
    })
    expect(ds).toContainEqual(expect.objectContaining({ acao: 'cobrar_pagamento', urgencia: 'atrasado' }))
  })
  it('servico em execucao nao gera nenhuma decisao', () => {
    const ds = decisoesDoDia({ servicos: [srv({ status_execucao: 'em_execucao' })], orcamentos: [], agora: AGORA })
    expect(ds).toHaveLength(0)
  })
  it('orcamento enviado ha 5+ dias vira cobrar_decisao', () => {
    const ds = decisoesDoDia({
      servicos: [],
      orcamentos: [orc({ updated_at: new Date(AGORA - 6 * DIA).toISOString() })],
      agora: AGORA,
    })
    expect(ds).toContainEqual(expect.objectContaining({ acao: 'cobrar_decisao', urgencia: 'normal' }))
  })
  it('orcamento enviado ha 10+ dias vira urgencia atrasado', () => {
    const ds = decisoesDoDia({
      servicos: [],
      orcamentos: [orc({ updated_at: new Date(AGORA - 11 * DIA).toISOString() })],
      agora: AGORA,
    })
    expect(ds).toContainEqual(expect.objectContaining({ acao: 'cobrar_decisao', urgencia: 'atrasado' }))
  })
  it('orcamento enviado ha menos de 5 dias nao gera decisao', () => {
    const ds = decisoesDoDia({
      servicos: [],
      orcamentos: [orc({ updated_at: new Date(AGORA - 2 * DIA).toISOString() })],
      agora: AGORA,
    })
    expect(ds).toHaveLength(0)
  })
})

describe('decisoesDoDia — regras de atenção', () => {
  it('valor sugerido pelo cliente vira decisão de aprovar', () => {
    const ds = decisoesDoDia({
      servicos: [srv({ status_execucao: 'em_execucao', valor_sugerido_cents: 90000 })],
      orcamentos: [], agora: AGORA,
    })
    expect(ds).toContainEqual(expect.objectContaining({ acao: 'aprovar_valor', valorCents: 90000 }))
  })
  it('a observação do cliente entra no detalhe — é o contexto da decisão', () => {
    const ds = decisoesDoDia({
      servicos: [srv({ valor_sugerido_cents: 1000, valor_sugerido_observacao: 'combinamos 10' })],
      orcamentos: [], agora: AGORA,
    })
    expect(ds.find((d) => d.acao === 'aprovar_valor')?.detalhe).toContain('combinamos 10')
  })
  it('a marca acompanha a decisão do serviço', () => {
    const ds = decisoesDoDia({
      servicos: [srv({ sub_cliente: 'Vibra', nf_numero: null, pago: true })],
      orcamentos: [], agora: AGORA,
    })
    expect(ds.find((d) => d.acao === 'lancar_nf')?.marca).toBe('Vibra')
  })
  it('serviço com nota vinculada não cobra nota, mesmo sem nf_numero', () => {
    const ds = decisoesDoDia({
      servicos: [srv({ nota_fiscal_id: 'n1', nf_numero: null, pago: true })],
      orcamentos: [], agora: AGORA,
    })
    expect(ds.some((d) => d.acao === 'lancar_nf')).toBe(false)
  })

  const brief = (over = {}) => ({
    id: 'b1', token: 't', cliente: 'Solarium', cliente_id: null, tipo: 'briefing',
    status: 'respondido' as const, created_at: '2026-07-01', revogado_em: null,
    responded_at: new Date(AGORA - 4 * DIA).toISOString(),
    nome: null, email: null, whatsapp: null, empresa: null, raw: {}, ...over,
  })

  it('briefing respondido e solto vira decisão de ler', () => {
    const ds = decisoesDoDia({ servicos: [], orcamentos: [], briefings: [brief()], agora: AGORA })
    expect(ds).toContainEqual(expect.objectContaining({ acao: 'ler_briefing', urgencia: 'atrasado' }))
  })
  it('briefing já vinculado a cliente não cobra nada', () => {
    const ds = decisoesDoDia({
      servicos: [], orcamentos: [], briefings: [brief({ cliente_id: 'c1' })], agora: AGORA,
    })
    expect(ds.some((d) => d.acao === 'ler_briefing')).toBe(false)
  })
  it('briefing revogado sai da fila', () => {
    const ds = decisoesDoDia({
      servicos: [], orcamentos: [], briefings: [brief({ revogado_em: '2026-07-10' })], agora: AGORA,
    })
    expect(ds.some((d) => d.acao === 'ler_briefing')).toBe(false)
  })

  it('nenhuma conta cadastrada vira uma linha só, urgente', () => {
    const ds = decisoesDoDia({ servicos: [], orcamentos: [], contas: [], agora: AGORA })
    const setup = ds.filter((d) => d.acao === 'configurar_conta')
    expect(setup).toHaveLength(1)
    expect(setup[0].urgencia).toBe('atrasado')
  })
  it('com conta cadastrada, nada de configuração aparece', () => {
    const ds = decisoesDoDia({
      servicos: [], orcamentos: [],
      contas: [{ id: 'c' } as never], agora: AGORA,
    })
    expect(ds.some((d) => d.acao === 'configurar_conta')).toBe(false)
  })
  it('sem informar contas, a regra não opina', () => {
    const ds = decisoesDoDia({ servicos: [], orcamentos: [], agora: AGORA })
    expect(ds.some((d) => d.acao === 'configurar_conta')).toBe(false)
  })
})

describe('prazos', () => {
  it('ordena por distancia, atrasados primeiro (dias negativo)', () => {
    const ps = prazos({
      servicos: [
        srv({ id: 'a', status_execucao: 'em_execucao', prazo: new Date(AGORA + 3 * DIA).toISOString().slice(0, 10) }),
        srv({ id: 'b', status_execucao: 'em_execucao', prazo: new Date(AGORA - 1 * DIA).toISOString().slice(0, 10) }),
      ],
      agora: AGORA,
    })
    expect(ps.map((p) => p.id)).toEqual(['b', 'a'])
    expect(ps[0].dias).toBeLessThan(0)
  })
  it('ignora servico concluido ou sem prazo', () => {
    const ps = prazos({
      servicos: [srv({ status_execucao: 'concluida', prazo: '2026-08-01' }), srv({ id: 'x', prazo: null })],
      agora: AGORA,
    })
    expect(ps).toHaveLength(0)
  })
})

describe('serviço com prazo vencido', () => {
  it('em execução e prazo passado vira decisão atrasada; concluído ou sem prazo não', () => {
    const d = decisoesDoDia({
      servicos: [
        srv({ id: 'a', status_execucao: 'em_execucao', prazo: new Date(AGORA - 2 * DIA).toISOString().slice(0, 10) }),
        srv({ id: 'b', status_execucao: 'concluida', prazo: new Date(AGORA - 2 * DIA).toISOString().slice(0, 10) }),
        srv({ id: 'c', status_execucao: 'em_execucao', prazo: null }),
        srv({ id: 'd', status_execucao: 'em_execucao', prazo: new Date(AGORA + 2 * DIA).toISOString().slice(0, 10) }),
      ],
      orcamentos: [], agora: AGORA,
    })
    const prazo = d.filter((x) => x.id.startsWith('prazo:'))
    expect(prazo.map((x) => x.id)).toEqual(['prazo:a'])
    expect(prazo[0]).toMatchObject({ acao: 'ver_projeto', urgencia: 'atrasado' })
    expect(prazo[0].detalhe).toContain('2 dias de atraso')
  })
})

describe('pendenciasDeServicos', () => {
  it('soma a receber, atraso e falta de nota só de serviço concluído', () => {
    const r = pendenciasDeServicos([
      srv({ id: 'a', valor_cents: 275000, data_competencia: '2026-07-01' }),            // atrasado, sem NF
      srv({ id: 'b', valor_cents: 275000, data_competencia: '2026-08-30', nota_fiscal_id: 'nf' }), // a vencer
      srv({ id: 'c', valor_cents: 100000, pago: true }),                                 // pago, sem NF
      srv({ id: 'd', valor_cents: 900000, status_execucao: 'em_execucao' }),             // fora: não concluído
    ], AGORA)
    expect(r).toEqual({
      a_receber_cents: 550000, a_receber_qtd: 2,
      atrasado_cents: 275000, atrasado_qtd: 1,
      sem_nf_cents: 375000, sem_nf_qtd: 2,
    })
  })

  it('sem competência não é atraso — mesmo critério da fila', () => {
    const r = pendenciasDeServicos([srv({ data_competencia: null })], AGORA)
    expect(r.atrasado_qtd).toBe(0)
    expect(decisoesDoDia({ servicos: [srv({ data_competencia: null })], orcamentos: [], agora: AGORA })
      .find((d) => d.id === 'pag:s1')?.urgencia).toBe('normal')
  })
})

describe('vencimento de serviço', () => {
  it('vencimento manda sobre a competência', () => {
    // Competência em julho (mês do trabalho), cliente paga em agosto: não está atrasado.
    const s = srv({ data_competencia: '2026-07-01', data_vencimento: '2026-08-15' })
    const d = decisoesDoDia({ servicos: [s], orcamentos: [], agora: AGORA }).find((x) => x.id === 'pag:s1')
    expect(d?.urgencia).toBe('normal')
    expect(d?.detalhe).toBe('Aguardando pagamento · vence 15/08')
    expect(pendenciasDeServicos([s], AGORA).atrasado_qtd).toBe(0)
  })

  it('vence no fim do dia: no próprio dia ainda não atrasou', () => {
    const r = pendenciasDeServicos([srv({ data_vencimento: '2026-07-30' })], AGORA)
    expect(r.atrasado_qtd).toBe(0)
    expect(pendenciasDeServicos([srv({ data_vencimento: '2026-07-29' })], AGORA).atrasado_qtd).toBe(1)
  })
})

describe('fuso de Brasília', () => {
  const NOITE = Date.parse('2026-07-31T00:30:00Z') // 30/07 21:30 em Brasília
  it('vence hoje às 21:30 ainda não atrasou; prazo de hoje é 0 dia', () => {
    expect(pendenciasDeServicos([srv({ data_vencimento: '2026-07-30' })], NOITE).atrasado_qtd).toBe(0)
    expect(prazos({ servicos: [srv({ status_execucao: 'em_execucao', prazo: '2026-07-30' })], agora: NOITE })[0].dias).toBe(0)
    expect(decisoesDoDia({ servicos: [srv({ status_execucao: 'em_execucao', prazo: '2026-07-30' })], orcamentos: [], agora: NOITE })
      .some((d) => d.id.startsWith('prazo:'))).toBe(false)
  })
})

describe('semNotaFiscal', () => {
  it('vale o vínculo nota_fiscal_id, não o número legado', () => {
    expect(semNotaFiscal(srv({ nf_numero: '123', nota_fiscal_id: null }))).toBe(true)
    expect(semNotaFiscal(srv({ nf_numero: null, nota_fiscal_id: 'nf1' }))).toBe(false)
  })
})
