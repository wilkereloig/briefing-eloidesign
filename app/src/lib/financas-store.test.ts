import { describe, it, expect } from 'vitest'
import { deslocarMes, divergenciasDeSaldo } from './financas-store'
import type { Conta, Transacao } from './tipos'

describe('deslocarMes', () => {
  it('atravessa a virada de ano nos dois sentidos', () => {
    expect(deslocarMes('2026-12', 1)).toBe('2027-01')
    expect(deslocarMes('2026-01', -1)).toBe('2025-12')
    expect(deslocarMes('2026-10', -11)).toBe('2025-11')
  })
})

// Mesma massa sintética de database/homologacao/testes/00-semente-legado.sql:
// o saldo da tela (domínio) tem de bater com eloi_saldos_contas (banco), que
// lá dá A = 45000 e B = 4300. Se um mudar, o outro muda junto.
describe('saldo da tela × saldo oficial do servidor', () => {
  const conta = (id: string, saldo = 0): Conta => ({
    id, nome: id, tipo: 'corrente', contexto: 'pessoal', instituicao: null, cor: null, saldo_inicial_cents: saldo,
    limite_cents: null, dia_fechamento: null, dia_vencimento: null, ativa: true, created_at: '2026-01-01',
  })
  const tx = (p: Partial<Transacao> & { id: string; tipo: Transacao['tipo'] }): Transacao => ({
    contexto: 'pessoal', status: 'realizado', descricao: 'x', valor_cents: 0, recebido_cents: 0,
    conta_id: null, conta_destino_id: null, categoria_id: null, cliente_id: null, servico_id: null,
    fornecedor: null, data_competencia: null, data_vencimento: null, data_liquidacao: null,
    forma_pagamento: null, grupo_id: null, parcela_num: null, parcela_de: null,
    recorrencia_id: null, observacoes: null, origem: 'manual', importacao_chave: null, emprestimo_id: null,
    created_at: '2026-01-01', ...p,
  })
  const contas = [conta('A', 10000), conta('B')]
  const ts = [
    tx({ id: '1', tipo: 'entrada', conta_id: 'A', valor_cents: 50000, recebido_cents: 50000 }),
    tx({ id: '2', tipo: 'saida', conta_id: 'A', status: 'parcial', valor_cents: 30000, recebido_cents: 10000 }),
    tx({ id: '3', tipo: 'saida', conta_id: 'A', status: 'pendente', valor_cents: 20000 }),
    tx({ id: '4', tipo: 'transferencia', conta_id: 'A', conta_destino_id: 'B', valor_cents: 5000, recebido_cents: 5000 }),
    tx({ id: '6', tipo: 'saida', conta_id: 'B', valor_cents: 700, recebido_cents: 0 }),
  ]
  it('bate com o servidor na massa de referência', () => {
    expect(divergenciasDeSaldo(contas, ts, [
      { conta_id: 'A', saldo_cents: 45000, aberto_saida_cents: 0, aberto_entrada_cents: 0, lancamentos: 4 },
      { conta_id: 'B', saldo_cents: 4300, aberto_saida_cents: 0, aberto_entrada_cents: 0, lancamentos: 2 },
    ])).toEqual([])
  })
  it('aponta a conta que diverge', () => {
    expect(divergenciasDeSaldo(contas, ts, [
      { conta_id: 'A', saldo_cents: 1, aberto_saida_cents: 0, aberto_entrada_cents: 0, lancamentos: 4 },
    ])).toEqual(['A'])
  })
})
