const BASE = 'https://nlamznxoocmygfvnqcns.supabase.co/functions/v1/'

// ponytail: token no localStorage, mesmo esquema do painel legado
function getToken(): string {
  return localStorage.getItem('eloi_admin_token') || ''
}

async function call<T = any>(fn: string, action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(BASE + fn, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, token: getToken(), ...payload }),
  })
  if (res.status === 401) {
    localStorage.removeItem('eloi_admin_token')
    window.location.href = '/admin/'
    throw new Error('Não autorizado')
  }
  if (!res.ok) {
    let msg = `Erro ${res.status}`
    try {
      const j = await res.json()
      if (j?.error) msg = String(j.error)
    } catch { /* ignore */ }
    throw new Error(msg)
  }
  return res.json()
}

const gestao = <T = any>(action: string, payload?: Record<string, unknown>) => call<T>('eloi-gestao', action, payload)
const financeiro = <T = any>(action: string, payload?: Record<string, unknown>) => call<T>('eloi-financeiro', action, payload)
const orcamentosFn = <T = any>(action: string, payload?: Record<string, unknown>) => call<T>('orcamentos', action, payload)

export const api = {
  clientes: {
    list: () => gestao('clientes.list'),
    detail: (cliente_id: string) => gestao('clientes.detail', { cliente_id }),
    upsert: (cliente: Record<string, unknown>) => gestao('clientes.upsert', cliente),
  },
  servicos: {
    list: () => gestao('servicos.list'),
    upsert: (servico: Record<string, unknown>) => gestao('servicos.upsert', servico),
    fromOrcamento: (orcamento_id: string) => gestao('servicos.from_orcamento', { orcamento_id }),
  },
  dashboard: {
    stats: () => gestao('dashboard.stats'),
  },
  entregas: {
    list: () => gestao('entregas.list'),
  },
  materiais: {
    upsert: (material: Record<string, unknown>) => gestao('materiais.upsert', material),
    delete: (id: string) => gestao('materiais.delete', { id }),
  },
  orcamentos: {
    list: () => orcamentosFn('list'),
    create: (orcamento: Record<string, unknown>) => orcamentosFn('create', { orcamento }),
    update: (orcamento: Record<string, unknown>) => orcamentosFn('update', { orcamento }),
    delete: (orcamento: Record<string, unknown>) => orcamentosFn('delete', { orcamento }),
  },
  fin: {
    caixasList: () => financeiro('caixas.list'),
    caixasUpsert: (caixa: Record<string, unknown>) => financeiro('caixas.upsert', { caixa }),
    caixasDelete: (id: string) => financeiro('caixas.delete', { id }),
    movimentosList: (filtro?: Record<string, unknown>) => financeiro('movimentos.list', { filtro }),
    movimentosUpsert: (movimento: Record<string, unknown>) => financeiro('movimentos.upsert', { movimento }),
    movimentosDelete: (id: string) => financeiro('movimentos.delete', { id }),
    stats: () => financeiro('financeiro.stats'),
  },
}
