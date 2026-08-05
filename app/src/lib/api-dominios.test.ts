import { describe, it, expect, vi, beforeEach } from 'vitest'
import { clientes, servicos, financas, briefingsApi, TOKEN_KEY } from './api'

const store: Record<string, string> = { [TOKEN_KEY]: 'tok' }
const falso = (m: Record<string, string>) => ({
  getItem: (k: string) => m[k] ?? null,
  setItem: (k: string, v: string) => { m[k] = v },
  removeItem: (k: string) => { delete m[k] },
})
vi.stubGlobal('localStorage', falso(store))
vi.stubGlobal('sessionStorage', falso({}))
beforeEach(() => { vi.restoreAllMocks() })

function mockFetch(body: unknown) {
  const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))
  vi.stubGlobal('fetch', f)
  return f
}

describe('wrappers de dominio', () => {
  it('clientes.list chama a action certa e desembrulha .clientes', async () => {
    const f = mockFetch({ clientes: [{ id: 'c1' }] })
    const r = await clientes.list()
    expect(r).toEqual([{ id: 'c1' }])
    const [url, init] = f.mock.calls[0]
    expect(url).toContain('eloi-gestao')
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ action: 'clientes.list' })
  })
  it('servicos.upsert manda o servico no payload e desembrulha .servico', async () => {
    const f = mockFetch({ servico: { id: 's1' } })
    const r = await servicos.upsert({ id: 's1', descricao: 'x' })
    expect(r).toEqual({ id: 's1' })
    const body = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toMatchObject({ action: 'servicos.upsert', servico: { id: 's1', descricao: 'x' } })
  })
  it('financas.cancelar manda id e reabrir para transacoes.cancelar', async () => {
    const f = mockFetch({ transacao: { id: 't1', status: 'cancelado' } })
    await financas.cancelar('t1')
    const [url, init] = f.mock.calls[0]
    expect(url).toContain('eloi-financas')
    expect(JSON.parse((init as RequestInit).body as string))
      .toMatchObject({ action: 'transacoes.cancelar', id: 't1', reabrir: false })
  })
  it('financas.estadoRecorrencia manda o estado pedido', async () => {
    const f = mockFetch({ recorrencia: { id: 'r1' } })
    await financas.estadoRecorrencia('r1', 'pausar')
    expect(JSON.parse((f.mock.calls[0][1] as RequestInit).body as string))
      .toMatchObject({ action: 'recorrencias.estado', id: 'r1', estado: 'pausar' })
  })
  it('briefingsApi.legadoVisual chama get-briefings com action list', async () => {
    const f = mockFetch({ briefings: [] })
    await briefingsApi.legadoVisual()
    const [url, init] = f.mock.calls[0]
    expect(url).toContain('get-briefings')
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ action: 'list' })
  })
  it('briefingsApi.vincularConvite chama briefing-links/vincular_cliente', async () => {
    const f = mockFetch({ invite: { id: 'i1' } })
    await briefingsApi.vincularConvite('i1', 'c1')
    const body = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toMatchObject({ action: 'vincular_cliente', id: 'i1', cliente_id: 'c1' })
  })
})
