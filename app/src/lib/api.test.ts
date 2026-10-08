import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api, ErroAcesso, TOKEN_KEY, onSessaoExpirada, acaoSoLeitura, ambienteDoHost, escritaBloqueada, limparDadosLocais } from './api'

const store: Record<string, string> = {}
const sessao: Record<string, string> = {}
const falso = (m: Record<string, string>) => ({
  getItem: (k: string) => m[k] ?? null,
  setItem: (k: string, v: string) => { m[k] = v },
  removeItem: (k: string) => { delete m[k] },
})
vi.stubGlobal('localStorage', falso(store))
vi.stubGlobal('sessionStorage', falso(sessao))

beforeEach(() => {
  for (const k in store) delete store[k]
  for (const k in sessao) delete sessao[k]
  vi.restoreAllMocks()
})

describe('api', () => {
  it('login guarda token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: 'abc' }), { status: 200 })))
    await api.login('senha')
    expect(store[TOKEN_KEY]).toBe('abc')
  })
  it('sem "manter conectado" o token fica só na sessão do navegador', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: 'abc' }), { status: 200 })))
    await api.login('senha', false)
    expect(sessao[TOKEN_KEY]).toBe('abc')
    expect(store[TOKEN_KEY]).toBeUndefined()
  })
  it('429 vira ErroAcesso com motivo bloqueado, não "senha inválida"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'muitas tentativas' }), { status: 429 })))
    await expect(api.login('x')).rejects.toMatchObject({ motivo: 'bloqueado' })
  })
  it('401 no login vira motivo senha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'senha inválida' }), { status: 401 })))
    await expect(api.login('x')).rejects.toBeInstanceOf(ErroAcesso)
  })
  it('call injeta token no body', async () => {
    store[TOKEN_KEY] = 'tok123'
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', f)
    await api.call('eloi-gestao', 'clientes.list')
    const body = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toMatchObject({ action: 'clientes.list', token: 'tok123' })
  })
  it('401 derruba token e lança', async () => {
    store[TOKEN_KEY] = 'morto'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })))
    await expect(api.call('eloi-gestao', 'x')).rejects.toThrow()
    expect(store[TOKEN_KEY]).toBeUndefined()
  })
  it('401 notifica assinantes de sessão expirada', async () => {
    store[TOKEN_KEY] = 'morto'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })))
    let avisado = false
    const off = onSessaoExpirada(() => { avisado = true })
    await expect(api.call('eloi-gestao', 'x')).rejects.toThrow()
    expect(avisado).toBe(true)
    off()
  })
})

describe('ambiente: preview e local não gravam em produção', () => {
  it('reconhece produção, preview da Vercel e local', () => {
    expect(ambienteDoHost('briefing-eloidesign.vercel.app')).toBe('producao')
    expect(ambienteDoHost('briefing-eloidesign-git-evolucao-wilkereloig.vercel.app')).toBe('preview')
    expect(ambienteDoHost('localhost')).toBe('local')
    expect(ambienteDoHost(undefined)).toBe('producao')
  })
  it('separa leitura de escrita', () => {
    for (const a of ['bootstrap', 'transacoes.list', 'clientes.detail', 'arquivos.url', 'nf.view_url', 'list', 'transacoes.liquidacoes',
      'relatorios.perspectivas', 'cartoes.pagamentos', 'importacoes.list'])
      expect(acaoSoLeitura(a)).toBe(true)
    for (const a of ['transacoes.liquidar', 'recorrencias.gerar', 'transacoes.upsert', 'contas.upsert', 'transacoes.pagar_fatura',
      'transacoes.estornar_pagamento_fatura', 'importacoes.reverter'])
      expect(acaoSoLeitura(a)).toBe(false)
  })
  it('bloqueia escrita em preview/local contra produção; libera com backend próprio ou liberação explícita', () => {
    expect(escritaBloqueada('transacoes.liquidar', 'localhost')).toBe(true)
    expect(escritaBloqueada('recorrencias.gerar', 'x-git-y.vercel.app')).toBe(true)
    expect(escritaBloqueada('transacoes.list', 'localhost')).toBe(false)
    expect(escritaBloqueada('transacoes.liquidar', 'briefing-eloidesign.vercel.app')).toBe(false)
    expect(escritaBloqueada('transacoes.liquidar', 'localhost', 'http://127.0.0.1:54321/functions/v1/')).toBe(false)
    expect(escritaBloqueada('transacoes.liquidar', 'localhost', undefined, true)).toBe(false)
  })
})

describe('logout limpa rastros locais', () => {
  it('remove buscas recentes e paginação; mantém o resto', () => {
    const m = new Map<string, string>([['eloi_busca_recentes', '[...]'], ['pag:lancamentos', '2'], ['tema', 'escuro']])
    const a = {
      get length() { return m.size }, key: (i: number) => [...m.keys()][i] ?? null,
      getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) },
      removeItem: (k: string) => { m.delete(k) }, clear: () => m.clear(),
    } as Storage
    limparDadosLocais([a])
    expect([...m.keys()]).toEqual(['tema'])
  })
})
