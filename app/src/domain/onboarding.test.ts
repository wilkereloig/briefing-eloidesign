import { describe, it, expect } from 'vitest'
import { passosOnboarding, precisaOnboarding } from './onboarding'
import type { Categoria, Conta, Transacao } from '../lib/tipos'

const conta = (p: Partial<Conta> & { id: string }): Conta => ({
  nome: 'c', tipo: 'corrente', contexto: 'empresa', instituicao: null, cor: null,
  saldo_inicial_cents: 0, limite_cents: null, dia_fechamento: null, dia_vencimento: null,
  ativa: true, created_at: '2026-01-01', ...p,
})
const cat: Categoria = { id: 'k', nome: 'x', contexto: 'empresa', tipo: 'saida', pai_id: null, cor: null, icone: null, ativa: true }
const tx = { id: 't', status: 'realizado' } as Transacao

describe('onboarding financeiro', () => {
  it('instalação vazia: tudo por fazer, exceto o opcional não trava', () => {
    const p = passosOnboarding([], [], [])
    expect(p.every((x) => !x.feito)).toBe(true)
    expect(precisaOnboarding(p)).toBe(true)
  })

  it('cartão sozinho não conta como conta', () => {
    const p = passosOnboarding([conta({ id: 'c', tipo: 'cartao_credito' })], [], [])
    expect(p.find((x) => x.chave === 'contas')!.feito).toBe(false)
    expect(p.find((x) => x.chave === 'cartoes')!.feito).toBe(true)
  })

  it('saldo inicial ou lançamento liquidado resolvem o passo de saldos', () => {
    expect(passosOnboarding([conta({ id: 'a', saldo_inicial_cents: 100 })], [], [])
      .find((x) => x.chave === 'saldos')!.feito).toBe(true)
    expect(passosOnboarding([conta({ id: 'a' })], [], [tx])
      .find((x) => x.chave === 'saldos')!.feito).toBe(true)
  })

  it('sem cartão mas com o resto, o onboarding some', () => {
    const p = passosOnboarding([conta({ id: 'a', saldo_inicial_cents: 1 })], [cat], [tx])
    expect(precisaOnboarding(p)).toBe(false)
  })
})
