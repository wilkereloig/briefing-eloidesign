import { describe, it, expect } from 'vitest'
import { itensAgenda, porDia } from './agenda'
import type { Recorrencia, ServicoRow, TarefaRow, Transacao } from '../lib/tipos'

const tx = (p: Partial<Transacao> & { id: string }): Transacao => ({
  tipo: 'entrada', contexto: 'empresa', status: 'pendente', descricao: 'x', valor_cents: 100, recebido_cents: 0,
  conta_id: null, conta_destino_id: null, categoria_id: null, cliente_id: null, servico_id: null,
  fornecedor: null, data_competencia: null, data_vencimento: '2026-09-10', data_liquidacao: null,
  forma_pagamento: null, grupo_id: null, parcela_num: null, parcela_de: null,
  recorrencia_id: null, observacoes: null, origem: 'manual', importacao_chave: null, created_at: '2026-01-01', ...p,
})
const tarefa = (p: Partial<TarefaRow> & { id: string }): TarefaRow => ({
  titulo: 't', prazo: '2026-09-10', status: 'aberta', prioridade: 'normal', cliente_id: null,
  sub_cliente_id: null, servico_id: null, observacoes: null, concluida_em: null,
  created_at: '2026-01-01', updated_at: '2026-01-01', ...p,
})
const srv = (p: Partial<ServicoRow> & { id: string }): ServicoRow => ({
  cliente_id: 'c', orcamento_id: null, sub_cliente_id: null, sub_cliente: 'Vibra', nota_fiscal_id: null,
  prazo: '2026-09-10', descricao: 'Site', valor_cents: 5000, status_execucao: 'em_execucao', pago: false,
  data_pagamento: null, data_competencia: null, nf_numero: null, nf_arquivo_url: null, observacoes: null,
  created_at: '2026-01-01', valor_sugerido_cents: null, valor_sugerido_em: null, valor_sugerido_observacao: null, ...p,
})
const rec = (p: Partial<Recorrencia> & { id: string }): Recorrencia => ({
  nome: 'Adobe', tipo: 'saida', contexto: 'empresa', valor_cents: 8990, periodicidade: 'mensal',
  dia_cobranca: null, conta_id: null, categoria_id: null, fornecedor: null, inicio: '2026-01-01', fim: null,
  proxima_cobranca: '2026-09-20', ativa: true, pausada_em: null, encerrada_em: null, observacoes: null, ...p,
})

describe('agenda integrada', () => {
  it('junta as cinco fontes e ordena por dia, prazo antes de tarefa antes de dinheiro', () => {
    const itens = itensAgenda({
      transacoes: [tx({ id: 't1' }), tx({ id: 't2', tipo: 'saida', data_vencimento: '2026-09-05' })],
      tarefas: [tarefa({ id: 'a' })],
      servicos: [srv({ id: 's' })],
      recorrencias: [rec({ id: 'r' })],
    }, '2026-09')
    expect(itens.map((i) => `${i.data}:${i.tipo}`)).toEqual([
      '2026-09-05:pagamento', '2026-09-10:prazo', '2026-09-10:tarefa', '2026-09-10:recebimento', '2026-09-20:recorrencia',
    ])
  })

  it('fora do mês, cancelado, transferência e tarefa cancelada ficam de fora', () => {
    const itens = itensAgenda({
      transacoes: [
        tx({ id: 'outro', data_vencimento: '2026-10-01' }),
        tx({ id: 'canc', status: 'cancelado' }),
        tx({ id: 'transf', tipo: 'transferencia' }),
      ],
      tarefas: [tarefa({ id: 'c', status: 'cancelada' })],
      servicos: [srv({ id: 'semprazo', prazo: null })],
      recorrencias: [rec({ id: 'p', pausada_em: '2026-08-01' })],
    }, '2026-09')
    expect(itens).toHaveLength(0)
  })

  it('recorrência já materializada não aparece duas vezes', () => {
    const itens = itensAgenda({
      transacoes: [tx({ id: 'gerada', tipo: 'saida', recorrencia_id: 'r', data_vencimento: '2026-09-20' })],
      tarefas: [], servicos: [],
      recorrencias: [rec({ id: 'r' })],
    }, '2026-09')
    expect(itens.map((i) => i.tipo)).toEqual(['pagamento'])
  })

  it('lente de contexto filtra dinheiro mas não tarefa nem prazo', () => {
    const itens = itensAgenda({
      transacoes: [tx({ id: 'p', contexto: 'pessoal' })],
      tarefas: [tarefa({ id: 'a' })],
      servicos: [srv({ id: 's' })],
      recorrencias: [],
    }, '2026-09', 'empresa')
    expect(itens.map((i) => i.tipo)).toEqual(['prazo', 'tarefa'])
  })

  it('aberto reflete o estado real: liquidado e concluído ficam com contorno', () => {
    const itens = itensAgenda({
      transacoes: [tx({ id: 'ok', status: 'realizado' })],
      tarefas: [tarefa({ id: 'feita', status: 'concluida' })],
      servicos: [srv({ id: 'entregue', status_execucao: 'concluida' })],
      recorrencias: [],
    }, '2026-09')
    expect(itens.every((i) => !i.aberto)).toBe(true)
    expect(porDia(itens).get('2026-09-10')).toHaveLength(3)
  })
})
