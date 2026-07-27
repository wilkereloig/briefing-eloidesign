import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api, TOKEN_KEY, onSessaoExpirada } from './api'

const store: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v },
  removeItem: (k: string) => { delete store[k] },
})

beforeEach(() => { for (const k in store) delete store[k]; vi.restoreAllMocks() })

describe('api', () => {
  it('login guarda token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: 'abc' }), { status: 200 })))
    await api.login('senha')
    expect(store[TOKEN_KEY]).toBe('abc')
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
