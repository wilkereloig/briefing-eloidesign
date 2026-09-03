import { describe, it, expect } from 'vitest'
import { calcular, estaExpirado, linkPublico, VALIDADE_DIAS } from './orcamento'

// Os oito primeiros casos são os mesmos de `assets/eloi-admin/orcamento.test.js`,
// de propósito: enquanto os dois arquivos existirem, um cálculo que divergir
// aqui divergiu do que já foi enviado a cliente.
describe('calcular', () => {
  it('soma os itens sem multiplicador nem desconto', () => {
    const r = calcular({ itens: [{ nome: 'a', valor: 100 }, { nome: 'b', valor: 50 }] })
    expect(r.base).toBe(150)
    expect(r.total).toBe(150)
    expect(r.ajustes).toHaveLength(0)
  })
  it('multiplicador neutro não vira linha de ajuste', () => {
    const r = calcular({ itens: [{ nome: 'a', valor: 100 }], complexidade: 'simples', urgencia: 'normal' })
    expect(r.ajustes).toHaveLength(0)
  })
  it('complexidade média multiplica por 1,4 e registra a diferença', () => {
    const r = calcular({ itens: [{ nome: 'a', valor: 100 }], complexidade: 'media' })
    expect(r.total).toBe(140)
    expect(r.ajustes).toHaveLength(1)
    expect(r.ajustes[0].valor).toBe(40)
  })
  it('complexidade, urgência e desconto se aplicam nessa ordem', () => {
    const r = calcular({
      itens: [{ nome: 'a', valor: 100 }], complexidade: 'media', urgencia: 'expressa', desconto_pct: 10,
    })
    expect(r.total).toBe(163.8) // 100 × 1,4 × 1,3 × 0,9
    expect(r.ajustes).toHaveLength(3)
  })
  it('desconto de 100% zera', () => {
    expect(calcular({ itens: [{ nome: 'a', valor: 100 }], desconto_pct: 100 }).total).toBe(0)
  })
  it('sem item, tudo é zero', () => {
    const r = calcular({ itens: [] })
    expect(r.base).toBe(0)
    expect(r.total).toBe(0)
  })
  it('chave desconhecida ou nula cai no neutro', () => {
    const r = calcular({ itens: [{ nome: 'a', valor: 100 }], complexidade: 'inexistente', urgencia: null, desconto_pct: null })
    expect(r.total).toBe(100)
  })
  it('desconto fora de 0–100 é limitado, não rejeitado', () => {
    expect(calcular({ itens: [{ nome: 'a', valor: 100 }], desconto_pct: -50 }).total).toBe(100)
    expect(calcular({ itens: [{ nome: 'a', valor: 100 }], desconto_pct: 999 }).total).toBe(0)
  })
  it('arredonda cada item antes de somar', () => {
    expect(calcular({ itens: [{ nome: 'a', valor: 33.333 }] }).base).toBe(33.33)
  })
  it('item negativo (abatimento) entra na soma', () => {
    expect(calcular({ itens: [{ nome: 'a', valor: 100 }, { nome: 'desconto combinado', valor: -30 }] }).base).toBe(70)
  })
  it('itens ausente ou nulo não quebra', () => {
    expect(calcular({}).total).toBe(0)
    expect(calcular({ itens: null }).total).toBe(0)
  })
})

describe('estaExpirado', () => {
  const AGORA = new Date('2026-09-03T12:00:00Z').getTime()
  const diasAtras = (d: number) => new Date(AGORA - d * 86_400_000).toISOString()

  it('só enviado expira — rascunho, aprovado e recusado nunca', () => {
    for (const status of ['rascunho', 'aprovado', 'recusado']) {
      expect(estaExpirado({ status, updated_at: diasAtras(90) }, AGORA)).toBe(false)
    }
  })
  it('enviado dentro da validade não expirou', () => {
    expect(estaExpirado({ status: 'enviado', updated_at: diasAtras(VALIDADE_DIAS - 1) }, AGORA)).toBe(false)
  })
  it('enviado além da validade expirou', () => {
    expect(estaExpirado({ status: 'enviado', updated_at: diasAtras(VALIDADE_DIAS + 1) }, AGORA)).toBe(true)
  })
  it('data inválida não expira — na dúvida, a proposta continua valendo', () => {
    expect(estaExpirado({ status: 'enviado', updated_at: 'sem data' }, AGORA)).toBe(false)
  })
})

describe('linkPublico', () => {
  const O = 'https://eloi.com.br'
  it('sem link manual, monta o endereço do token', () => {
    expect(linkPublico({ share_token: 'abc' }, O)).toBe(`${O}/orcamento/?t=abc`)
  })
  it('link manual absoluto passa inteiro', () => {
    expect(linkPublico({ link: 'https://outro.com/p', share_token: 'abc' }, O)).toBe('https://outro.com/p')
  })
  it('link manual relativo ganha a origem, com ou sem barra', () => {
    expect(linkPublico({ link: '/proposta' }, O)).toBe(`${O}/proposta`)
    expect(linkPublico({ link: 'proposta' }, O)).toBe(`${O}/proposta`)
  })
  it('sem link e sem token, devolve vazio em vez de endereço quebrado', () => {
    expect(linkPublico({}, O)).toBe('')
    expect(linkPublico({ share_token: null }, O)).toBe('')
  })
})
