const BASE = 'https://nlamznxoocmygfvnqcns.supabase.co/functions/v1/'
export const TOKEN_KEY = 'eloi_admin_token' // mesmo do painel legado — sessão compartilhada

// ALLOWLIST: este client só fala com estas functions. Tabelas do app
// Financeiro (clients/services) não existem pra este código.
type Fn = 'admin-auth' | 'eloi-gestao' | 'eloi-financeiro' | 'orcamentos' | 'briefing-links'

async function call<T = unknown>(fn: Fn, action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY) || ''
  const res = await fetch(BASE + fn, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, token, ...payload }),
  })
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY)
    throw new Error('sessão expirada')
  }
  if (!res.ok) {
    let msg = `Erro ${res.status}`
    try { const j = await res.json(); if (j?.error) msg = String(j.error) } catch { /* corpo não-JSON */ }
    throw new Error(msg)
  }
  return res.json()
}

export const api = {
  call,
  temSessao: () => !!localStorage.getItem(TOKEN_KEY),
  async login(password: string) {
    const res = await fetch(BASE + 'admin-auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', password }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(res.status === 401 ? 'senha inválida' : (d?.error || 'erro do servidor'))
    localStorage.setItem(TOKEN_KEY, d.token)
  },
  logout() {
    const t = localStorage.getItem(TOKEN_KEY)
    localStorage.removeItem(TOKEN_KEY)
    if (t) fetch(BASE + 'admin-auth', { method: 'POST', body: JSON.stringify({ action: 'logout', token: t }) })
  },
}
