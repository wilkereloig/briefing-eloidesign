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

// ── núcleo financeiro (db/2026-08-04-gestao-eloi-financeiro.sql) ────────────
// Pessoal e empresa convivem nas MESMAS tabelas, separados por `contexto`. Duas
// árvores de tabela dariam dois lugares para calcular saldo consolidado.

export type Contexto = 'pessoal' | 'empresa'
export type TipoMov = 'entrada' | 'saida' | 'transferencia'
// 'cancelado' (masculino) porque é o rótulo REAL do enum eloi_status_mov no
// banco. Escrever 'cancelada' aqui fazia estaCancelada() nunca dar true: o
// lançamento cancelado continuava somando em saldo e resultado, e o chip caía
// no fallback "Previsto".
export type StatusMov = 'previsto' | 'pendente' | 'parcial' | 'realizado' | 'vencido' | 'cancelado'
export type TipoConta = 'corrente' | 'poupanca' | 'digital' | 'dinheiro' | 'cartao_credito'
  | 'investimento' | 'reserva' | 'outro'
export type StatusNF = 'pendente' | 'pronta' | 'emitida' | 'enviada' | 'cancelada' | 'substituida'

export interface Conta {
  id: string
  nome: string
  tipo: TipoConta
  contexto: Contexto
  instituicao: string | null
  cor: string | null
  saldo_inicial_cents: number
  /** Só cartão de crédito. */
  limite_cents: number | null
  dia_fechamento: number | null
  dia_vencimento: number | null
  ativa: boolean
  created_at: string
}

export interface Categoria {
  id: string
  nome: string
  contexto: Contexto
  tipo: TipoMov
  pai_id: string | null
  cor: string | null
  icone: string | null
  ativa: boolean
}

export interface Transacao {
  id: string
  tipo: TipoMov
  contexto: Contexto
  status: StatusMov
  descricao: string
  /** Combinado. Sempre cents inteiros e sempre > 0. */
  valor_cents: number
  /** Efetivamente movimentado. Pagamento parcial é primeira classe. */
  recebido_cents: number
  conta_id: string | null
  /** Só em transferência: o outro lado. */
  conta_destino_id: string | null
  categoria_id: string | null
  cliente_id: string | null
  servico_id: string | null
  fornecedor: string | null
  data_competencia: string | null
  data_vencimento: string | null
  data_liquidacao: string | null
  forma_pagamento: string | null
  /** Parcelas irmãs compartilham grupo_id. */
  grupo_id: string | null
  parcela_num: number | null
  parcela_de: number | null
  recorrencia_id: string | null
  observacoes: string | null
  created_at: string
}

export type Periodicidade = 'semanal' | 'quinzenal' | 'mensal' | 'bimestral'
  | 'trimestral' | 'semestral' | 'anual'

export interface Recorrencia {
  id: string
  nome: string
  tipo: TipoMov
  contexto: Contexto
  valor_cents: number
  periodicidade: Periodicidade
  dia_cobranca: number | null
  conta_id: string | null
  categoria_id: string | null
  fornecedor: string | null
  inicio: string
  fim: string | null
  proxima_cobranca: string | null
  ativa: boolean
  pausada_em: string | null
  encerrada_em: string | null
  observacoes: string | null
}

export interface NotaFiscal {
  id: string
  cliente_id: string | null
  servico_id: string | null
  transacao_id: string | null
  numero: string | null
  status: StatusNF
  valor_cents: number
  imposto_cents: number
  competencia: string | null
  emitida_em: string | null
  enviada_em: string | null
  arquivo_path: string | null
  observacoes: string | null
}

export interface Meta {
  id: string
  /** 'orcamento' limita gasto no período; 'meta' acumula rumo a um alvo. */
  especie: 'meta' | 'orcamento'
  nome: string
  contexto: Contexto
  categoria_id: string | null
  conta_id: string | null
  alvo_cents: number
  inicio: string
  fim: string | null
  ativa: boolean
}

export interface Arquivo {
  id: string
  titulo: string
  path: string
  mime: string | null
  tamanho_bytes: number | null
  categoria: 'contrato' | 'proposta' | 'nota_fiscal' | 'comprovante' | 'boleto'
    | 'documento' | 'relatorio' | 'outro'
  cliente_id: string | null
  servico_id: string | null
  transacao_id: string | null
  nota_fiscal_id: string | null
  created_at: string
}
