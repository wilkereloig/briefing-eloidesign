const PRODUCAO = 'https://nlamznxoocmygfvnqcns.supabase.co/functions/v1/'
/** Homologação: `VITE_FUNCTIONS_URL` aponta para outro backend (Supabase de
 *  homologação ou local). Sem ela, o painel fala com produção. */
const BASE = (import.meta.env.VITE_FUNCTIONS_URL as string | undefined) || PRODUCAO
export const HOST_PRODUCAO = 'briefing-eloidesign.vercel.app'

export type Ambiente = 'producao' | 'preview' | 'local'
/** Onde o painel está rodando, pelo host. Preview da Vercel (qualquer outro
 *  *.vercel.app) e localhost NÃO são produção. Sem `location` (testes) = produção. */
export function ambienteDoHost(host: string | undefined): Ambiente {
  if (!host) return 'producao'
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return 'local'
  if (host.endsWith('.vercel.app') && host !== HOST_PRODUCAO) return 'preview'
  return 'producao'
}

/** Ações que só leem. Em preview/local apontando para produção, só estas passam:
 *  rodar o painel fora de produção não pode gravar no banco real por acidente
 *  (inclui `recorrencias.gerar`, que escreve ao abrir o painel). */
export function acaoSoLeitura(action: string): boolean {
  return /^(bootstrap|list|login|logout|catalog_list)$|\.(list|detail|url|liquidacoes|perspectivas|pagamentos)$|view_url$/.test(action)
}

/** Bloqueio de escrita fora de produção, a menos que o backend seja outro
 *  (VITE_FUNCTIONS_URL) ou a liberação seja explícita (VITE_PERMITIR_ESCRITA_PRODUCAO=1). */
export function escritaBloqueada(action: string, host: string | undefined, base = BASE,
  liberado = import.meta.env.VITE_PERMITIR_ESCRITA_PRODUCAO === '1'): boolean {
  return base === PRODUCAO && !liberado && ambienteDoHost(host) !== 'producao' && !acaoSoLeitura(action)
}
export const TOKEN_KEY = 'eloi_admin_token' // mesmo do painel legado — sessão compartilhada

// ALLOWLIST: este client só fala com estas functions. Tabelas do app
// Financeiro (clients/services) não existem pra este código.
// `eloi-financeiro` saiu da lista: o caixa/movimento antigo é do painel estático
// legado (/gestao). Este app usa só o núcleo eloi_* via eloi-financas.
type Fn = 'admin-auth' | 'eloi-gestao' | 'eloi-financas' | 'orcamentos'
  | 'briefing-links' | 'get-briefings' | 'get-ecommerce-briefings'

// Assinantes avisados quando um 401 derruba o token — o AdminAuthProvider
// usa isso pra sincronizar o estado React (`logado`) com a sessão real.
type Cb = () => void
const expiradaCbs = new Set<Cb>()
export function onSessaoExpirada(cb: Cb): () => void {
  expiradaCbs.add(cb)
  return () => expiradaCbs.delete(cb)
}

/**
 * "Manter conectado" desligado guarda o token em sessionStorage: fechou a aba,
 * a sessão morre no navegador. Ler dos dois é obrigatório — senão desligar a
 * opção derrubaria o login na primeira chamada.
 */
export function lerToken(): string {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || ''
}
/** Rastros do painel no navegador que carregam dado de cliente/dinheiro
 *  (buscas recentes, página das listas). Saem no logout. */
export function limparDadosLocais(armazens: Storage[] = [localStorage, sessionStorage]) {
  for (const a of armazens) {
    try {
      const chaves: string[] = []
      for (let i = 0; i < a.length; i++) { const k = a.key(i); if (k) chaves.push(k) }
      for (const k of chaves) if (k === 'eloi_busca_recentes' || k.startsWith('pag:')) a.removeItem(k)
    } catch { /* armazenamento bloqueado (modo privado): nada a limpar */ }
  }
}
function limparToken() {
  sessionStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(TOKEN_KEY)
}

/** Erro de autenticação com o motivo separado da mensagem, para a tela decidir
 *  o que mostrar sem interpretar texto. */
export type MotivoAcesso = 'senha' | 'bloqueado' | 'servidor'
export class ErroAcesso extends Error {
  motivo: MotivoAcesso
  constructor(message: string, motivo: MotivoAcesso) {
    super(message)
    this.name = 'ErroAcesso'
    this.motivo = motivo
  }
}

async function call<T = unknown>(fn: Fn, action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (escritaBloqueada(action, globalThis.location?.hostname)) {
    throw new Error(`ambiente ${ambienteDoHost(globalThis.location?.hostname)} apontando para produção: gravação bloqueada (${action})`)
  }
  const token = lerToken()
  const res = await fetch(BASE + fn, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, token, ...payload }),
  })
  if (res.status === 401) {
    limparToken()
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
  temSessao: () => !!lerToken(),
  async login(password: string, manterConectado = true) {
    const res = await fetch(BASE + 'admin-auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', password }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      // 429 é bloqueio temporário por tentativas (admin-auth conta 5 e trava
      // 15 min). Dizer "senha inválida" aí faria o Wilke tentar de novo à toa.
      if (res.status === 429) {
        throw new ErroAcesso('Muitas tentativas seguidas. Espere 15 minutos e tente de novo.', 'bloqueado')
      }
      if (res.status === 401) throw new ErroAcesso('Senha incorreta.', 'senha')
      throw new ErroAcesso(d?.error || 'Não foi possível falar com o servidor.', 'servidor')
    }
    limparToken()
    const onde = manterConectado ? localStorage : sessionStorage
    onde.setItem(TOKEN_KEY, d.token)
  },
  logout() {
    const t = lerToken()
    limparToken()
    limparDadosLocais()
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
  TarefaRow,
  ClienteRow, ClienteDetalhe, ContatoRow, ServicoRow, SubClienteRow, OrcamentoRow,
  MaterialRow, BriefingLinkRow, BriefingLegadoRow,
} from './tipos'

export const clientes = {
  list: () => call<{ clientes: ClienteRow[] }>('eloi-gestao', 'clientes.list').then((r) => r.clientes),
  detail: (cliente_id: string) => call<{
    cliente: ClienteDetalhe; orcamentos: OrcamentoRow[]; servicos: ServicoRow[]
    briefings: unknown[]; materiais: MaterialRow[]
  }>('eloi-gestao', 'clientes.detail', { cliente_id }),
  upsert: (cliente: Partial<ClienteRow> & { id?: string; arquivado?: boolean }) =>
    call<{ cliente: ClienteRow }>('eloi-gestao', 'clientes.upsert', { cliente }).then((r) => r.cliente),
  remover: (id: string) => call<{ ok: true }>('eloi-gestao', 'clientes.delete', { id }),
  gerarSenhaPortal: (cliente_id: string) =>
    call<{ senha: string }>('eloi-gestao', 'clientes.gerar_senha_portal', { cliente_id }).then((r) => r.senha),
}

export const servicos = {
  list: (filtro?: Record<string, unknown>) =>
    call<{ servicos: ServicoRow[] }>('eloi-gestao', 'servicos.list', filtro ? { filtro } : {}).then((r) => r.servicos),
  upsert: (servico: Partial<ServicoRow> & { id?: string }) =>
    call<{ servico: ServicoRow }>('eloi-gestao', 'servicos.upsert', { servico }).then((r) => r.servico),
  aprovarValorSugerido: (servico_id: string) =>
    call<{ servico: ServicoRow }>('eloi-gestao', 'servicos.aprovar_valor_sugerido', { servico_id }).then((r) => r.servico),
  rejeitarValorSugerido: (servico_id: string) =>
    call<{ servico: ServicoRow }>('eloi-gestao', 'servicos.rejeitar_valor_sugerido', { servico_id }).then((r) => r.servico),
  remover: (id: string) => call<{ ok: true }>('eloi-gestao', 'servicos.delete', { id }),
  /** Grava vários valores numa chamada (edição em linha). Serviço pago é ignorado no servidor. */
  salvarValores: (valores: { id: string; valor_cents: number }[]) =>
    call<{ servicos: ServicoRow[]; ignorados: number }>('eloi-gestao', 'servicos.valores_lote', { valores }),
}

export const subClientes = {
  list: (cliente_id?: string) =>
    call<{ subclientes: SubClienteRow[] }>('eloi-gestao', 'subclientes.list', cliente_id ? { cliente_id } : {})
      .then((r) => r.subclientes),
  upsert: (subcliente: Partial<SubClienteRow> & { cliente_id: string; nome: string }) =>
    call<{ subcliente: SubClienteRow }>('eloi-gestao', 'subclientes.upsert', { subcliente }).then((r) => r.subcliente),
  remover: (id: string) => call<{ ok: true }>('eloi-gestao', 'subclientes.delete', { id }),
}

export const tarefas = {
  list: () => call<{ tarefas: TarefaRow[] }>('eloi-gestao', 'tarefas.list').then((r) => r.tarefas),
  upsert: (tarefa: Partial<TarefaRow> & { titulo: string }) =>
    call<{ tarefa: TarefaRow }>('eloi-gestao', 'tarefas.upsert', { tarefa }).then((r) => r.tarefa),
  remover: (id: string) => call<{ ok: true }>('eloi-gestao', 'tarefas.delete', { id }),
}

export const contatos = {
  list: (cliente_id: string) =>
    call<{ contatos: ContatoRow[] }>('eloi-gestao', 'contatos.list', { cliente_id }).then((r) => r.contatos),
  upsert: (contato: Partial<ContatoRow> & { cliente_id: string; nome: string }) =>
    call<{ contato: ContatoRow }>('eloi-gestao', 'contatos.upsert', { contato }).then((r) => r.contato),
  remover: (id: string) => call<{ ok: true }>('eloi-gestao', 'contatos.delete', { id }),
}

/** Item reutilizável do calculador de proposta (`catalogo_servicos`). */
export interface CatalogoItem {
  id: string
  nome: string
  categoria: string | null
  preco_base: number
  unidade: string
  ativo: boolean
  ordem: number
}

export const orcamentos = {
  list: () => call<{ orcamentos: OrcamentoRow[] }>('orcamentos', 'list').then((r) => r.orcamentos),
  criar: (orcamento: Partial<OrcamentoRow>) =>
    call<{ orcamento: OrcamentoRow }>('orcamentos', 'create', { orcamento }).then((r) => r.orcamento),
  update: (orcamento: Partial<OrcamentoRow> & { id: string }) =>
    call<{ orcamento: OrcamentoRow }>('orcamentos', 'update', { orcamento }).then((r) => r.orcamento),
  remover: (id: string) => call<{ ok: true }>('orcamentos', 'delete', { id }),
  catalogo: () => call<{ servicos: CatalogoItem[] }>('orcamentos', 'catalog_list').then((r) => r.servicos),
  salvarCatalogo: (servico: Partial<CatalogoItem>) =>
    call<{ servico: CatalogoItem }>('orcamentos', 'catalog_save', { servico }).then((r) => r.servico),
  removerCatalogo: (id: string) => call<{ ok: true }>('orcamentos', 'catalog_delete', { id }),
  /** Cria o serviço de um orçamento aprovado. Idempotente: devolve o que já existe. */
  gerarServico: (orcamento_id: string) =>
    call<{ servico: ServicoRow; ja_existia: boolean }>('eloi-gestao', 'servicos.from_orcamento', { orcamento_id }),
}

export const briefingsApi = {
  convites: () => call<{ invites: BriefingLinkRow[] }>('briefing-links', 'list').then((r) => r.invites),
  legadoVisual: () => call<{ briefings: BriefingLegadoRow[] }>('get-briefings', 'list').then((r) => r.briefings),
  legadoEcommerce: () => call<{ briefings: BriefingLegadoRow[] }>('get-ecommerce-briefings', 'list').then((r) => r.briefings),
  criarConvite: (dados: { cliente: string; tipo: string; cliente_id?: string | null }) =>
    call<{ invite: BriefingLinkRow }>('briefing-links', 'create', dados).then((r) => r.invite),
  vincularConvite: (id: string, cliente_id: string) =>
    call<{ invite: BriefingLinkRow }>('briefing-links', 'vincular_cliente', { id, cliente_id }).then((r) => r.invite),
  reabrirConvite: (id: string) =>
    call<{ invite: BriefingLinkRow }>('briefing-links', 'reabrir', { id }).then((r) => r.invite),
  revogarConvite: (id: string, revogar = true) =>
    call<{ invite: BriefingLinkRow }>('briefing-links', 'revogar', { id, revogar }).then((r) => r.invite),
  removerConvite: (id: string) => call<{ ok: true }>('briefing-links', 'delete', { id }),
  vincularLegadoVisual: (id: string, cliente_id: string) =>
    call('get-briefings', 'vincular_cliente', { id, cliente_id }),
  vincularLegadoEcommerce: (id: string, cliente_id: string) =>
    call('get-ecommerce-briefings', 'vincular_cliente', { id, cliente_id }),
}

// ── núcleo financeiro (edge eloi-financas) ──────────────────────────────────
// Parcelar e liquidar NÃO têm equivalente local de propósito: são as duas
// operações que o servidor precisa arbitrar (ver edge-functions/eloi-financas.ts).
import type {
  Conta, Categoria, Conferencia, Transacao, Recorrencia, NotaFiscal, Meta, Arquivo, Contexto, Emprestimo,
  Importacao, Liquidacao, PagamentoCartao, Perspectivas, SaldoServidor,
} from './tipos'

export interface FiltroTransacao {
  contexto?: Contexto
  conta_id?: string
  cliente_id?: string
  categoria_id?: string
  tipo?: Transacao['tipo']
  status?: Transacao['status']
  em_aberto?: boolean
  /** Janela por competência. O store NÃO usa: saldo precisa do histórico
   *  inteiro (ver lib/financas-store.tsx). Fica para consulta pontual. */
  de?: string
  ate?: string
  limite?: number
}

export const financas = {
  /** Dados de referência numa chamada: contas, categorias, recorrências, metas. */
  bootstrap: () => call<{
    contas: Conta[]; categorias: Categoria[]; recorrencias: Recorrencia[]; metas: Meta[]
    /** Ausente até a edge ser publicada com a action; o store trata como []. */
    conferencias?: Conferencia[]
    /** Idem: ausente até a edge com empréstimos ser publicada. */
    emprestimos?: Emprestimo[]
    /** Saldo oficial por conta (RPC eloi_saldos_contas). Ausente/null = edge
     *  ou migração antigas; `saldos_erro` diz por quê. */
    saldos?: SaldoServidor[] | null
    saldos_erro?: string | null
  }>('eloi-financas', 'bootstrap'),

  /** `completo` vem do servidor (contagem com os mesmos filtros). Edge antiga
   *  não manda: aí `completo` é undefined e a tela não afirma nada. */
  transacoes: (filtro?: FiltroTransacao) =>
    call<{ transacoes: Transacao[]; total?: number | null; completo?: boolean; limite?: number }>(
      'eloi-financas', 'transacoes.list', filtro ? { filtro } : {}),
  /** Caixa realizado, resultado por competência e obrigações em aberto,
   *  calculados no banco sobre o histórico inteiro. */
  perspectivas: (de: string, ate: string, contexto?: Contexto) =>
    call<Perspectivas>('eloi-financas', 'relatorios.perspectivas', { de, ate, ...(contexto ? { contexto } : {}) }),
  /** Pagamentos/recebimentos de uma transação, mais antigo primeiro. */
  liquidacoes: (id: string) =>
    call<{ liquidacoes: Liquidacao[] }>('eloi-financas', 'transacoes.liquidacoes', { id }).then((r) => r.liquidacoes),
  /** Desfaz uma liquidação sem apagar: grava a negativa ligada a ela. */
  reverterLiquidacao: (liquidacao_id: string, motivo: string) =>
    call<{ transacao: Transacao }>('eloi-financas', 'transacoes.reverter_liquidacao', { liquidacao_id, motivo })
      .then((r) => r.transacao),
  salvar: (transacao: Partial<Transacao>) =>
    call<{ transacao: Transacao }>('eloi-financas', 'transacoes.upsert', { transacao }).then((r) => r.transacao),
  /** Baixa total ou parcial. `conta_id` quando o dinheiro caiu noutra conta;
   *  `observacoes` vai para o rodapé da transação, datada. */
  liquidar: (id: string, dados: {
    valor_cents: number; data_liquidacao?: string; forma_pagamento?: string
    conta_id?: string; observacoes?: string
    /** Idempotência: mesma chave = mesmo pagamento (clique duplo, retry). */
    chave?: string
  }) =>
    call<{ transacao: Transacao }>('eloi-financas', 'transacoes.liquidar', { id, ...dados })
      .then((r) => r.transacao),
  /** Extrato já lido e confirmado na tela. O servidor revalida e pula chave
   *  repetida nesta conta. Cartão entra pendente; conta comum, realizado. */
  importar: (dados: {
    conta_id: string; contexto?: Contexto
    linhas: { data: string; descricao: string; valor_cents: number; chave: string }[]
    /** Nome do arquivo e formato: identificam o lote para desfazer depois. */
    arquivo?: string; formato?: 'csv' | 'ofx'
  }) => call<{ importadas: number; ignoradas: number; lote: Importacao | null }>('eloi-financas', 'transacoes.importar', dados),
  /** Lotes de importação de uma conta, do mais recente. */
  importacoes: (conta_id: string) =>
    call<{ importacoes: Importacao[] }>('eloi-financas', 'importacoes.list', { conta_id }).then((r) => r.importacoes),
  /** Desfaz o lote inteiro (as linhas saem, com trilha). Recusado se alguma já
   *  foi paga, conciliada ou tem nota/arquivo. */
  desfazerImportacao: (id: string, motivo: string) =>
    call<{ lote: Importacao; removidas: number }>('eloi-financas', 'importacoes.reverter', { id, motivo }),
  /** Pagamentos feitos ao cartão e o que cada um quitou. */
  pagamentosDoCartao: (cartao_id: string) =>
    call<{ pagamentos: PagamentoCartao[] }>('eloi-financas', 'cartoes.pagamentos', { cartao_id }).then((r) => r.pagamentos),
  /** Estorno de pagamento de fatura: as compras voltam a dever e a transferência
   *  fica cancelada. Só para pagamento rastreado. */
  estornarPagamentoFatura: (id: string, motivo: string) =>
    call<{ transferencia_id: string; compras_reabertas: number }>(
      'eloi-financas', 'transacoes.estornar_pagamento_fatura', { id, motivo }),
  /** Fotografia sistema × extrato. O saldo do sistema é recalculado no servidor
   *  (`saldo_sistema_cents` da tela só serve para detectar tela desatualizada).
   *  `criar_ajuste` exige justificativa em `observacoes`. */
  registrarConferencia: (dados: {
    conta_id: string; data: string; saldo_informado_cents: number; saldo_sistema_cents: number
    observacoes?: string; criar_ajuste?: boolean
  }) => call<{ conferencia: Conferencia; ajuste: Transacao | null; saldo_sistema_cents?: number; tela_desatualizada?: boolean }>(
    'eloi-financas', 'conferencias.registrar', dados),
  /** Só o vencimento muda; o status volta a ser derivado no servidor. */
  reagendar: (id: string, data_vencimento: string) =>
    call<{ transacao: Transacao }>('eloi-financas', 'transacoes.reagendar', { id, data_vencimento })
      .then((r) => r.transacao),
  parcelar: (transacao: Partial<Transacao>, parcelas: number) =>
    call<{ transacoes: Transacao[]; grupo_id: string }>('eloi-financas', 'transacoes.parcelar',
      { transacao, parcelas }),
  /** Pagamento de fatura numa operação só no servidor: cria a transferência
   *  conta → cartão (neutra no resultado) E liquida as compras em aberto do
   *  cartão até `valor_cents`. `sobra_cents` > 0 = pagou mais do que havia
   *  em aberto. */
  pagarFatura: (dados: {
    cartao_id: string; conta_id: string; valor_cents: number; data: string
    /** Idempotência: o mesmo envio repetido não debita a conta duas vezes. */
    chave?: string
    /** Pagar sem compra em aberto (crédito antecipado) precisa ser explícito. */
    antecipado?: boolean
  }) =>
    call<{ transferencia: Transacao; liquidadas: number; sobra_cents: number }>(
      'eloi-financas', 'transacoes.pagar_fatura', dados),
  remover: (alvo: { id?: string; grupo_id?: string }) =>
    call<{ ok: true }>('eloi-financas', 'transacoes.remover', alvo),
  /** Estorno: preserva o lançamento no histórico e zera o efeito financeiro. */
  cancelar: (id: string, reabrir = false) =>
    call<{ transacao: Transacao }>('eloi-financas', 'transacoes.cancelar', { id, reabrir })
      .then((r) => r.transacao),

  /** `motivo` é obrigatório para mudar o saldo inicial de conta com lançamentos. */
  salvarConta: (conta: Partial<Conta>, motivo?: string) =>
    call<{ conta: Conta }>('eloi-financas', 'contas.upsert', { conta, ...(motivo ? { motivo } : {}) }).then((r) => r.conta),
  salvarCategoria: (categoria: Partial<Categoria>) =>
    call<{ categoria: Categoria }>('eloi-financas', 'categorias.upsert', { categoria }).then((r) => r.categoria),

  salvarRecorrencia: (recorrencia: Partial<Recorrencia>) =>
    call<{ recorrencia: Recorrencia }>('eloi-financas', 'recorrencias.upsert', { recorrencia })
      .then((r) => r.recorrencia),
  /** Pausar suspende a geração; encerrar tira do bootstrap. Nada apaga o que
   *  já foi gerado — parcela lançada é obrigação real. */
  estadoRecorrencia: (id: string, estado: 'pausar' | 'retomar' | 'encerrar') =>
    call<{ recorrencia: Recorrencia }>('eloi-financas', 'recorrencias.estado', { id, estado })
      .then((r) => r.recorrencia),
  /** Materializa as cobranças devidas. Idempotente por ocorrência no banco.
   *  `erros` lista recorrências que não geraram (ex.: sem conta). */
  gerarRecorrencias: () =>
    call<{ criadas: number; erros?: { recorrencia_id: string; vencimento: string; erro: string }[]; ocupado?: boolean }>(
      'eloi-financas', 'recorrencias.gerar'),

  notas: (filtro?: { status?: NotaFiscal['status']; cliente_id?: string; mes?: string }) =>
    call<{ notas: NotaFiscal[] }>('eloi-financas', 'nf.list', filtro ? { filtro } : {}).then((r) => r.notas),
  /** `servico_ids` define quais serviços a nota cobre (1 nota : N serviços).
   *  Omitir não mexe no vínculo; lista vazia desvincula todos. */
  salvarNota: (nota: Partial<NotaFiscal> & { servico_ids?: string[] }) =>
    call<{ nota: NotaFiscal }>('eloi-financas', 'nf.upsert', { nota }).then((r) => r.nota),
  removerNota: (id: string) => call<{ ok: true }>('eloi-financas', 'nf.remover', { id }),

  salvarMeta: (meta: Partial<Meta>) =>
    call<{ meta: Meta }>('eloi-financas', 'metas.upsert', { meta }).then((r) => r.meta),
  desativarMeta: (id: string) => call<{ ok: true }>('eloi-financas', 'metas.desativar', { id }),
  /** Sem id: cadastra e gera as parcelas que faltam. Com id: só nome, instituição,
   *  conta, categoria, valor recebido, observações e ativo — os campos estruturais
   *  não mudam (a edge devolve 409 se vierem diferentes). */
  salvarEmprestimo: (emprestimo: Partial<Emprestimo>) =>
    call<{ emprestimo: Emprestimo; transacoes?: Transacao[] }>('eloi-financas', 'emprestimos.upsert', { emprestimo })
      .then((r) => r.emprestimo),
  /** Sai do uso (ativo=false). As parcelas lançadas ficam como estão. */
  encerrarEmprestimo: (id: string) =>
    call<{ emprestimo: Emprestimo }>('eloi-financas', 'emprestimos.encerrar', { id }).then((r) => r.emprestimo),

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

/** As três categorias que o Storage aceita como pasta de entrega — o path é
 *  `<cliente>/entregas/<categoria>/<arquivo>` e a edge recusa qualquer outra.
 *  `nota_fiscal` e `outro` existem em MaterialCategoria mas não são pastas. */
export const CATEGORIAS_ENTREGA = ['arquivo', 'apresentacao', 'fonte'] as const
export type CategoriaEntrega = (typeof CATEGORIAS_ENTREGA)[number]

export const materiaisApi = {
  list: (filtro?: Record<string, unknown>) =>
    call<{ materiais: MaterialRow[] }>('eloi-gestao', 'materiais.list', filtro ? { filtro } : {}).then((r) => r.materiais),
  upsert: (material: Partial<MaterialRow> & { id?: string }) =>
    call<{ material: MaterialRow }>('eloi-gestao', 'materiais.upsert', { material }).then((r) => r.material),
  remover: (id: string) => call<{ ok: true }>('eloi-gestao', 'materiais.delete', { id }),

  /**
   * Sobe o binário da entrega direto do navegador para o bucket `eloi-entregas`
   * e devolve o `path` — o mesmo caminho que o portal do cliente vai assinar na
   * hora do download. O arquivo não passa pela edge (limite de corpo) e a
   * service_role não vaza. Registrar o material é o passo seguinte, separado:
   * binário no Storage sem linha na tabela é invisível; linha sem binário é
   * link quebrado. Nesta ordem, o pior caso é um órfão no bucket.
   */
  async enviarEntrega(file: File, cliente_id: string, categoria: CategoriaEntrega): Promise<string> {
    const { path, signed_url } = await call<{ path: string; signed_url: string }>(
      'eloi-gestao', 'entregas.upload_url', { cliente_id, categoria, filename: file.name })
    const res = await fetch(signed_url, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    })
    if (!res.ok) throw new Error(`falha no envio (${res.status})`)
    return path
  },

  /** Link temporário de leitura no bucket de entregas (privado, 120 s).
   *  NÃO é `nf.view_url`: aquela assina o bucket `eloi-notas`, que é outro. */
  urlEntrega: (path: string) =>
    call<{ url: string }>('eloi-gestao', 'entregas.view_url', { path }).then((r) => r.url),
}
