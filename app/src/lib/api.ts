const BASE = 'https://nlamznxoocmygfvnqcns.supabase.co/functions/v1/'
export const TOKEN_KEY = 'eloi_admin_token' // mesmo do painel legado — sessão compartilhada

// ALLOWLIST: este client só fala com estas functions. Tabelas do app
// Financeiro (clients/services) não existem pra este código.
type Fn = 'admin-auth' | 'eloi-gestao' | 'eloi-financeiro' | 'orcamentos' | 'briefing-links'
  | 'get-briefings' | 'get-ecommerce-briefings'

// Assinantes avisados quando um 401 derruba o token — o AdminAuthProvider
// usa isso pra sincronizar o estado React (`logado`) com a sessão real.
type Cb = () => void
const expiradaCbs = new Set<Cb>()
export function onSessaoExpirada(cb: Cb): () => void {
  expiradaCbs.add(cb)
  return () => expiradaCbs.delete(cb)
}

async function call<T = unknown>(fn: Fn, action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY) || ''
  const res = await fetch(BASE + fn, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, token, ...payload }),
  })
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY)
    expiradaCbs.forEach((cb) => cb())
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
    if (t) fetch(BASE + 'admin-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout', token: t }),
    }).catch(() => {})
  },
}

// ── Wrappers por domínio — nomes de campo batem com app/src/lib/tipos.ts,
// não com admin-app/src/lib/api.ts (que vaza os bugs de campo do domain.ts antigo).
import type {
  ClienteRow, ClienteDetalhe, ServicoRow, OrcamentoRow, CaixaRow, MovimentoRow,
  MaterialRow, BriefingLinkRow, BriefingLegadoRow, FinanceiroStats,
} from './tipos'

export const clientes = {
  list: () => call<{ clientes: ClienteRow[] }>('eloi-gestao', 'clientes.list').then((r) => r.clientes),
  detail: (cliente_id: string) => call<{
    cliente: ClienteDetalhe; orcamentos: OrcamentoRow[]; servicos: ServicoRow[]
    briefings: unknown[]; movimentos: MovimentoRow[]; materiais: MaterialRow[]
    resumo: { faturado_cents: number; recebido_cents: number; a_receber_cents: number }
  }>('eloi-gestao', 'clientes.detail', { cliente_id }),
  upsert: (cliente: Partial<ClienteRow> & { id?: string }) =>
    call<{ cliente: ClienteRow }>('eloi-gestao', 'clientes.upsert', { cliente }).then((r) => r.cliente),
  gerarSenhaPortal: (cliente_id: string) =>
    call<{ senha: string }>('eloi-gestao', 'clientes.gerar_senha_portal', { cliente_id }).then((r) => r.senha),
}

export const servicos = {
  list: (filtro?: Record<string, unknown>) =>
    call<{ servicos: ServicoRow[] }>('eloi-gestao', 'servicos.list', filtro ? { filtro } : {}).then((r) => r.servicos),
  upsert: (servico: Partial<ServicoRow> & { id?: string }) =>
    call<{ servico: ServicoRow }>('eloi-gestao', 'servicos.upsert', { servico }).then((r) => r.servico),
}

export const orcamentos = {
  list: () => call<{ orcamentos: OrcamentoRow[] }>('orcamentos', 'list').then((r) => r.orcamentos),
  update: (orcamento: Partial<OrcamentoRow> & { id: string }) =>
    call<{ orcamento: OrcamentoRow }>('orcamentos', 'update', { orcamento }).then((r) => r.orcamento),
}

export const financeiro = {
  caixasList: () => call<{ caixas: CaixaRow[] }>('eloi-financeiro', 'caixas.list').then((r) => r.caixas),
  movimentosList: (filtro?: Record<string, unknown>) =>
    call<{ movimentos: MovimentoRow[] }>('eloi-financeiro', 'movimentos.list', filtro ? { filtro } : {}).then((r) => r.movimentos),
  movimentoUpsert: (movimento: Partial<MovimentoRow> & { id?: string }) =>
    call<{ movimento: MovimentoRow }>('eloi-financeiro', 'movimentos.upsert', { movimento }).then((r) => r.movimento),
  stats: () => call<FinanceiroStats>('eloi-financeiro', 'financeiro.stats'),
}

export const briefingsApi = {
  convites: () => call<{ invites: BriefingLinkRow[] }>('briefing-links', 'list').then((r) => r.invites),
  legadoVisual: () => call<{ briefings: BriefingLegadoRow[] }>('get-briefings', 'list').then((r) => r.briefings),
  legadoEcommerce: () => call<{ briefings: BriefingLegadoRow[] }>('get-ecommerce-briefings', 'list').then((r) => r.briefings),
  vincularLegadoVisual: (id: string, cliente_id: string) =>
    call('get-briefings', 'vincular_cliente', { id, cliente_id }),
  vincularLegadoEcommerce: (id: string, cliente_id: string) =>
    call('get-ecommerce-briefings', 'vincular_cliente', { id, cliente_id }),
  vincularConvite: (id: string, cliente_id: string) =>
    call('briefing-links', 'vincular_cliente', { id, cliente_id }),
}

export const materiaisApi = {
  list: (filtro?: Record<string, unknown>) =>
    call<{ materiais: MaterialRow[] }>('eloi-gestao', 'materiais.list', filtro ? { filtro } : {}).then((r) => r.materiais),
}
