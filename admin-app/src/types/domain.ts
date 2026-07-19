export interface Cliente {
  id: string
  nome: string
  email?: string | null
  telefone?: string | null
  empresa?: string | null
  criado_em?: string
  [k: string]: unknown
}

export interface Servico {
  id: string
  cliente_id: string
  sub_cliente?: string | null
  titulo: string
  status?: string
  valor_cents: number
  orcamento_id?: string | null
  competencia?: string | null
  criado_em?: string
  [k: string]: unknown
}

export interface Orcamento {
  id: string
  cliente_id?: string | null
  cliente_nome?: string
  titulo?: string
  status: string
  valor_total: number
  servico_id: string | null
  criado_em?: string
  [k: string]: unknown
}

export interface Caixa {
  id: string
  nome: string
  saldo_cents: number
  [k: string]: unknown
}

export interface MovimentoFinanceiro {
  id: string
  caixa_id: string
  tipo: 'entrada' | 'saida'
  descricao: string
  valor_cents: number
  data?: string
  [k: string]: unknown
}

export interface Material {
  id: string
  cliente_id?: string
  titulo: string
  url?: string
  [k: string]: unknown
}
