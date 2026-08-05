const BASE = 'https://nlamznxoocmygfvnqcns.supabase.co/functions/v1/'
export const TOKEN_KEY = 'eloi_admin_token' // mesmo do painel legado — sessão compartilhada

// ALLOWLIST: este client só fala com estas functions. Tabelas do app
// Financeiro (clients/services) não existem pra este código.
type Fn = 'admin-auth' | 'eloi-gestao' | 'eloi-financeiro' | 'eloi-financas' | 'orcamentos'
  | 'briefing-links' | 'get-briefings' | 'get-ecommerce-briefings'

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

// ── núcleo financeiro (edge eloi-financas) ──────────────────────────────────
// Parcelar e liquidar NÃO têm equivalente local de propósito: são as duas
// operações que o servidor precisa arbitrar (ver edge-functions/eloi-financas.ts).
import type {
  Conta, Categoria, Transacao, Recorrencia, NotaFiscal, Meta, Arquivo, Contexto,
} from './tipos'

export interface FiltroTransacao {
  contexto?: Contexto
  conta_id?: string
  cliente_id?: string
  categoria_id?: string
  tipo?: Transacao['tipo']
  status?: Transacao['status']
  em_aberto?: boolean
  /** Janela por competência — sem ela o painel puxaria o histórico inteiro. */
  de?: string
  ate?: string
  limite?: number
}

export const financas = {
  /** Dados de referência numa chamada: contas, categorias, recorrências, metas. */
  bootstrap: () => call<{
    contas: Conta[]; categorias: Categoria[]; recorrencias: Recorrencia[]; metas: Meta[]
  }>('eloi-financas', 'bootstrap'),

  transacoes: (filtro?: FiltroTransacao) =>
    call<{ transacoes: Transacao[] }>('eloi-financas', 'transacoes.list', filtro ? { filtro } : {})
      .then((r) => r.transacoes),
  salvar: (transacao: Partial<Transacao>) =>
    call<{ transacao: Transacao }>('eloi-financas', 'transacoes.upsert', { transacao }).then((r) => r.transacao),
  liquidar: (id: string, valor_cents: number, data_liquidacao?: string, forma_pagamento?: string) =>
    call<{ transacao: Transacao }>('eloi-financas', 'transacoes.liquidar',
      { id, valor_cents, data_liquidacao, forma_pagamento }).then((r) => r.transacao),
  parcelar: (transacao: Partial<Transacao>, parcelas: number) =>
    call<{ transacoes: Transacao[]; grupo_id: string }>('eloi-financas', 'transacoes.parcelar',
      { transacao, parcelas }),
  remover: (alvo: { id?: string; grupo_id?: string }) =>
    call<{ ok: true }>('eloi-financas', 'transacoes.remover', alvo),

  salvarConta: (conta: Partial<Conta>) =>
    call<{ conta: Conta }>('eloi-financas', 'contas.upsert', { conta }).then((r) => r.conta),
  salvarCategoria: (categoria: Partial<Categoria>) =>
    call<{ categoria: Categoria }>('eloi-financas', 'categorias.upsert', { categoria }).then((r) => r.categoria),

  salvarRecorrencia: (recorrencia: Partial<Recorrencia>) =>
    call<{ recorrencia: Recorrencia }>('eloi-financas', 'recorrencias.upsert', { recorrencia })
      .then((r) => r.recorrencia),
  /** Materializa as cobranças devidas. Idempotente por vencimento. */
  gerarRecorrencias: () =>
    call<{ criadas: number; transacoes: Transacao[] }>('eloi-financas', 'recorrencias.gerar'),

  notas: (filtro?: { status?: NotaFiscal['status']; cliente_id?: string }) =>
    call<{ notas: NotaFiscal[] }>('eloi-financas', 'nf.list', filtro ? { filtro } : {}).then((r) => r.notas),
  salvarNota: (nota: Partial<NotaFiscal>) =>
    call<{ nota: NotaFiscal }>('eloi-financas', 'nf.upsert', { nota }).then((r) => r.nota),

  salvarMeta: (meta: Partial<Meta>) =>
    call<{ meta: Meta }>('eloi-financas', 'metas.upsert', { meta }).then((r) => r.meta),
  desativarMeta: (id: string) => call<{ ok: true }>('eloi-financas', 'metas.desativar', { id }),

  arquivos: (filtro?: Partial<Record<'cliente_id' | 'servico_id' | 'transacao_id' | 'nota_fiscal_id' | 'categoria', string>>) =>
    call<{ arquivos: Arquivo[] }>('eloi-financas', 'arquivos.list', filtro ? { filtro } : {}).then((r) => r.arquivos),
  salvarArquivo: (arquivo: Partial<Arquivo>) =>
    call<{ arquivo: Arquivo }>('eloi-financas', 'arquivos.upsert', { arquivo }).then((r) => r.arquivo),
  removerArquivo: (id: string) => call<{ ok: true }>('eloi-financas', 'arquivos.remover', { id }),
  /** Link temporário de leitura — o bucket é privado. */
  urlArquivo: (path: string) =>
    call<{ url: string }>('eloi-financas', 'arquivos.url', { path }).then((r) => r.url),

  /**
   * Envia o binário direto do navegador para o Storage com URL assinada: o
   * arquivo não passa pela edge (limite de corpo) e a service_role não vaza.
   */
  async enviarArquivo(file: File): Promise<string> {
    const { path, signedUrl } = await call<{ path: string; signedUrl: string }>(
      'eloi-financas', 'arquivos.upload_url', { nome: file.name })
    const res = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    })
    if (!res.ok) throw new Error(`falha no envio (${res.status})`)
    return path
  },
}

export const materiaisApi = {
  list: (filtro?: Record<string, unknown>) =>
    call<{ materiais: MaterialRow[] }>('eloi-gestao', 'materiais.list', filtro ? { filtro } : {}).then((r) => r.materiais),
}
