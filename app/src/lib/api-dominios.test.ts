import { describe, it, expect, vi, beforeEach } from 'vitest'
import { clientes, servicos, financeiro, briefingsApi, TOKEN_KEY } from './api'

const store: Record<string, string> = { [TOKEN_KEY]: 'tok' }
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v },
  removeItem: (k: string) => { delete store[k] },
})
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
  it('financeiro.movimentoUpsert chama eloi-financeiro/movimentos.upsert', async () => {
    const f = mockFetch({ movimento: { id: 'm1' } })
    await financeiro.movimentoUpsert({ descricao: 'y', valor_cents: 100 })
    const [url, init] = f.mock.calls[0]
    expect(url).toContain('eloi-financeiro')
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ action: 'movimentos.upsert' })
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
