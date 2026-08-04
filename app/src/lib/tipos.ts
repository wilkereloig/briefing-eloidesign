// Campos batem com o schema real (db/*.sql) — não com admin-app/src/types/domain.ts,
// que tem nomes que nunca existiram no banco (criado_em, status, data). Ver
// CONTEXT.md e docs/superpowers/specs/2026-07-30-painel-interno-design.md.

export interface ClienteRow {
  id: string
  nome: string
  cor: string | null
  contato: string | null
  marca_slug: string | null
  marca_publicada: boolean
  created_at: string
  portal_ativo: boolean
  portal_senha_prefix: string | null
  portal_senha_gerada_em: string | null
  portal_tentativas_falhas: number
  portal_bloqueado_ate: string | null
  total_servicos: number
  total_cents: number
}

// clientes.detail (edge eloi-gestao) só seleciona um subconjunto de colunas —
// não inclui total_servicos/total_cents (só clientes.list calcula) nem os
// campos de bloqueio de portal. Ver edge-functions/eloi-gestao.ts.
export type ClienteDetalhe = Omit<ClienteRow, 'total_servicos' | 'total_cents' | 'portal_tentativas_falhas' | 'portal_bloqueado_ate'>

export type StatusExecucao = 'aguardando_inicio' | 'em_execucao' | 'concluida'

export interface ServicoRow {
  id: string
  cliente_id: string
  orcamento_id: string | null
  sub_cliente: string | null
  descricao: string
  valor_cents: number
  status_execucao: StatusExecucao
  pago: boolean
  data_pagamento: string | null
  data_competencia: string | null
  nf_numero: string | null
  nf_arquivo_url: string | null
  observacoes: string | null
  created_at: string
}

export type OrcamentoStatus = 'rascunho' | 'enviado' | 'aprovado' | 'recusado'

export interface OrcamentoRow {
  id: string
  created_at: string
  updated_at: string
  cliente: string | null
  cliente_id: string | null
  titulo: string
  status: OrcamentoStatus
  itens: unknown
  valor_total: number // REAIS, não cents — ver lib/dinheiro.ts:centsDeReais
  observacoes: string | null
  link: string | null
  share_token: string | null
  numero: number | null
  revogado_em: string | null
}

export type MovimentoStatus = 'previsto' | 'realizado' | 'cancelado'
export type MovimentoTipo = 'entrada' | 'saida'

export interface MovimentoRow {
  id: string
  caixa_id: string
  tipo: MovimentoTipo
  status: MovimentoStatus
  descricao: string
  valor_cents: number
  cliente_id: string | null
  servico_id: string | null
  orcamento_id: string | null
  data_competencia: string | null
  data_movimento: string | null
  forma_pagamento: string | null
  observacoes: string | null
}

export interface CaixaRow {
  id: string
  nome: string
  tipo: 'caixa' | 'conta_bancaria' | 'carteira' | 'cartao' | 'outro'
  saldo_inicial_cents: number
  saldo_cents: number
}

export type MaterialStatus = 'rascunho' | 'publicado' | 'arquivado'
export type MaterialCategoria = 'arquivo' | 'apresentacao' | 'fonte' | 'nota_fiscal' | 'outro'

export interface MaterialRow {
  id: string
  cliente_id: string
  servico_id: string | null
  titulo: string
  descricao: string | null
  categoria: MaterialCategoria
  versao: number | null
  status: MaterialStatus
  path: string
  published_at: string | null
  created_at: string
}

export interface BriefingLinkRow {
  id: string
  token: string
  cliente: string | null
  cliente_id: string | null
  tipo: string
  status: 'pendente' | 'respondido'
  created_at: string
  revogado_em: string | null
}

export interface BriefingLegadoRow {
  id: string
  created_at: string
  nome: string | null
  email: string | null
  whatsapp: string | null
  empresa?: string | null
  cliente_id?: string | null
  raw: unknown
}

export interface FinanceiroStats {
  faturado_cents: number
  recebido_cents: number
  a_receber_cents: number
  despesas_cents: number
  saldo_cents: number
  entradas_previstas_cents: number
  saidas_previstas_cents: number
  em_execucao: number
  concluido_sem_nf: number
  pagamentos_pendentes: number
}
